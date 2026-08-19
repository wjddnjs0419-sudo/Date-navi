import type { NormalizedPlace } from './place-provider.ts';
import { normalizeKakaoPlace } from './place-provider.ts';
import type { KakaoDocument } from './recommendation-search.ts';

// 주소/장소명이 일치하면 지도 제공처별 핀 오차를 허용한다. 좌표는
// 주소가 같은 동명이 매장을 잘못 연결하지 않도록 보조 안전장치로만 쓴다.
const MAX_LINK_DISTANCE_METERS = 100;

function normalize(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[()[\]{}.,·]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function normalizePlaceName(value: string | undefined): string {
  const normalized = normalize(value);
  // 제공처마다 직영점/본점/지점을 붙이거나 생략한다. 실제 지점명(예:
  // 외대역)은 남기고, 마지막의 지점 표기만 제거해 비교한다.
  return normalized.replace(/(?:직영|본|지)?점$/u, '');
}

function samePlaceName(a: string | undefined, b: string | undefined): boolean {
  return normalizePlaceName(a) === normalizePlaceName(b);
}

function roadAddress(place: NormalizedPlace): string {
  return normalize(place.address?.road ?? place.address?.display);
}

function distanceMeters(a: NonNullable<NormalizedPlace['coordinates']>, b: NonNullable<NormalizedPlace['coordinates']>): number {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const h = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export async function resolveKakaoPlaceLink(
  naverPlace: NormalizedPlace,
  searchKakao: (query: string) => Promise<NormalizedPlace[]>,
): Promise<{ kakaoPlaceId: string; mapUrl: string } | undefined> {
  if (naverPlace.identity.provider !== 'naver' || !naverPlace.coordinates || !roadAddress(naverPlace)) return undefined;
  const addressQuery = naverPlace.address?.road ?? naverPlace.address?.display ?? '';
  const primaryQuery = `${naverPlace.name} ${addressQuery}`;
  const seen = new Set<string>();
  const candidates: NormalizedPlace[] = [];
  const addCandidates = (results: NormalizedPlace[]) => results.forEach((candidate) => {
    const key = `${candidate.identity.provider}:${candidate.identity.providerPlaceId}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  });
  const eligibleCandidates = () => candidates.filter((candidate) => (
    candidate.identity.provider === 'kakao'
    && Boolean(candidate.coordinates)
    && roadAddress(candidate) === roadAddress(naverPlace)
    && distanceMeters(naverPlace.coordinates!, candidate.coordinates!) <= MAX_LINK_DISTANCE_METERS
    && Boolean(candidate.legacy?.kakaoPlaceId && candidate.mapUrl)
  ));
  // 주소를 먼저 검색하면 제공처별 장소명 표기 차이 때문에 검색 결과 자체를
  // 놓치는 일을 줄일 수 있다. 주소 결과 안에서 이름이 호환되는 후보를 우선 선택한다.
  addCandidates(await searchKakao(addressQuery));
  const addressEligible = eligibleCandidates();
  const addressNamedMatches = addressEligible.filter((candidate) => samePlaceName(candidate.name, naverPlace.name));
  if (addressNamedMatches.length === 1) {
    return { kakaoPlaceId: addressNamedMatches[0].legacy!.kakaoPlaceId!, mapUrl: addressNamedMatches[0].mapUrl! };
  }
  // 주소 검색이 비었거나 이름으로 좁히지 못한 경우에만 보조 검색을 한다.
  for (const query of [primaryQuery, naverPlace.name]) {
    if (!query || query === addressQuery) continue;
    addCandidates(await searchKakao(query));
    const namedMatches = eligibleCandidates().filter((candidate) => samePlaceName(candidate.name, naverPlace.name));
    if (namedMatches.length === 1) {
      return { kakaoPlaceId: namedMatches[0].legacy!.kakaoPlaceId!, mapUrl: namedMatches[0].mapUrl! };
    }
  }
  const eligible = eligibleCandidates();
  // 같은 주소에 여러 업장이 있을 수 있으므로, 이름이 호환되는 후보가 하나면
  // 그것을 우선한다. 이름으로도 좁혀지지 않고 주소·좌표 후보가 하나뿐인 경우는
  // 주소가 동일하다는 강한 신호를 사용해 연결한다.
  const namedMatches = eligible.filter((candidate) => samePlaceName(candidate.name, naverPlace.name));
  const matches = namedMatches.length === 1 ? namedMatches : eligible.length === 1 ? eligible : [];
  if (matches.length !== 1) return undefined;
  return { kakaoPlaceId: matches[0].legacy!.kakaoPlaceId!, mapUrl: matches[0].mapUrl! };
}

/** Small, uncached keyword lookup used only for selected Naver places. */
export async function searchKakaoPlacesForLink(input: {
  query: string;
  kakaoRestApiKey: string;
  fetcher: typeof fetch;
}): Promise<NormalizedPlace[]> {
  if (!input.kakaoRestApiKey) return [];
  try {
    const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    url.searchParams.set('query', input.query);
    url.searchParams.set('size', '5');
    const response = await input.fetcher(url, { headers: { Authorization: `Kakao ${input.kakaoRestApiKey}` } });
    if (!response.ok) return [];
    const payload = await response.json() as { documents?: KakaoDocument[] };
    return (payload.documents ?? []).flatMap((document) => {
      const kakaoPlaceId = document.id?.trim();
      const name = document.place_name?.trim();
      const latitude = Number(document.y);
      const longitude = Number(document.x);
      if (!kakaoPlaceId || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      return [normalizeKakaoPlace({
      kakaoPlaceId,
      name,
      categoryGroupCode: document.category_group_code ?? '',
      categoryGroupName: document.category_group_name ?? '',
      categoryName: document.category_name ?? '',
      address: document.address_name ?? '',
      roadAddress: document.road_address_name ?? '',
      latitude,
      longitude,
      mapUrl: document.place_url ?? '',
      matchedSearchEvidence: [{ queryId: 'kakao_link', source: 'keyword', page: 1, queryText: input.query, phase: 'fallback' }],
      })];
    });
  } catch {
    return [];
  }
}
