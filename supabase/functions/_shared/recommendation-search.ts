import type {
  RecommendationLocation,
  RecommendationRequest,
} from '../../../shared/recommendation/contracts.ts';

export type SearchEvidence = {
  queryId: string;
  queryText?: string;
  source: 'category' | 'keyword' | 'fallback';
  page: number;
  categoryCode?: string;
};

type SearchPhase = 'required' | 'explicit' | 'intent' | 'fallback';

export type KakaoSearchPlanItem = Omit<SearchEvidence, 'page'> & {
  category?: string;
  phase: SearchPhase;
};

export type KakaoSearchQuery = SearchEvidence & {
  category?: string;
  phase?: SearchPhase;
};

export type KakaoDocument = {
  id?: string;
  place_name?: string;
  category_group_code?: string;
  category_group_name?: string;
  category_name?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
  place_url?: string;
};

export type KakaoSearchStatus = 'success' | 'failure' | 'rate_limited' | 'timeout';

export type KakaoSearchOutcome = {
  query: KakaoSearchQuery;
  status: KakaoSearchStatus;
  documents: KakaoDocument[];
};

export type KakaoSearchMetadata = {
  requestCount: number;
  outcomes: KakaoSearchOutcome[];
  successfulCount: number;
  failedCount: number;
  rateLimitedCount: number;
  timeoutCount: number;
  allSearchesFailed: boolean;
};

export type EvidencedKakaoPlace = {
  kakaoPlaceId: string;
  name: string;
  categoryGroupCode: string;
  categoryGroupName: string;
  categoryName: string;
  address: string;
  roadAddress: string;
  latitude: number;
  longitude: number;
  mapUrl: string;
  matchedSearchEvidence: SearchEvidence[];
};

type NormalizedKakaoDocument = Omit<EvidencedKakaoPlace, 'matchedSearchEvidence'>;

export type KakaoFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export const KAKAO_SEARCH_LIMITS = {
  maxRequests: 12,
  pageSize: 15,
  minUniqueCandidates: 12,
  maxUniqueCandidates: 40,
  maxPagesPerQuery: 2,
  timeoutMs: 4000,
} as const;

type SearchLimits = {
  maxRequests: number;
  pageSize: number;
  minUniqueCandidates: number;
  maxUniqueCandidates: number;
  maxPagesPerQuery: number;
  timeoutMs: number;
};

const CATEGORY_SEARCH: Record<string, { categoryCode?: string; queryText?: string }> = {
  meal: { categoryCode: 'FD6' },
  restaurant: { categoryCode: 'FD6' },
  cafe: { categoryCode: 'CE7' },
  culture: { categoryCode: 'CT1' },
  walk: { categoryCode: 'AT4' },
  attraction: { categoryCode: 'AT4' },
  drinks: { queryText: '술집' },
  bar: { queryText: '술집' },
  activity: { queryText: '액티비티' },
  ai_decide: { queryText: '데이트 장소' },
};

export function buildKakaoSearchPlan(request: RecommendationRequest): KakaoSearchPlanItem[] {
  const items: Omit<KakaoSearchPlanItem, 'queryId'>[] = [];
  const seenCategories = new Set<string>();
  for (const step of request.courseSteps) {
    const normalizedCategory = step.category === 'restaurant' ? 'meal' : step.category;
    if (seenCategories.has(normalizedCategory)) continue;
    seenCategories.add(normalizedCategory);
    const mapping = CATEGORY_SEARCH[normalizedCategory] ?? { queryText: '데이트 장소' };
    items.push({
      source: mapping.categoryCode ? 'category' : 'keyword',
      phase: 'required',
      category: normalizedCategory,
      ...(mapping.categoryCode ? { categoryCode: mapping.categoryCode } : {}),
      ...(mapping.queryText ? { queryText: mapping.queryText } : {}),
    });
  }

  const explicit = request.additionalRequest?.trim();
  if (explicit) items.push({ source: 'keyword', phase: 'explicit', queryText: explicit });
  items.push({ source: 'keyword', phase: 'intent', queryText: '데이트 코스' });
  items.push({ source: 'fallback', phase: 'fallback', queryText: '주변 데이트 장소' });

  return items.map((item, index) => ({
    ...item,
    queryId: `query_${String(index + 1).padStart(3, '0')}`,
  }));
}

function evidenceFromQuery(query: KakaoSearchQuery): SearchEvidence {
  return {
    queryId: query.queryId,
    source: query.source,
    page: query.page,
    ...(query.queryText ? { queryText: query.queryText } : {}),
    ...(query.categoryCode ? { categoryCode: query.categoryCode } : {}),
  };
}

const evidenceKey = (evidence: SearchEvidence): string => [
  evidence.source,
  evidence.queryId,
  evidence.page,
  evidence.categoryCode ?? '',
  evidence.queryText ?? '',
].join('|');

function compareEvidence(a: SearchEvidence, b: SearchEvidence): number {
  const sourceOrder = { category: 0, keyword: 1, fallback: 2 } as const;
  return sourceOrder[a.source] - sourceOrder[b.source]
    || a.queryId.localeCompare(b.queryId)
    || a.page - b.page
    || (a.categoryCode ?? '').localeCompare(b.categoryCode ?? '')
    || (a.queryText ?? '').localeCompare(b.queryText ?? '');
}

const normalizedText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

function normalizeDocument(document: KakaoDocument): NormalizedKakaoDocument | null {
  const kakaoPlaceId = normalizedText(document.id);
  const name = normalizedText(document.place_name);
  const rawLatitude = normalizedText(document.y);
  const rawLongitude = normalizedText(document.x);
  if (!kakaoPlaceId || !name || !rawLatitude || !rawLongitude) return null;
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180) return null;
  return {
    kakaoPlaceId,
    name,
    categoryGroupCode: normalizedText(document.category_group_code),
    categoryGroupName: normalizedText(document.category_group_name),
    categoryName: normalizedText(document.category_name),
    address: normalizedText(document.address_name),
    roadAddress: normalizedText(document.road_address_name),
    latitude,
    longitude,
    mapUrl: normalizedText(document.place_url),
  };
}

const canonicalDocumentKey = (document: NormalizedKakaoDocument): string => JSON.stringify([
  document.kakaoPlaceId,
  document.name,
  document.categoryGroupCode,
  document.categoryGroupName,
  document.categoryName,
  document.address,
  document.roadAddress,
  document.latitude,
  document.longitude,
  document.mapUrl,
]);

export function mergeKakaoSearchEvidence(outcomes: readonly KakaoSearchOutcome[]): EvidencedKakaoPlace[] {
  const grouped = new Map<string, { documents: NormalizedKakaoDocument[]; evidence: SearchEvidence[] }>();
  for (const outcome of outcomes) {
    if (outcome.status !== 'success') continue;
    for (const document of outcome.documents) {
      const normalized = normalizeDocument(document);
      if (!normalized) continue;
      const current = grouped.get(normalized.kakaoPlaceId) ?? { documents: [], evidence: [] };
      current.documents.push(normalized);
      current.evidence.push(evidenceFromQuery(outcome.query));
      grouped.set(normalized.kakaoPlaceId, current);
    }
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kakaoPlaceId, group]) => {
      const document = [...group.documents].sort((a, b) => (
        canonicalDocumentKey(a).localeCompare(canonicalDocumentKey(b))
      ))[0];
      const evidence = [...new Map(
        group.evidence.map((item) => [evidenceKey(item), item]),
      ).values()].sort(compareEvidence);
      return {
        kakaoPlaceId,
        name: document.name,
        categoryGroupCode: document.categoryGroupCode,
        categoryGroupName: document.categoryGroupName,
        categoryName: document.categoryName,
        address: document.address,
        roadAddress: document.roadAddress,
        latitude: document.latitude,
        longitude: document.longitude,
        mapUrl: document.mapUrl,
        matchedSearchEvidence: evidence,
      };
    });
}

export async function fetchKakaoSearchPage(
  query: KakaoSearchQuery,
  center: RecommendationLocation,
  kakaoRestApiKey: string,
  fetcher: KakaoFetch = fetch,
  timeoutMs: number = KAKAO_SEARCH_LIMITS.timeoutMs,
): Promise<KakaoSearchOutcome> {
  const endpoint = query.categoryCode ? 'category' : 'keyword';
  const parameters = new URLSearchParams({
    x: String(center.longitude),
    y: String(center.latitude),
    size: String(KAKAO_SEARCH_LIMITS.pageSize),
    page: String(query.page),
    sort: 'distance',
  });
  if (query.categoryCode) parameters.set('category_group_code', query.categoryCode);
  else parameters.set('query', query.queryText ?? '데이트 장소');

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetcher(`https://dapi.kakao.com/v2/local/search/${endpoint}.json?${parameters}`, {
      headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        query,
        status: response.status === 429 ? 'rate_limited' : 'failure',
        documents: [],
      };
    }
    const body = await response.json() as { documents?: unknown };
    return {
      query,
      status: 'success',
      documents: Array.isArray(body.documents) ? body.documents as KakaoDocument[] : [],
    };
  } catch {
    return { query, status: timedOut ? 'timeout' : 'failure', documents: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function executeKakaoSearchPlan(
  plan: readonly KakaoSearchPlanItem[],
  searchPage: (query: KakaoSearchQuery) => Promise<KakaoSearchOutcome>,
  limits: SearchLimits = KAKAO_SEARCH_LIMITS,
): Promise<{
  places: EvidencedKakaoPlace[];
  metadata: KakaoSearchMetadata;
}> {
  const outcomes: KakaoSearchOutcome[] = [];
  const run = async (item: KakaoSearchPlanItem, page: number) => {
    if (outcomes.length >= limits.maxRequests) return;
    outcomes.push(await searchPage({ ...item, page }));
  };
  const uniqueCount = () => mergeKakaoSearchEvidence(outcomes).length;

  for (const item of plan.filter((entry) => entry.phase === 'required' || entry.phase === 'explicit')) {
    await run(item, 1);
  }
  if (uniqueCount() < limits.minUniqueCandidates) {
    for (const item of plan.filter((entry) => entry.phase === 'intent' || entry.phase === 'fallback')) {
      await run(item, 1);
      if (uniqueCount() >= limits.minUniqueCandidates) break;
    }
  }
  for (let page = 2; page <= limits.maxPagesPerQuery && uniqueCount() < limits.minUniqueCandidates; page++) {
    for (const item of plan) {
      await run(item, page);
      if (outcomes.length >= limits.maxRequests || uniqueCount() >= limits.minUniqueCandidates) break;
    }
  }

  const count = (status: KakaoSearchStatus) => outcomes.filter((outcome) => outcome.status === status).length;
  const successfulCount = count('success');
  return {
    places: mergeKakaoSearchEvidence(outcomes),
    metadata: {
      requestCount: outcomes.length,
      outcomes,
      successfulCount,
      failedCount: count('failure'),
      rateLimitedCount: count('rate_limited'),
      timeoutCount: count('timeout'),
      allSearchesFailed: outcomes.length > 0 && successfulCount === 0,
    },
  };
}
