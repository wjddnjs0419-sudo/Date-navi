import type { RecommendationLanguage } from './contracts';

export type StepIntentTagSuggestion = {
  value: string;
  label: string;
  shipped: boolean;
};

type ShippedTag = { value: string; en: string };

const SUGGESTIONS_BY_CATEGORY: Record<string, readonly ShippedTag[]> = {
  meal: [
    { value: '라멘', en: 'Ramen' }, { value: '파스타', en: 'Pasta' },
    { value: '삼겹살', en: 'Pork belly' }, { value: '초밥', en: 'Sushi' },
    { value: '떡볶이', en: 'Tteokbokki' }, { value: '마라탕', en: 'Malatang' },
  ],
  cafe: [{ value: '루프탑 카페', en: 'Rooftop cafe' }, { value: '디저트', en: 'Dessert' }, { value: '북카페', en: 'Book cafe' }],
  drinks: [{ value: '와인바', en: 'Wine bar' }, { value: '칵테일', en: 'Cocktail' }, { value: '수제맥주', en: 'Craft beer' }],
  activity: [{ value: '보드게임', en: 'Board games' }, { value: '방탈출', en: 'Escape room' }, { value: '볼링', en: 'Bowling' }, { value: '클라이밍', en: 'Climbing' }],
  culture: [{ value: '전시', en: 'Exhibition' }, { value: '미술관', en: 'Art museum' }, { value: '공연', en: 'Performance' }],
  walk: [{ value: '한강 산책', en: 'Han River walk' }, { value: '공원 산책', en: 'Park walk' }],
};

const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function getStepIntentTagSuggestions(
  category: string,
  language: RecommendationLanguage = 'ko',
): StepIntentTagSuggestion[] {
  return (SUGGESTIONS_BY_CATEGORY[category] ?? []).map((tag) => ({
    value: tag.value,
    label: language === 'en' ? tag.en : tag.value,
    shipped: true,
  }));
}

export function canonicalizeStepIntentTag(tag: string): string {
  const normalized = normalize(tag);
  for (const tags of Object.values(SUGGESTIONS_BY_CATEGORY)) {
    const match = tags.find((entry) => normalize(entry.value) === normalized || normalize(entry.en) === normalized);
    if (match) return match.value;
  }
  return tag.trim().replace(/\s+/g, ' ');
}

export function localizeStepIntentTag(value: string, language: RecommendationLanguage): string {
  const canonical = canonicalizeStepIntentTag(value);
  for (const tags of Object.values(SUGGESTIONS_BY_CATEGORY)) {
    const match = tags.find((entry) => entry.value === canonical);
    if (match) return language === 'en' ? match.en : match.value;
  }
  return value;
}

export function isShippedStepIntentTag(value: string): boolean {
  const canonical = canonicalizeStepIntentTag(value);
  return Object.values(SUGGESTIONS_BY_CATEGORY).some((tags) => tags.some((tag) => tag.value === canonical));
}
