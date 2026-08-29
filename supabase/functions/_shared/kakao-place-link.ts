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

function branchAgnosticSearchName(value: string): string | undefined {
  const withoutTerminalBranch = value.trim().replace(/\s+[^\s]*(?:직영점|본점|지점)$/u, '').trim();
  return withoutTerminalBranch && withoutTerminalBranch !== value.trim() ? withoutTerminalBranch : undefined;
}

function samePlaceName(a: string | undefined, b: string | undefined): boolean {
  return normalizePlaceName(a) === normalizePlaceName(b);
}

function roadAddress(place: NormalizedPlace): string {
  return normalize(place.address?.road ?? place.address?.display);
}

function canonicalAdministrativeToken(token: string): string {
  const aliases: Record<string, string> = {
    서울특별시: '서울', 서울시: '서울',
    부산광역시: '부산', 부산시: '부산',
    대구광역시: '대구', 대구시: '대구',
    인천광역시: '인천', 인천시: '인천',
    광주광역시: '광주', 광주시: '광주',
    대전광역시: '대전', 대전시: '대전',
    울산광역시: '울산', 울산시: '울산',
    세종특별자치시: '세종', 세종시: '세종',
  };
  return aliases[token] ?? token;
}

function addressKeys(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const tokens = value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[()[\]{}.,·]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(canonicalAdministrativeToken);
  const keys = [`full:${tokens.join('')}`];
  const numberedAddressKey = (kind: 'road' | 'parcel', locationPattern: RegExp) => {
    const locationIndex = tokens.findIndex((token) => locationPattern.test(token));
    if (locationIndex < 0) return;
    const numberIndex = tokens.findIndex((token, index) => index > locationIndex && /^[0-9]+(?:-[0-9]+)?$/u.test(token));
    if (numberIndex < 0) return;
    keys.push(`${kind}:${tokens.slice(0, numberIndex + 1).join('|')}`);
  };
  numberedAddressKey('road', /(?:대로|로|길)/u);
  numberedAddressKey('parcel', /(?:동|읍|면|리|가)$/u);
  return [...new Set(keys)];
}

function addressMatchKeys(place: NormalizedPlace): string[] {
  return [...new Set([
    ...addressKeys(place.address?.road),
    ...addressKeys(place.address?.display),
  ])];
}

function sharesAddress(a: NormalizedPlace, b: NormalizedPlace): boolean {
  const bAddresses = new Set(addressMatchKeys(b));
  return addressMatchKeys(a).some((address) => bAddresses.has(address));
}

function distanceMeters(a: NonNullable<NormalizedPlace['coordinates']>, b: NonNullable<NormalizedPlace['coordinates']>): number {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const h = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export type KakaoPlaceLinkFailureReason =
  | 'not_naver_place'
  | 'missing_coordinates_or_address'
  | 'no_eligible_candidate'
  | 'ambiguous_candidate';

export type KakaoPlaceLinkDiagnostics = {
  queryCount: number;
  queryResults: Array<{ resultCount: number; outcome: string; statusCode?: number }>;
  candidateCount: number;
  candidates: Array<{ name: string; address: string; roadAddress: string }>;
  eligibleCount: number;
  namedMatchCount: number;
  rejectionCounts: {
    nonKakao: number;
    missingCoordinates: number;
    addressMismatch: number;
    distanceExceeded: number;
    missingKakaoId: number;
    missingMapUrl: number;
  };
};

export type KakaoPlaceLinkResolution = {
  link?: { kakaoPlaceId: string; mapUrl: string };
  reason?: KakaoPlaceLinkFailureReason;
  diagnostics?: KakaoPlaceLinkDiagnostics;
};

export type KakaoPlaceLinkSearchResult = {
  places: NormalizedPlace[];
  outcome: 'success' | 'missing_api_key' | 'http_error' | 'invalid_payload' | 'network_error';
  statusCode?: number;
};

export async function resolveKakaoPlaceLinkDetailed(
  naverPlace: NormalizedPlace,
  searchKakao: (query: string) => Promise<NormalizedPlace[] | KakaoPlaceLinkSearchResult>,
  options: { includeDiagnostics?: boolean } = {},
): Promise<KakaoPlaceLinkResolution> {
  const seen = new Set<string>();
  const candidates: NormalizedPlace[] = [];
  const queryResults: KakaoPlaceLinkDiagnostics['queryResults'] = [];
  const addCandidates = (results: NormalizedPlace[]) => results.forEach((candidate) => {
    const key = `${candidate.identity.provider}:${candidate.identity.providerPlaceId}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  });
  const queryKakao = async (query: string) => {
    const result = await searchKakao(query);
    const detailed = Array.isArray(result)
      ? { places: result, outcome: 'success' as const }
      : result;
    queryResults.push({
      resultCount: detailed.places.length,
      outcome: detailed.outcome,
      ...(detailed.statusCode === undefined ? {} : { statusCode: detailed.statusCode }),
    });
    addCandidates(detailed.places);
  };
  const evaluateCandidates = () => {
    const rejectionCounts: KakaoPlaceLinkDiagnostics['rejectionCounts'] = {
      nonKakao: 0,
      missingCoordinates: 0,
      addressMismatch: 0,
      distanceExceeded: 0,
      missingKakaoId: 0,
      missingMapUrl: 0,
    };
    const eligible: NormalizedPlace[] = [];
    for (const candidate of candidates) {
      if (candidate.identity.provider !== 'kakao') rejectionCounts.nonKakao += 1;
      else if (!candidate.coordinates || !naverPlace.coordinates) rejectionCounts.missingCoordinates += 1;
      else if (!sharesAddress(candidate, naverPlace)) rejectionCounts.addressMismatch += 1;
      else if (distanceMeters(naverPlace.coordinates, candidate.coordinates) > MAX_LINK_DISTANCE_METERS) rejectionCounts.distanceExceeded += 1;
      else if (!candidate.legacy?.kakaoPlaceId) rejectionCounts.missingKakaoId += 1;
      else if (!candidate.mapUrl) rejectionCounts.missingMapUrl += 1;
      else eligible.push(candidate);
    }
    return { eligible, rejectionCounts };
  };
  const resolution = (value: Omit<KakaoPlaceLinkResolution, 'diagnostics'>): KakaoPlaceLinkResolution => {
    if (!options.includeDiagnostics) return value;
    const { eligible, rejectionCounts } = evaluateCandidates();
    return {
      ...value,
      diagnostics: {
        queryCount: queryResults.length,
        queryResults,
        candidateCount: candidates.length,
        candidates: candidates.map((candidate) => ({
          name: candidate.name,
          address: candidate.address?.display ?? '',
          roadAddress: candidate.address?.road ?? '',
        })),
        eligibleCount: eligible.length,
        namedMatchCount: eligible.filter((candidate) => samePlaceName(candidate.name, naverPlace.name)).length,
        rejectionCounts,
      },
    };
  };
  if (naverPlace.identity.provider !== 'naver') return resolution({ reason: 'not_naver_place' });
  if (!naverPlace.coordinates || !roadAddress(naverPlace)) return resolution({ reason: 'missing_coordinates_or_address' });
  const addressQuery = naverPlace.address?.road ?? naverPlace.address?.display ?? '';
  const primaryQuery = `${naverPlace.name} ${addressQuery}`;
  const eligibleCandidates = () => evaluateCandidates().eligible;
  // 주소를 먼저 검색하면 제공처별 장소명 표기 차이 때문에 검색 결과 자체를
  // 놓치는 일을 줄일 수 있다. 주소 결과 안에서 이름이 호환되는 후보를 우선 선택한다.
  await queryKakao(addressQuery);
  const addressEligible = eligibleCandidates();
  const addressNamedMatches = addressEligible.filter((candidate) => samePlaceName(candidate.name, naverPlace.name));
  if (addressNamedMatches.length === 1) {
    return resolution({ link: { kakaoPlaceId: addressNamedMatches[0].legacy!.kakaoPlaceId!, mapUrl: addressNamedMatches[0].mapUrl! } });
  }
  // 주소 검색이 비었거나 이름으로 좁히지 못한 경우에만 보조 검색을 한다.
  for (const query of [primaryQuery, naverPlace.name]) {
    if (!query || query === addressQuery) continue;
    await queryKakao(query);
    const namedMatches = eligibleCandidates().filter((candidate) => samePlaceName(candidate.name, naverPlace.name));
    if (namedMatches.length === 1) {
      return resolution({ link: { kakaoPlaceId: namedMatches[0].legacy!.kakaoPlaceId!, mapUrl: namedMatches[0].mapUrl! } });
    }
  }
  // Naver와 Kakao가 같은 지점을 홍대본점/연남본점처럼 다르게 부를 수 있다.
  // 브랜드명 검색 결과도 주소와 100m 거리 검증을 통과해야만 링크한다.
  const brandQuery = branchAgnosticSearchName(naverPlace.name);
  if (brandQuery) {
    await queryKakao(brandQuery);
    const namedMatches = eligibleCandidates().filter((candidate) => samePlaceName(candidate.name, naverPlace.name));
    if (namedMatches.length === 1) {
      return resolution({ link: { kakaoPlaceId: namedMatches[0].legacy!.kakaoPlaceId!, mapUrl: namedMatches[0].mapUrl! } });
    }
  }
  // Some Naver results contain only a parcel address, while Kakao's result has
  // both parcel and road forms (or vice versa). Try the alternate Naver form
  // only after the established queries so this remains a bounded fallback and
  // does not alter the normal query order.
  const alternateAddressQuery = naverPlace.address?.road && naverPlace.address?.display
    && normalize(naverPlace.address.road) !== normalize(naverPlace.address.display)
    ? naverPlace.address.display
    : undefined;
  if (alternateAddressQuery) {
    await queryKakao(alternateAddressQuery);
    const namedMatches = eligibleCandidates().filter((candidate) => samePlaceName(candidate.name, naverPlace.name));
    if (namedMatches.length === 1) {
      return resolution({ link: { kakaoPlaceId: namedMatches[0].legacy!.kakaoPlaceId!, mapUrl: namedMatches[0].mapUrl! } });
    }
    const alternatePrimaryQuery = `${naverPlace.name} ${alternateAddressQuery}`;
    await queryKakao(alternatePrimaryQuery);
    const alternateNamedMatches = eligibleCandidates().filter((candidate) => samePlaceName(candidate.name, naverPlace.name));
    if (alternateNamedMatches.length === 1) {
      return resolution({ link: { kakaoPlaceId: alternateNamedMatches[0].legacy!.kakaoPlaceId!, mapUrl: alternateNamedMatches[0].mapUrl! } });
    }
  }
  const eligible = eligibleCandidates();
  // 같은 주소에 여러 업장이 있을 수 있으므로, 이름이 호환되는 후보가 하나면
  // 그것을 우선한다. 이름으로도 좁혀지지 않고 주소·좌표 후보가 하나뿐인 경우는
  // 주소가 동일하다는 강한 신호를 사용해 연결한다.
  const namedMatches = eligible.filter((candidate) => samePlaceName(candidate.name, naverPlace.name));
  const matches = namedMatches.length === 1 ? namedMatches : eligible.length === 1 ? eligible : [];
  if (matches.length !== 1) {
    return resolution({ reason: eligible.length > 1 ? 'ambiguous_candidate' : 'no_eligible_candidate' });
  }
  return resolution({ link: { kakaoPlaceId: matches[0].legacy!.kakaoPlaceId!, mapUrl: matches[0].mapUrl! } });
}

export async function resolveKakaoPlaceLink(
  naverPlace: NormalizedPlace,
  searchKakao: (query: string) => Promise<NormalizedPlace[]>,
): Promise<{ kakaoPlaceId: string; mapUrl: string } | undefined> {
  return (await resolveKakaoPlaceLinkDetailed(naverPlace, searchKakao)).link;
}

/** Small, uncached keyword lookup used only for selected Naver places. */
export async function searchKakaoPlacesForLinkDetailed(input: {
  query: string;
  kakaoRestApiKey: string;
  fetcher: typeof fetch;
}): Promise<KakaoPlaceLinkSearchResult> {
  if (!input.kakaoRestApiKey) return { places: [], outcome: 'missing_api_key' };
  try {
    const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    url.searchParams.set('query', input.query);
    url.searchParams.set('size', '5');
    const response = await input.fetcher(url, { headers: { Authorization: `KakaoAK ${input.kakaoRestApiKey}` } });
    if (!response.ok) return { places: [], outcome: 'http_error', statusCode: response.status };
    const payload = await response.json() as { documents?: KakaoDocument[] };
    if (!Array.isArray(payload.documents)) return { places: [], outcome: 'invalid_payload' };
    const places = payload.documents.flatMap((document) => {
      const kakaoPlaceId = document.id?.trim();
      const name = document.place_name?.trim();
      const latitude = Number(document.y);
      const longitude = Number(document.x);
      if (!kakaoPlaceId || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      const mapUrl = document.place_url?.trim() || `https://place.map.kakao.com/${kakaoPlaceId}`;
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
        mapUrl,
        matchedSearchEvidence: [{ queryId: 'kakao_link', source: 'keyword', page: 1, queryText: input.query, phase: 'fallback' }],
      })];
    });
    return { places, outcome: 'success' };
  } catch {
    return { places: [], outcome: 'network_error' };
  }
}

export async function searchKakaoPlacesForLink(input: {
  query: string;
  kakaoRestApiKey: string;
  fetcher: typeof fetch;
}): Promise<NormalizedPlace[]> {
  return (await searchKakaoPlacesForLinkDetailed(input)).places;
}
