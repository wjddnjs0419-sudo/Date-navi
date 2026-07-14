export type VerifiedCategoryFacts = {
  categoryGroupCode: string;
  categoryGroupName: string;
  categoryName: string;
  name: string;
};

const CATEGORY_CODES: Record<string, string | undefined> = {
  meal: 'FD6',
  restaurant: 'FD6',
  cafe: 'CE7',
  culture: 'CT1',
  walk: 'AT4',
  attraction: 'AT4',
};

const VERIFIED_CATEGORY_KEYWORDS: Record<string, readonly string[]> = {
  meal: ['음식점', '식당', '한식', '중식', '일식', '양식', '레스토랑'],
  cafe: ['카페', '커피', '디저트'],
  culture: ['문화시설', '미술관', '박물관', '전시', '공연장', '극장'],
  walk: ['관광명소', '공원', '산책', '정원'],
  drinks: ['술집', '주점', '이자카야', '와인바', '칵테일바', '펍', '포차', '포장마차', '호프'],
  activity: ['액티비티', '체험', '영화관', '볼링', '방탈출', '공방', '놀이공원', '테마파크'],
};

export function normalizeRecommendationCategory(category: string): string {
  if (category === 'restaurant') return 'meal';
  if (category === 'bar') return 'drinks';
  if (category === 'attraction') return 'walk';
  return category;
}

export function verifiedPlaceMatchesCategory(
  place: VerifiedCategoryFacts,
  category: string,
): boolean {
  const normalized = normalizeRecommendationCategory(category);
  if (normalized === 'ai_decide') return true;
  const code = CATEGORY_CODES[normalized];
  if (code && place.categoryGroupCode) return place.categoryGroupCode === code;
  const keywords = VERIFIED_CATEGORY_KEYWORDS[normalized] ?? [];
  const haystack = `${place.categoryGroupName} ${place.categoryName} ${place.name}`
    .normalize('NFKC')
    .toLocaleLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}
