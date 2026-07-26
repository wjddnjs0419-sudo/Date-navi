// lib/placeReview.ts
// 리뷰 화면 장소별 등급의 별점 유도 규칙(스펙 §5). UI에서 분리된 순수 로직.
import { Rating, deriveWantAgain } from './ratingFeedback';

export type PlaceSatisfaction = 'good' | 'bad';

// 긍정은 자동 전파(가점이라 틀려도 피해가 작다), 감점은 명시적 탭만.
export function initialPlaceSatisfactions(
  rating: Rating, stepIds: readonly string[],
): Record<string, PlaceSatisfaction> {
  if (!deriveWantAgain(rating)) return {};
  return Object.fromEntries(stepIds.map((id) => [id, 'good' as const]));
}

export function togglePlaceSatisfaction(
  current: PlaceSatisfaction | undefined, tapped: PlaceSatisfaction,
): PlaceSatisfaction | undefined {
  return current === tapped ? undefined : tapped;
}

export type PlaceFeedbackInput = {
  sessionId: string;
  stepId: string;
  satisfaction: PlaceSatisfaction | undefined;
  priceLevel: 1 | 2 | 3 | null;
};

export function placeFeedbackRpcArgs(input: PlaceFeedbackInput): {
  p_session_id: string; p_step_id: string; p_visited: boolean; p_tags: string[]; p_price_level: number | null;
} | null {
  if (input.satisfaction === undefined && input.priceLevel === null) return null;
  return {
    p_session_id: input.sessionId,
    p_step_id: input.stepId,
    p_visited: true,
    p_tags: input.satisfaction === 'good' ? ['revisit'] : [],
    p_price_level: input.priceLevel,
  };
}
