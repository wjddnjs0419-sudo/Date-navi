import { supabase } from './supabase';
import type { AppLanguage } from './i18n';
import type { StructuredCourseInput } from './course-draft';
import type { RecommendationErrorCode } from '../shared/recommendation/contracts';
import { RecommendationSessionCacheError } from './recommendation-session-cache';
import {
  recommendDateResponseSchema,
  recommendationRequestSchema,
  validateRecommendDateResponseForRequest,
  type RecommendDateCard,
  type RecommendationRequest,
} from '../shared/recommendation/schemas';

const recommendationErrorCodes = new Set<RecommendationErrorCode>([
  'LOCATION_REQUIRED', 'INVALID_INPUT', 'PLACE_SEARCH_TIMEOUT', 'PLACE_SEARCH_RATE_LIMITED',
  'INSUFFICIENT_CANDIDATES', 'STEP_INTENT_UNSATISFIED', 'AI_TIMEOUT', 'AI_INVALID_RESPONSE',
  'COURSE_VALIDATION_FAILED', 'AUTH_EXPIRED', 'NETWORK_ERROR', 'UNKNOWN',
]);

const courseFailureStages = new Set([
  'course_build',
  'response_schema',
  'request_response_validation',
  'stage_attestation',
] as const);

export type CourseFailureStage = typeof courseFailureStages extends Set<infer Stage> ? Stage : never;

export type UnsatisfiedStepIntent = {
  canonicalTerm: string;
  displayLabel: { ko: string; en: string };
};

export class RecommendationRequestError extends Error {
  constructor(
    public readonly code: RecommendationErrorCode,
    public readonly failureStage?: CourseFailureStage,
    public readonly unsatisfiedIntents?: UnsatisfiedStepIntent[],
  ) {
    super(code);
    this.name = 'RecommendationRequestError';
  }
}

function parseUnsatisfiedIntents(value: unknown): UnsatisfiedStepIntent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const intents = value.flatMap((item) => {
    const entry = (item ?? {}) as Record<string, unknown>;
    const label = (entry.displayLabel ?? {}) as Record<string, unknown>;
    if (typeof entry.canonicalTerm === 'string' && typeof label.ko === 'string' && typeof label.en === 'string') {
      return [{ canonicalTerm: entry.canonicalTerm, displayLabel: { ko: label.ko, en: label.en } }];
    }
    return [];
  });
  return intents.length > 0 ? intents : undefined;
}

export function isPreparedRequestExpiredError(error: unknown): boolean {
  return error instanceof RecommendationSessionCacheError && error.code === 'missing_prepared_request';
}

// 서버 step-intent 파서의 required 마커와 동일 집합. 완화 재요청 시 제거해 required→preferred로 낮춘다.
const REQUIRED_MARKER_PATTERN = /(?:무조건|반드시|꼭)|\b(?:only|must|has to be)\b/gi;

/** required 마커를 제거해 조건을 완화한다(공백 정리 포함). */
export function relaxRequiredMarkers(additionalRequest: string | undefined): string {
  if (!additionalRequest) return '';
  return additionalRequest.replace(REQUIRED_MARKER_PATTERN, ' ').replace(/\s{2,}/g, ' ').trim();
}

async function toRecommendationRequestError(error: unknown): Promise<RecommendationRequestError> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  let payload: unknown;
  try { payload = await context?.json?.(); } catch { payload = undefined; }
  const errorPayload = (payload as { error?: Record<string, unknown> } | null)?.error;
  const code = errorPayload?.code;
  const failureStage = errorPayload?.failureStage;
  const typedCode =
    typeof code === 'string' && recommendationErrorCodes.has(code as RecommendationErrorCode)
      ? code as RecommendationErrorCode
      : 'NETWORK_ERROR';
  return new RecommendationRequestError(
    typedCode,
    typedCode === 'COURSE_VALIDATION_FAILED'
      && typeof failureStage === 'string'
      && courseFailureStages.has(failureStage as CourseFailureStage)
      ? failureStage as CourseFailureStage
      : undefined,
    typedCode === 'STEP_INTENT_UNSATISFIED'
      ? parseUnsatisfiedIntents(errorPayload?.unsatisfiedIntents)
      : undefined,
  );
}

export function buildRecommendationRequest(
  courseDraft: StructuredCourseInput,
  requestId: string,
  language: AppLanguage,
): RecommendationRequest {
  return recommendationRequestSchema.parse({
    ...courseDraft,
    requestId,
    mode: 'course',
    language,
  });
}

export async function requestRecommendationCards(
  request: RecommendationRequest,
): Promise<RecommendDateCard[]> {
  const response = await requestRecommendationResponse(request);
  return response.cards;
}

export async function requestRecommendationResponse(
  request: RecommendationRequest,
  options: { signal?: AbortSignal } = {},
): Promise<import('../shared/recommendation/schemas').RecommendDateResponse> {
  if (typeof supabase.rpc === 'function') {
    const { error: consentError } = await supabase.rpc('record_ai_data_processing_consent');
    if (consentError) throw consentError;
  }
  const { data, error } = await supabase.functions.invoke('recommend-date', {
    body: request,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (error) throw await toRecommendationRequestError(error);

  const response = recommendDateResponseSchema.parse(data);
  validateRecommendDateResponseForRequest(request, response);
  return response;
}
