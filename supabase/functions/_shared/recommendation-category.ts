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

// 데이트에 부적합한 카카오 카테고리 그룹코드. 적합 코드(FD6·CE7·CT1·AT4)만 통과.
export const UNFIT_CATEGORY_GROUP_CODES = new Set<string>([
  'HP8', // 병원
  'PM9', // 약국
  'AD5', // 숙박(모텔)
  'BK9', // 은행
  'PK6', // 주차장
  'OL7', // 주유소·충전소
  'SW8', // 지하철역
  'MT1', // 대형마트
  'CS2', // 편의점
  'PS3', // 어린이집·유치원
  'SC4', // 학교
  'AC5', // 학원
  'AG2', // 중개업소(부동산)
  'PO3', // 공공기관
]);

// 허용 그룹코드 안에 숨은 부적합 장소를 categoryName 부분일치로 제거.
export const UNFIT_CATEGORY_NAME_KEYWORDS: readonly string[] = [
  '키즈카페',
  '모텔',
  '무인텔',
  '병원',
  '산부인과',
  '성인',
];

export function isUnfitDatePlace(
  place: { categoryGroupCode: string; categoryName: string },
): boolean {
  if (place.categoryGroupCode && UNFIT_CATEGORY_GROUP_CODES.has(place.categoryGroupCode)) return true;
  const name = (place.categoryName ?? '').normalize('NFKC');
  return UNFIT_CATEGORY_NAME_KEYWORDS.some((keyword) => name.includes(keyword));
}

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
