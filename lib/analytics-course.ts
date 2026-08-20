import type { CourseDraft } from './course-draft';
import {
  isPreparedRequestExpiredError,
  RecommendationRequestError,
  type CourseFailureStage,
} from './recommend-date';

export type RecommendationRequestStartedParams = {
  mode: 'make_course';
  step_count: number;
  has_pinned_place: boolean;
  has_walking_limit: boolean;
  has_budget: boolean;
  has_duration: boolean;
  has_mood: boolean;
  has_additional_request: boolean;
};

export type RecommendationRequestFailedParams = {
  error_code:
    | 'prepared_request_expired'
    | 'course_validation_failed'
    | 'ai_request_already_running'
    | 'ai_rate_limited'
    | 'ai_daily_limit_reached'
    | 'step_intent_unsatisfied'
    | 'unknown';
  failure_stage?: CourseFailureStage;
};

export function buildRecommendationRequestStartedParams(draft: CourseDraft): RecommendationRequestStartedParams {
  return {
    mode: 'make_course',
    step_count: draft.steps.length,
    has_pinned_place: draft.steps.some((step) => step.pin != null),
    has_walking_limit: draft.maxWalkingMinutes != null,
    has_budget: draft.perPersonBudgetKRWInput.trim().length > 0,
    has_duration: draft.duration != null,
    has_mood: draft.moods.length > 0,
    has_additional_request: draft.additionalRequest.trim().length > 0,
  };
}

export function normalizeRecommendationRequestError(error: unknown): RecommendationRequestFailedParams {
  if (isPreparedRequestExpiredError(error)) return { error_code: 'prepared_request_expired' };
  if (!(error instanceof RecommendationRequestError)) return { error_code: 'unknown' };

  const errorCodeByRecommendationCode = {
    COURSE_VALIDATION_FAILED: 'course_validation_failed',
    AI_REQUEST_ALREADY_RUNNING: 'ai_request_already_running',
    AI_RATE_LIMITED: 'ai_rate_limited',
    AI_DAILY_LIMIT_REACHED: 'ai_daily_limit_reached',
    STEP_INTENT_UNSATISFIED: 'step_intent_unsatisfied',
  } as const;
  const errorCode = errorCodeByRecommendationCode[error.code as keyof typeof errorCodeByRecommendationCode];
  if (!errorCode) return { error_code: 'unknown' };
  return error.failureStage ? { error_code: errorCode, failure_stage: error.failureStage } : { error_code: errorCode };
}
