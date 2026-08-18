import type { NormalizedPlace, NormalizedPlaceCategory } from '../place-provider.ts';
import type { NaverSearchCache } from '../naver-search-cache.ts';

type NaverLocalItem = {
  title?: string;
  category?: string;
  address?: string;
  roadAddress?: string;
  link?: string;
  mapx?: string;
  mapy?: string;
};

const stripHtml = (value: string): string => value.replace(/<[^>]+>/g, '').trim();
const normalizeIdentityPart = (value: string | undefined): string => (value ?? '')
  .normalize('NFKC')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase();

function categoryFor(raw: string): NormalizedPlaceCategory {
  if (raw.includes('카페') || raw.includes('커피')) return 'cafe';
  if (raw.includes('술집') || raw.includes('주점') || raw.includes('와인')) return 'drinks';
  if (raw.includes('문화') || raw.includes('전시') || raw.includes('공연')) return 'culture';
  if (raw.includes('관광') || raw.includes('공원')) return 'walk';
  if (raw.includes('음식') || raw.includes('식당')) return 'meal';
  return 'unknown';
}

function coordinate(value: string | undefined): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const wgs84 = Math.abs(parsed) > 180 ? parsed / 10_000_000 : parsed;
  return Number.isFinite(wgs84) ? wgs84 : undefined;
}

async function naverSearchResultIdentity(input: {
  name: string;
  address?: string;
  roadAddress?: string;
  latitude?: number;
  longitude?: number;
}): Promise<string> {
  const source = [
    normalizeIdentityPart(input.name),
    normalizeIdentityPart(input.roadAddress || input.address),
    input.latitude?.toFixed(6) ?? '',
    input.longitude?.toFixed(6) ?? '',
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return `local:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

type NaverLocalSearchInput = {
  query: string;
  clientId: string;
  clientSecret: string;
  fetcher?: typeof fetch;
  cache?: NaverSearchCache;
};

export type NaverLocalSearchResult = {
  places: NormalizedPlace[];
  outcome: 'success' | 'http_error' | 'invalid_payload' | 'network_error';
  cacheHit: boolean;
  statusCode?: number;
};

export async function fetchNaverLocalPlacesWithStatus(input: NaverLocalSearchInput): Promise<NaverLocalSearchResult> {
  const cached = input.cache?.get(input.query);
  if (cached) return { places: cached, outcome: 'success', cacheHit: true };
  const parameters = new URLSearchParams({ query: input.query, display: '5', sort: 'comment' });
  const fetcher = input.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`https://naverapihub.apigw.ntruss.com/search/v1/local?${parameters}`, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': input.clientId,
        'X-NCP-APIGW-API-KEY': input.clientSecret,
      },
    });
  } catch {
    return { places: [], outcome: 'network_error', cacheHit: false };
  }
  if (!response.ok) return { places: [], outcome: 'http_error', statusCode: response.status, cacheHit: false };
  const payload = await response.json() as { items?: unknown };
  if (!Array.isArray(payload.items)) return { places: [], outcome: 'invalid_payload', cacheHit: false };
  const places = (await Promise.all((payload.items as NaverLocalItem[]).map(async (item) => {
    const name = stripHtml(item.title ?? '');
    if (!name) return [];
    const latitude = coordinate(item.mapy);
    const longitude = coordinate(item.mapx);
    const road = item.roadAddress?.trim();
    const address = item.address?.trim();
    const providerPlaceId = await naverSearchResultIdentity({ name, address, roadAddress: road, latitude, longitude });
    return [{
      identity: { provider: 'naver' as const, providerPlaceId },
      name,
      category: {
        providerRaw: item.category?.trim() || undefined,
        normalized: categoryFor(item.category ?? ''),
        specificity: item.category?.includes('>') ? 'specific' as const : 'broad' as const,
      },
      ...(address || road ? { address: { display: address || road!, ...(road ? { road } : {}) } } : {}),
      ...(latitude !== undefined && longitude !== undefined ? { coordinates: { latitude, longitude } } : {}),
      evidence: { provider: 'naver' as const, searchTerms: [input.query] },
    } satisfies NormalizedPlace];
  }))).flat();
  input.cache?.put(input.query, places);
  return { places, outcome: 'success', cacheHit: false };
}

export async function fetchNaverLocalPlaces(input: NaverLocalSearchInput): Promise<NormalizedPlace[]> {
  return (await fetchNaverLocalPlacesWithStatus(input)).places;
}
