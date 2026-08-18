import type { NormalizedPlace } from './place-provider.ts';
import { normalizeKakaoPlace } from './place-provider.ts';
import type { KakaoDocument } from './recommendation-search.ts';

const MAX_LINK_DISTANCE_METERS = 30;

function normalize(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '').trim();
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
  const matches = (await searchKakao(`${naverPlace.name} ${naverPlace.address?.road ?? naverPlace.address?.display ?? ''}`)).filter((candidate) => (
    candidate.identity.provider === 'kakao'
    && Boolean(candidate.coordinates)
    && normalize(candidate.name) === normalize(naverPlace.name)
    && roadAddress(candidate) === roadAddress(naverPlace)
    && distanceMeters(naverPlace.coordinates!, candidate.coordinates!) <= MAX_LINK_DISTANCE_METERS
    && Boolean(candidate.legacy?.kakaoPlaceId && candidate.mapUrl)
  ));
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
