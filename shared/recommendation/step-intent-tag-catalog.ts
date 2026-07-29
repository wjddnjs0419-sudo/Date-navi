export const MAX_STEP_INTENT_TAGS = 6;

const SUGGESTIONS_BY_CATEGORY: Record<string, readonly string[]> = {
  meal: ['라멘', '파스타', '삼겹살', '초밥', '떡볶이', '마라탕'],
  cafe: ['루프탑 카페', '디저트', '북카페'],
  drinks: ['와인바', '칵테일', '수제맥주'],
  activity: ['보드게임', '방탈출', '볼링', '클라이밍'],
  culture: ['전시', '미술관', '공연'],
  walk: ['한강 산책', '공원 산책'],
};

export function getStepIntentTagSuggestions(category: string): readonly string[] {
  return SUGGESTIONS_BY_CATEGORY[category] ?? [];
}
