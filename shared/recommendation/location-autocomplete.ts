import type { RecommendationLocation } from './contracts.ts';

export const LOCATION_SUGGESTION_LIMIT = 8;
export const MIN_LOCATION_QUERY_LENGTH = 2;

export type KakaoLocationDocument = {
  id?: string;
  placeName: string;
  categoryName: string;
  categoryGroupCode: string;
  addressName: string;
  roadAddressName: string;
  x: string;
  y: string;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function shouldSearchLocations(query: string): boolean {
  return Array.from(query.trim()).length >= MIN_LOCATION_QUERY_LENGTH;
}

function locationKind(document: KakaoLocationDocument): RecommendationLocation['kind'] {
  const name = normalize(document.placeName);
  const category = normalize(document.categoryName);
  if (category.includes('지하철역') || category.includes('기차역') || name.endsWith('역')) return 'station';
  if (category.includes('지역') || /(?:동|읍|면|리)$/.test(name)) return 'neighborhood';
  if (category.includes('대학교') || category.includes('대학') || name.includes('대학교')) return 'school';
  if (
    document.categoryGroupCode === 'CT1'
    || category.includes('문화')
    || category.includes('예술')
    || category.includes('시장')
    || category.includes('쇼핑')
    || category.includes('공공')
    || category.includes('공원')
  ) return 'culture';
  if (
    document.categoryGroupCode === 'AT4'
    || category.includes('명소')
    || category.includes('관광')
    || /(?:광장|타워|궁|해변|숲)$/.test(name)
  ) return 'landmark';
  return 'place';
}

function isRestaurantOrCafe(document: KakaoLocationDocument): boolean {
  const category = normalize(document.categoryName);
  return document.categoryGroupCode === 'FD6'
    || document.categoryGroupCode === 'CE7'
    || category.includes('음식점')
    || category.includes('카페');
}

function isRelevantRestaurantOrCafe(query: string, document: KakaoLocationDocument): boolean {
  if (!isRestaurantOrCafe(document)) return true;
  const name = normalize(document.placeName);
  const category = normalize(document.categoryName);
  return name.includes(query) || category.includes(query);
}

function priority(query: string, document: KakaoLocationDocument, kind: RecommendationLocation['kind']): number {
  const name = normalize(document.placeName);
  if (name === query) return 0;
  if (!isRestaurantOrCafe(document) && name.startsWith(query)) return 1;
  if (kind === 'station') return 2;
  if (kind === 'neighborhood' || kind === 'landmark') return 3;
  if (kind === 'school' || kind === 'culture') return 4;
  return 5;
}

/**
 * Sorts and bounds provider documents without changing their provider shape.
 * The mobile client and the loginless Edge wrapper use this same ordering core.
 */
export function rankLocationDocuments(
  query: string,
  documents: KakaoLocationDocument[],
): KakaoLocationDocument[] {
  const normalizedQuery = normalize(query);
  if (!shouldSearchLocations(normalizedQuery)) return [];

  const seen = new Set<string>();
  return documents
    .map((document, index) => {
      const latitude = Number(document.y);
      const longitude = Number(document.x);
      if (!document.placeName.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      if (!isRelevantRestaurantOrCafe(normalizedQuery, document)) return null;
      const kind = locationKind(document);
      return { index, priority: priority(normalizedQuery, document, kind), document };
    })
    .filter((item): item is NonNullable<typeof item> => !!item)
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .filter(({ document }) => {
      const key = document.id?.trim()
        ? `place:${document.id.trim()}`
        : `coords:${latitudeKey(document.y)}:${latitudeKey(document.x)}:${document.placeName.trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, LOCATION_SUGGESTION_LIMIT)
    .map(({ document }) => document);
}

function latitudeKey(value: string): number {
  return Number(value);
}

export function toRecommendationLocations(
  query: string,
  documents: KakaoLocationDocument[],
): RecommendationLocation[] {
  return rankLocationDocuments(query, documents).flatMap((document) => {
    const latitude = Number(document.y);
    const longitude = Number(document.x);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const id = document.id?.trim();
    return [{
      source: 'kakao' as const,
      kakaoPlaceId: id || undefined,
      label: document.placeName.trim(),
      address: (document.roadAddressName || document.addressName).trim() || undefined,
      latitude,
      longitude,
      kind: locationKind(document),
    }];
  });
}
