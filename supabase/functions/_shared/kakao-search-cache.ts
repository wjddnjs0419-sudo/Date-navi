import type { RecommendationLocation } from '../../../shared/recommendation/contracts.ts';
import {
  fetchKakaoSearchPage,
  KAKAO_SEARCH_LIMITS,
  type KakaoDocument,
  type KakaoFetch,
  type KakaoSearchOutcome,
  type KakaoSearchPlanItem,
  type KakaoSearchQuery,
} from './recommendation-search.ts';

export const KAKAO_CACHE_GRID_DEGREES = 0.005;
export const KAKAO_SEARCH_CACHE_TTL_DAYS = 30;
const DEFAULT_KEYWORD_QUERY = '데이트 장소';

export function snapCoordinateToCacheGrid(value: number): number {
  return Math.round(value / KAKAO_CACHE_GRID_DEGREES) * KAKAO_CACHE_GRID_DEGREES;
}

const gridKeyPart = (value: number): string => snapCoordinateToCacheGrid(value).toFixed(3);

export function snapLocationToCacheGrid(location: RecommendationLocation): RecommendationLocation {
  return {
    ...location,
    latitude: snapCoordinateToCacheGrid(location.latitude),
    longitude: snapCoordinateToCacheGrid(location.longitude),
  };
}

type CacheKeyQuery = { categoryCode?: string; queryText?: string; page: number };
type CacheKeyCenter = { latitude: number; longitude: number };

export function buildKakaoSearchCacheKey(query: CacheKeyQuery, center: CacheKeyCenter): string {
  const endpoint = query.categoryCode ? 'category' : 'keyword';
  const term = query.categoryCode ?? query.queryText ?? DEFAULT_KEYWORD_QUERY;
  return [endpoint, term, gridKeyPart(center.latitude), gridKeyPart(center.longitude), String(query.page)].join('|');
}

export type KakaoSearchCacheEntry = {
  cacheKey: string;
  endpoint: 'category' | 'keyword';
  categoryCode?: string;
  queryText?: string;
  gridLatitude: number;
  gridLongitude: number;
  page: number;
  documents: KakaoDocument[];
};

export type KakaoSearchCacheStore = {
  fetchFresh: (keys: readonly string[]) => Promise<Map<string, KakaoDocument[]>>;
  put: (entry: KakaoSearchCacheEntry) => Promise<void>;
};

type SupabaseLikeClient = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => {
        gte: (column: string, value: string) => Promise<{ data: unknown; error: unknown }>;
      };
    };
    upsert: (row: Record<string, unknown>, options: { onConflict: string }) => Promise<{ error: unknown }>;
  };
};

export function createSupabaseKakaoSearchCacheStore(client: SupabaseLikeClient): KakaoSearchCacheStore {
  return {
    fetchFresh: async (keys) => {
      const cutoff = new Date(Date.now() - KAKAO_SEARCH_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await client
        .from('kakao_search_cache')
        .select('cache_key,documents')
        .in('cache_key', [...keys])
        .gte('fetched_at', cutoff);
      if (error || !Array.isArray(data)) return new Map();
      return new Map(
        (data as { cache_key?: unknown; documents?: unknown }[])
          .filter((row): row is { cache_key: string; documents: KakaoDocument[] } => (
            typeof row.cache_key === 'string' && Array.isArray(row.documents)
          ))
          .map((row) => [row.cache_key, row.documents]),
      );
    },
    put: async (entry) => {
      const { error } = await client.from('kakao_search_cache').upsert({
        cache_key: entry.cacheKey,
        endpoint: entry.endpoint,
        category_code: entry.categoryCode ?? null,
        query_text: entry.endpoint === 'keyword' ? (entry.queryText ?? DEFAULT_KEYWORD_QUERY) : null,
        grid_latitude: entry.gridLatitude,
        grid_longitude: entry.gridLongitude,
        page: entry.page,
        documents: entry.documents,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'cache_key' });
      if (error) {
        console.error(JSON.stringify({
          event: 'kakao_cache_put_failed',
          cacheKey: entry.cacheKey,
          message: (error as { message?: string }).message ?? 'unknown',
        }));
      }
    },
  };
}

export type KakaoCacheMetrics = { hits: number; misses: number; kakaoCalls: number };

export function createCachedKakaoSearchPage(options: {
  plan: readonly KakaoSearchPlanItem[];
  center: RecommendationLocation;
  store: KakaoSearchCacheStore;
  kakaoRestApiKey: string;
  fetcher?: KakaoFetch;
  fetchPage?: typeof fetchKakaoSearchPage;
  maxPagesPerQuery?: number;
  metrics?: KakaoCacheMetrics;
}): (query: KakaoSearchQuery) => Promise<KakaoSearchOutcome> {
  const snappedCenter = snapLocationToCacheGrid(options.center);
  const fetchPage = options.fetchPage ?? fetchKakaoSearchPage;
  const maxPages = options.maxPagesPerQuery ?? KAKAO_SEARCH_LIMITS.maxPagesPerQuery;
  let prefetch: Promise<Map<string, KakaoDocument[]>> | undefined;

  // User free text (additionalRequest) travels on explicit-phase queries, and parsed
  // step-intent queries are derived from that same personal text. Neither is cached:
  // no cross-user storage of potentially personal text or its derivatives.
  const isCacheable = (item: { phase?: string }): boolean => (
    item.phase !== 'explicit' && item.phase !== 'step_intent'
  );

  const prefetchAll = (): Promise<Map<string, KakaoDocument[]>> => {
    if (!prefetch) {
      const keys = [...new Set(options.plan.filter(isCacheable).flatMap((item) => {
        const itemKeys: string[] = [];
        for (let page = 1; page <= maxPages; page += 1) {
          itemKeys.push(buildKakaoSearchCacheKey(
            { categoryCode: item.categoryCode, queryText: item.queryText, page },
            snappedCenter,
          ));
        }
        return itemKeys;
      }))];
      prefetch = options.store.fetchFresh(keys).catch(() => new Map<string, KakaoDocument[]>());
    }
    return prefetch;
  };

  return async (query) => {
    const cached = await prefetchAll();
    const cacheable = isCacheable(query);
    const cacheKey = buildKakaoSearchCacheKey(query, snappedCenter);
    const documents = cacheable ? cached.get(cacheKey) : undefined;
    if (documents) {
      if (options.metrics) options.metrics.hits += 1;
      return { query, status: 'success', documents };
    }
    if (options.metrics) {
      options.metrics.misses += 1;
      options.metrics.kakaoCalls += 1;
    }
    const outcome = await fetchPage(query, snappedCenter, options.kakaoRestApiKey, options.fetcher);
    if (cacheable && outcome.status === 'success') {
      const write = options.store.put({
        cacheKey,
        endpoint: query.categoryCode ? 'category' : 'keyword',
        ...(query.categoryCode
          ? { categoryCode: query.categoryCode }
          : { queryText: query.queryText ?? DEFAULT_KEYWORD_QUERY }),
        gridLatitude: snapCoordinateToCacheGrid(options.center.latitude),
        gridLongitude: snapCoordinateToCacheGrid(options.center.longitude),
        page: query.page,
        documents: outcome.documents,
      }).catch(() => { /* cache write must never break search */ });
      // Keep the worker alive for the write on Supabase Edge Runtime.
      const edgeRuntime = (globalThis as {
        EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
      }).EdgeRuntime;
      edgeRuntime?.waitUntil?.(write);
    }
    return outcome;
  };
}
