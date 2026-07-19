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

export class RecommendationRequestError extends Error {
  constructor(
    public readonly code: RecommendationErrorCode,
    public readonly failureStage?: CourseFailureStage,
  ) {
    super(code);
    this.name = 'RecommendationRequestError';
  }
}

export function isPreparedRequestExpiredError(error: unknown): boolean {
  return error instanceof RecommendationSessionCacheError && error.code === 'missing_prepared_request';
}

async function toRecommendationRequestError(error: unknown): Promise<RecommendationRequestError> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  let payload: unknown;
  try { payload = await context?.json?.(); } catch { payload = undefined; }
  const code = (payload as { error?: { code?: unknown } } | null)?.error?.code;
  const failureStage = (payload as { error?: { failureStage?: unknown } } | null)?.error?.failureStage;
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
