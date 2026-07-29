import { z } from 'zod';

import type { RecommendationError, RecommendationErrorCode } from './contracts.ts';

export const RECOMMENDATION_ERROR_METADATA: Record<RecommendationErrorCode, Omit<RecommendationError, 'code'>> = {
  LOCATION_REQUIRED: { messages: { ko: '데이트 지역을 먼저 선택해 주세요.', en: 'Choose a date area first.' }, retryable: false, requiresConditionEdit: true },
  INVALID_INPUT: { messages: { ko: '입력 조건을 다시 확인해 주세요.', en: 'Check the recommendation conditions and try again.' }, retryable: false, requiresConditionEdit: true },
  PLACE_SEARCH_TIMEOUT: { messages: { ko: '장소 검색 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.', en: 'Place search timed out. Please try again shortly.' }, retryable: true, requiresConditionEdit: false },
  PLACE_SEARCH_RATE_LIMITED: { messages: { ko: '장소 검색 요청이 많아요. 잠시 후 다시 시도해 주세요.', en: 'Too many place searches. Please try again shortly.' }, retryable: true, requiresConditionEdit: false },
  INSUFFICIENT_CANDIDATES: { messages: { ko: '조건에 맞는 장소가 충분하지 않아요. 지역이나 조건을 조금 바꿔 주세요.', en: 'There are not enough matching places. Try adjusting the area or conditions.' }, retryable: false, requiresConditionEdit: true },
  STEP_INTENT_UNSATISFIED: {
    messages: {
      ko: '요청한 조건에 딱 맞는 장소를 근처에서 찾지 못했어요. 조건을 조금 완화하거나 지역을 넓혀 주세요.',
      en: 'We could not find nearby places matching that specific request. Try relaxing it or widening the area.',
    },
    retryable: false,
    requiresConditionEdit: true,
  },
  STEP_PIN_UNAVAILABLE: {
    messages: {
      ko: '지정한 장소를 확인하지 못했어요. 다른 장소를 골라 주세요.',
      en: "We couldn't verify the place you picked. Please choose another place.",
    },
    retryable: false,
    requiresConditionEdit: true,
  },
  AI_TIMEOUT: { messages: { ko: '추천을 정리하는 데 시간이 오래 걸려요. 다시 시도해 주세요.', en: 'Recommendation generation took too long. Please try again.' }, retryable: true, requiresConditionEdit: false },
  AI_INVALID_RESPONSE: { messages: { ko: '추천 결과를 확인하지 못했어요. 다시 시도해 주세요.', en: 'We could not validate the recommendation. Please try again.' }, retryable: true, requiresConditionEdit: false },
  AI_REQUEST_ALREADY_RUNNING: { messages: { ko: '이미 코스를 만들고 있어요. 잠시만 기다려 주세요.', en: 'A course is already being created. Please wait a moment.' }, retryable: true, requiresConditionEdit: false },
  AI_RATE_LIMITED: { messages: { ko: '짧은 시간에 생성 요청이 많아요. 잠시 후 다시 시도해 주세요.', en: 'Too many course requests in a short time. Please try again shortly.' }, retryable: true, requiresConditionEdit: false },
  AI_DAILY_LIMIT_REACHED: { messages: { ko: '오늘의 코스 생성 횟수를 모두 사용했어요. 자정 이후 다시 시도해 주세요.', en: 'You have used today’s course generations. Please try again after midnight.' }, retryable: true, requiresConditionEdit: false },
  AI_LIMIT_UNAVAILABLE: { messages: { ko: '생성 한도를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', en: 'We could not verify your generation limit. Please try again shortly.' }, retryable: true, requiresConditionEdit: false },
  COURSE_VALIDATION_FAILED: { messages: { ko: '코스 조건을 모두 만족하는 결과를 만들지 못했어요. 조건을 조정해 주세요.', en: 'We could not build a course that satisfies every condition. Try adjusting the conditions.' }, retryable: false, requiresConditionEdit: true },
  AUTH_EXPIRED: { messages: { ko: '로그인이 만료됐어요. 다시 로그인해 주세요.', en: 'Your session has expired. Please sign in again.' }, retryable: false, requiresConditionEdit: false },
  NETWORK_ERROR: { messages: { ko: '네트워크 연결을 확인한 뒤 다시 시도해 주세요.', en: 'Check your network connection and try again.' }, retryable: true, requiresConditionEdit: false },
  UNKNOWN: { messages: { ko: '추천을 만들지 못했어요. 잠시 후 다시 시도해 주세요.', en: 'We could not create a recommendation. Please try again shortly.' }, retryable: true, requiresConditionEdit: false },
};

export const recommendationErrorSchema = z.object({
  code: z.enum(['LOCATION_REQUIRED', 'INVALID_INPUT', 'PLACE_SEARCH_TIMEOUT', 'PLACE_SEARCH_RATE_LIMITED', 'INSUFFICIENT_CANDIDATES', 'STEP_INTENT_UNSATISFIED', 'STEP_PIN_UNAVAILABLE', 'AI_TIMEOUT', 'AI_INVALID_RESPONSE', 'AI_REQUEST_ALREADY_RUNNING', 'AI_RATE_LIMITED', 'AI_DAILY_LIMIT_REACHED', 'AI_LIMIT_UNAVAILABLE', 'COURSE_VALIDATION_FAILED', 'AUTH_EXPIRED', 'NETWORK_ERROR', 'UNKNOWN']),
  messages: z.object({ ko: z.string().min(1), en: z.string().min(1) }),
  retryable: z.boolean(),
  requiresConditionEdit: z.boolean(),
});

export function createRecommendationError(code: RecommendationErrorCode): RecommendationError {
  return recommendationErrorSchema.parse({ code, ...RECOMMENDATION_ERROR_METADATA[code] });
}
