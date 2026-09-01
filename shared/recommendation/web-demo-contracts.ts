import { z } from 'zod';

import type { RecommendationLanguage, RecommendationRequest as RecommendationRequestContract } from './contracts.ts';
import {
  recommendDateResponseSchema,
  type RecommendDateResponse,
} from './schemas.ts';

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);

export const webDemoCategorySchema = z.enum([
  'meal',
  'cafe',
  'drinks',
  'activity',
  'culture',
  'walk',
  'ai_decide',
]);

const webDemoStepSchema = z.object({
  id: nonEmptyText(80),
  category: webDemoCategorySchema,
  intentTags: z.array(nonEmptyText(40)).max(1).optional(),
}).strict();

const isoLikeMeetingTimeSchema = z.string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)
    && !Number.isNaN(Date.parse(value))
  ), { message: 'meetingTime must be an ISO-like timestamp.' });

export const webDemoRecommendationRequestSchema = z.object({
  courseSteps: z.array(webDemoStepSchema).min(2).max(4),
  location: z.object({
    source: z.enum(['kakao', 'current']),
    label: nonEmptyText(120),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    kakaoPlaceId: nonEmptyText(120).optional(),
  }).strict(),
  meetingTime: isoLikeMeetingTimeSchema,
  moods: z.array(nonEmptyText(80)).max(6),
  maxWalkingMinutes: z.union([z.literal(5), z.literal(10), z.literal(20)]).optional(),
  language: z.enum(['ko', 'en']),
}).strict().superRefine((request, ctx) => {
  if (new Set(request.courseSteps.map((step) => step.id)).size !== request.courseSteps.length) {
    ctx.addIssue({ code: 'custom', path: ['courseSteps'], message: 'Course step IDs must be unique.' });
  }
  if (new Set(request.moods).size !== request.moods.length) {
    ctx.addIssue({ code: 'custom', path: ['moods'], message: 'Moods must be unique.' });
  }
});

export type WebDemoRecommendationRequest = z.infer<typeof webDemoRecommendationRequestSchema>;

export type WebDemoPlace = {
  stepId: string;
  order: number;
  name: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  provider: 'naver' | 'kakao';
  mapUrl: string;
  rating?: number;
  photoUrl?: string;
};

export type WebDemoRetryContext = {
  attempt: 0 | 1;
  replacementStepId?: string;
  excludedPlaceIds?: string[];
};

export type WebDemoInternalResponse = RecommendDateResponse & {
  retryContext: WebDemoRetryContext;
};

export type PublicWebDemoResponse<T> = T;

const CATEGORY_LABELS: Record<RecommendationLanguage, Record<WebDemoRecommendationRequest['courseSteps'][number]['category'], string>> = {
  ko: {
    meal: '식사',
    cafe: '카페',
    drinks: '술집',
    activity: '액티비티',
    culture: '문화',
    walk: '산책',
    ai_decide: 'AI가 결정',
  },
  en: {
    meal: 'Meal',
    cafe: 'Cafe',
    drinks: 'Drinks',
    activity: 'Activity',
    culture: 'Culture',
    walk: 'Walk',
    ai_decide: 'AI decides',
  },
};

function defaultRequestId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) throw new Error('Secure request ID generation is unavailable.');
  return randomUUID();
}

function meetingTimeNote(input: WebDemoRecommendationRequest): string {
  return input.language === 'en'
    ? `Meeting time: ${input.meetingTime}`
    : `만날 시간: ${input.meetingTime}`;
}

export function toRecommendationRequest(
  input: WebDemoRecommendationRequest,
  requestIdFactory: () => string = defaultRequestId,
): RecommendationRequestContract {
  const parsed = webDemoRecommendationRequestSchema.parse(input);
  const labels = CATEGORY_LABELS[parsed.language];
  const requestId = requestIdFactory().trim();
  if (!requestId) throw new Error('requestIdFactory must return a non-empty ID.');

  return {
    requestId,
    mode: 'course',
    language: parsed.language,
    location: {
      source: parsed.location.source,
      label: parsed.location.label,
      latitude: parsed.location.latitude,
      longitude: parsed.location.longitude,
      kind: parsed.location.source === 'current' ? 'current' : 'place',
      ...(parsed.location.kakaoPlaceId ? { kakaoPlaceId: parsed.location.kakaoPlaceId } : {}),
    },
    courseSteps: parsed.courseSteps.map((step) => ({
      id: step.id,
      category: step.category,
      label: labels[step.category],
      ...(step.intentTags ? { intentTags: [...step.intentTags] } : {}),
    })),
    moods: [...parsed.moods],
    ...(parsed.maxWalkingMinutes === undefined ? {} : { maxWalkingMinutes: parsed.maxWalkingMinutes }),
    additionalRequest: meetingTimeNote(parsed),
  };
}

function stripPrivateFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripPrivateFields(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'candidateId' && key !== 'sessionId' && key !== 'retryContext')
      .map(([key, entry]) => [key, stripPrivateFields(entry)]),
  );
}

export function toPublicWebDemoResponse<T>(input: T): PublicWebDemoResponse<T> {
  return stripPrivateFields(input) as PublicWebDemoResponse<T>;
}

export function parseWebDemoInternalResponse(input: unknown): WebDemoInternalResponse {
  const { retryContext, ...recommendationResponse } = (input ?? {}) as Record<string, unknown>;
  const parsed = recommendDateResponseSchema.parse(recommendationResponse);
  if (!retryContext || typeof retryContext !== 'object' || Array.isArray(retryContext)) {
    throw new Error('Web demo response is missing retry context.');
  }
  return { ...parsed, retryContext: retryContext as WebDemoRetryContext };
}
