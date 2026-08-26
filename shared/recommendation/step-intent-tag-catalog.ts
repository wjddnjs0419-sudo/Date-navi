import type { RecommendationLanguage } from './contracts';

export type StepIntentTagSuggestion = {
  value: string;
  label: string;
  shipped: boolean;
};

export type CoursePreferenceOption = {
  value?: string;
  ko: string;
  en: string;
};

type ShippedTag = { value: string; en: string };

const SUGGESTIONS_BY_CATEGORY: Record<string, readonly ShippedTag[]> = {
  meal: [
    { value: '라멘', en: 'Ramen' }, { value: '파스타', en: 'Pasta' },
    { value: '삼겹살', en: 'Pork belly' }, { value: '초밥', en: 'Sushi' },
    { value: '떡볶이', en: 'Tteokbokki' }, { value: '마라탕', en: 'Malatang' },
  ],
  cafe: [
    { value: '루프탑 카페', en: 'Rooftop cafe' }, { value: '디저트', en: 'Dessert' }, { value: '북카페', en: 'Book cafe' },
  ],
  drinks: [{ value: '와인바', en: 'Wine bar' }, { value: '칵테일', en: 'Cocktail' }, { value: '수제맥주', en: 'Craft beer' }],
  activity: [{ value: '보드게임', en: 'Board games' }, { value: '방탈출', en: 'Escape room' }, { value: '볼링', en: 'Bowling' }, { value: '클라이밍', en: 'Climbing' }],
  culture: [{ value: '전시', en: 'Exhibition' }, { value: '미술관', en: 'Art museum' }, { value: '공연', en: 'Performance' }],
  walk: [
    { value: '한강 산책', en: 'Han River walk' }, { value: '공원 산책', en: 'Park walk' },
  ],
};

const COURSE_PREFERENCE_OPTIONS: Record<string, readonly CoursePreferenceOption[]> = {
  meal: [
    { ko: '아무거나', en: 'Anything' }, { value: '고기', ko: '고기', en: 'Meat' },
    { value: '한식', ko: '한식', en: 'Korean' }, { value: '일식', ko: '일식', en: 'Japanese' },
    { value: '양식', ko: '양식', en: 'Western' }, { value: '가볍게', ko: '가볍게', en: 'Light meal' },
  ],
  cafe: [
    { ko: '아무거나', en: 'Anything' }, { value: '조용한', ko: '조용한', en: 'Quiet' },
    { value: '감성적인', ko: '감성적인', en: 'Atmospheric' }, { value: '디저트', ko: '디저트', en: 'Dessert' },
    { value: '뷰 좋은', ko: '뷰 좋은', en: 'Good view' }, { value: '대화하기 좋은', ko: '대화하기 좋은', en: 'Good for conversation' },
  ],
  walk: [
    { ko: '아무거나', en: 'Anything' }, { value: '공원 산책', ko: '공원', en: 'Park' },
    { value: '한강 산책', ko: '강변', en: 'Riverside' }, { value: '골목 산책', ko: '골목', en: 'Alley' },
    { value: '야경 산책', ko: '야경', en: 'Night view' }, { value: '자연 산책', ko: '자연', en: 'Nature' },
  ],
};

for (const category of ['drinks', 'activity', 'culture'] as const) {
  COURSE_PREFERENCE_OPTIONS[category] = [
    { ko: '아무거나', en: 'Anything' },
    ...((SUGGESTIONS_BY_CATEGORY[category] ?? []).map((entry) => ({ value: entry.value, ko: entry.value, en: entry.en }))),
  ];
}

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

export function getCoursePreferenceOptions(
  category: string,
  language: RecommendationLanguage = 'ko',
): Array<CoursePreferenceOption & { label: string }> {
  return (COURSE_PREFERENCE_OPTIONS[category] ?? [{ ko: '아무거나', en: 'Anything' }]).map((option) => ({
    ...option,
    label: language === 'en' ? option.en : option.ko,
  }));
}

export function canonicalizeStepIntentTag(tag: string): string {
  const normalized = normalize(tag);
  const allTags: Array<{ value: string; en: string }> = [
    ...Object.values(SUGGESTIONS_BY_CATEGORY).flat(),
    ...Object.values(COURSE_PREFERENCE_OPTIONS).flatMap((options) => options.flatMap((option) => option.value ? [{ value: option.value, en: option.en }] : [])),
  ];
  for (const entry of allTags) {
    if (normalize(entry.value) === normalized || normalize(entry.en) === normalized) return entry.value;
  }
  return tag.trim().replace(/\s+/g, ' ');
}

export function localizeStepIntentTag(value: string, language: RecommendationLanguage): string {
  const canonical = canonicalizeStepIntentTag(value);
  for (const tags of Object.values(SUGGESTIONS_BY_CATEGORY)) {
    const match = tags.find((entry) => entry.value === canonical);
    if (match) return language === 'en' ? match.en : match.value;
  }
  for (const options of Object.values(COURSE_PREFERENCE_OPTIONS)) {
    const match = options.find((option) => option.value === canonical);
    if (match) return language === 'en' ? match.en : match.ko;
  }
  return value;
}

export function isShippedStepIntentTag(value: string): boolean {
  const canonical = canonicalizeStepIntentTag(value);
  return Object.values(SUGGESTIONS_BY_CATEGORY).some((tags) => tags.some((tag) => tag.value === canonical))
    || Object.values(COURSE_PREFERENCE_OPTIONS).some((options) => options.some((option) => option.value === canonical));
}
