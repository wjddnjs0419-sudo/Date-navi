import {
  KAKAO_CACHE_GRID_DEGREES,
  KAKAO_SEARCH_CACHE_TTL_DAYS,
  buildKakaoSearchCacheKey,
  createCachedKakaoSearchPage,
  createSupabaseKakaoSearchCacheStore,
  snapCoordinateToCacheGrid,
  snapLocationToCacheGrid,
  type KakaoSearchCacheEntry,
  type KakaoSearchCacheStore,
} from '../supabase/functions/_shared/kakao-search-cache';
import type {
  KakaoDocument,
  KakaoSearchOutcome,
  KakaoSearchPlanItem,
  KakaoSearchQuery,
} from '../supabase/functions/_shared/recommendation-search';
import type { RecommendationLocation } from '../shared/recommendation/contracts';
import { searchAndRankRecommendation } from '../supabase/functions/_shared/recommendation-search-pipeline';

const planItem = (overrides: Partial<KakaoSearchPlanItem> = {}): KakaoSearchPlanItem => ({
  queryId: 'q1',
  source: 'category',
  categoryCode: 'CE7',
  phase: 'required',
  ...overrides,
});

const query = (overrides: Partial<KakaoSearchQuery> = {}): KakaoSearchQuery => ({
  queryId: 'q1',
  source: 'category',
  categoryCode: 'CE7',
  phase: 'required',
  page: 1,
  ...overrides,
});

const location: RecommendationLocation = {
  source: 'kakao',
  label: '을지로입구역',
  latitude: 37.5674,
  longitude: 126.9827,
  kind: 'station',
};

const memoryStore = (initial: Record<string, KakaoDocument[]> = {}) => {
  const rows = new Map(Object.entries(initial));
  const puts: KakaoSearchCacheEntry[] = [];
  const store: KakaoSearchCacheStore = {
    fetchFresh: jest.fn(async (keys: readonly string[]) => (
      new Map([...rows].filter(([key]) => keys.includes(key)))
    )),
    put: jest.fn(async (entry: KakaoSearchCacheEntry) => {
      puts.push(entry);
    }),
  };
  return { store, puts };
};

describe('grid snap and cache key', () => {
  it('snaps coordinates onto the 0.005-degree grid with stable 3-decimal key parts', () => {
    expect(KAKAO_CACHE_GRID_DEGREES).toBe(0.005);
    expect(snapCoordinateToCacheGrid(37.5674)).toBeCloseTo(37.565, 10);
    const snapped = snapLocationToCacheGrid(location);
    expect(snapped.latitude).toBeCloseTo(37.565, 10);
    expect(snapped.longitude).toBeCloseTo(126.985, 10);
    expect(snapped.label).toBe(location.label);
    expect(buildKakaoSearchCacheKey({ categoryCode: 'CE7', page: 1 }, { latitude: 37.5674, longitude: 126.9827 }))
      .toBe('category|CE7|37.565|126.985|1');
  });

  it('keys keyword queries by their query text with the shared default', () => {
    expect(buildKakaoSearchCacheKey({ queryText: '술집', page: 2 }, { latitude: 37.5674, longitude: 126.9827 }))
      .toBe('keyword|술집|37.565|126.985|2');
    expect(buildKakaoSearchCacheKey({ page: 1 }, { latitude: 37.5674, longitude: 126.9827 }))
      .toBe('keyword|데이트 장소|37.565|126.985|1');
  });

  it('shares the same key inside one grid cell and splits across cells', () => {
    const a = buildKakaoSearchCacheKey({ categoryCode: 'FD6', page: 1 }, { latitude: 37.5661, longitude: 126.9841 });
    const b = buildKakaoSearchCacheKey({ categoryCode: 'FD6', page: 1 }, { latitude: 37.5669, longitude: 126.9859 });
    const c = buildKakaoSearchCacheKey({ categoryCode: 'FD6', page: 1 }, { latitude: 37.5741, longitude: 126.9841 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('createCachedKakaoSearchPage', () => {
  it('serves cache hits without calling Kakao and counts metrics', async () => {
    const key = buildKakaoSearchCacheKey({ categoryCode: 'CE7', page: 1 }, location);
    const { store } = memoryStore({ [key]: [{ id: 'doc-1' }] });
    const fetchPage = jest.fn();
    const metrics = { hits: 0, misses: 0, kakaoCalls: 0 };
    const searchPage = createCachedKakaoSearchPage({
      plan: [planItem()],
      center: location,
      store,
      kakaoRestApiKey: 'k',
      fetchPage: fetchPage as never,
      metrics,
    });

    const outcome = await searchPage(query());

    expect(outcome.status).toBe('success');
    expect(outcome.documents).toEqual([{ id: 'doc-1' }]);
    expect(fetchPage).not.toHaveBeenCalled();
    expect(metrics).toEqual({ hits: 1, misses: 0, kakaoCalls: 0 });
  });

  it('prefetches every plan key (pages 1..max) in a single store read', async () => {
    const { store } = memoryStore();
    const fetchPage = jest.fn(async (q: KakaoSearchQuery): Promise<KakaoSearchOutcome> => ({
      query: q,
      status: 'success',
      documents: [],
    }));
    const searchPage = createCachedKakaoSearchPage({
      plan: [
        planItem(),
        planItem({ queryId: 'q2', categoryCode: undefined, queryText: '술집', source: 'keyword' }),
      ],
      center: location,
      store,
      kakaoRestApiKey: 'k',
      fetchPage: fetchPage as never,
    });

    await searchPage(query());
    await searchPage(query({ queryId: 'q2', categoryCode: undefined, queryText: '술집', source: 'keyword' }));

    expect(store.fetchFresh).toHaveBeenCalledTimes(1);
    expect((store.fetchFresh as jest.Mock).mock.calls[0][0]).toHaveLength(4);
  });

  it('falls through to Kakao with the snapped center on miss and upserts successful outcomes', async () => {
    const { store, puts } = memoryStore();
    const fetchPage = jest.fn(async (q: KakaoSearchQuery, _center: RecommendationLocation): Promise<KakaoSearchOutcome> => ({
      query: q,
      status: 'success',
      documents: [{ id: 'live' }],
    }));
    const metrics = { hits: 0, misses: 0, kakaoCalls: 0 };
    const searchPage = createCachedKakaoSearchPage({
      plan: [planItem()],
      center: location,
      store,
      kakaoRestApiKey: 'k',
      fetchPage: fetchPage as never,
      metrics,
    });

    const outcome = await searchPage(query());

    expect(outcome.documents).toEqual([{ id: 'live' }]);
    expect(fetchPage.mock.calls[0][1]).toEqual(expect.objectContaining({
      latitude: snapCoordinateToCacheGrid(location.latitude),
      longitude: snapCoordinateToCacheGrid(location.longitude),
    }));
    await Promise.resolve();
    expect(puts).toHaveLength(1);
    expect(puts[0]).toEqual(expect.objectContaining({
      cacheKey: buildKakaoSearchCacheKey({ categoryCode: 'CE7', page: 1 }, location),
      endpoint: 'category',
      categoryCode: 'CE7',
      page: 1,
      documents: [{ id: 'live' }],
      gridLatitude: snapCoordinateToCacheGrid(location.latitude),
      gridLongitude: snapCoordinateToCacheGrid(location.longitude),
    }));
    expect(metrics).toEqual({ hits: 0, misses: 1, kakaoCalls: 1 });
  });

  it('caches empty successful pages but never failure/rate_limited/timeout outcomes', async () => {
    const { store, puts } = memoryStore();
    const statuses: KakaoSearchOutcome['status'][] = ['success', 'failure', 'rate_limited', 'timeout'];
    let call = 0;
    const fetchPage = jest.fn(async (q: KakaoSearchQuery): Promise<KakaoSearchOutcome> => ({
      query: q,
      status: statuses[call++],
      documents: [],
    }));
    const searchPage = createCachedKakaoSearchPage({
      plan: [planItem()],
      center: location,
      store,
      kakaoRestApiKey: 'k',
      fetchPage: fetchPage as never,
      maxPagesPerQuery: 3,
    });

    await searchPage(query());
    await searchPage(query({ page: 2 }));
    await searchPage(query({ page: 3 }));
    await searchPage(query({ page: 3 }));
    await Promise.resolve();

    expect(puts).toHaveLength(1);
    expect(puts[0].page).toBe(1);
  });

  it('never caches explicit-phase queries carrying user free text, in either prefetch keys or writes', async () => {
    const { store, puts } = memoryStore();
    const fetchPage = jest.fn(async (q: KakaoSearchQuery): Promise<KakaoSearchOutcome> => ({
      query: q,
      status: 'success',
      documents: [{ id: 'live' }],
    }));
    const searchPage = createCachedKakaoSearchPage({
      plan: [
        planItem(),
        planItem({ queryId: 'q2', categoryCode: undefined, queryText: '조용한 한옥 카페', source: 'keyword', phase: 'explicit' }),
      ],
      center: location,
      store,
      kakaoRestApiKey: 'k',
      fetchPage: fetchPage as never,
    });

    await searchPage(query({ queryId: 'q2', categoryCode: undefined, queryText: '조용한 한옥 카페', source: 'keyword', phase: 'explicit' }));
    await Promise.resolve();

    expect((store.fetchFresh as jest.Mock).mock.calls[0][0]).toHaveLength(2);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(puts).toHaveLength(0);
  });

  it('registers fire-and-forget cache writes with EdgeRuntime.waitUntil when available', async () => {
    const waitUntil = jest.fn();
    (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime = { waitUntil };
    try {
      const { store, puts } = memoryStore();
      const fetchPage = jest.fn(async (q: KakaoSearchQuery): Promise<KakaoSearchOutcome> => ({
        query: q,
        status: 'success',
        documents: [{ id: 'live' }],
      }));
      const searchPage = createCachedKakaoSearchPage({
        plan: [planItem()],
        center: location,
        store,
        kakaoRestApiKey: 'k',
        fetchPage: fetchPage as never,
      });

      await searchPage(query());
      await Promise.resolve();

      expect(waitUntil).toHaveBeenCalledTimes(1);
      expect(puts).toHaveLength(1);
    } finally {
      delete (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime;
    }
  });

  it('treats store read/write failures as misses and never breaks the search', async () => {
    const store: KakaoSearchCacheStore = {
      fetchFresh: jest.fn(async () => {
        throw new Error('db down');
      }),
      put: jest.fn(async () => {
        throw new Error('db down');
      }),
    };
    const fetchPage = jest.fn(async (q: KakaoSearchQuery): Promise<KakaoSearchOutcome> => ({
      query: q,
      status: 'success',
      documents: [{ id: 'live' }],
    }));
    const searchPage = createCachedKakaoSearchPage({
      plan: [planItem()],
      center: location,
      store,
      kakaoRestApiKey: 'k',
      fetchPage: fetchPage as never,
    });

    const outcome = await searchPage(query());

    expect(outcome.status).toBe('success');
    expect(outcome.documents).toEqual([{ id: 'live' }]);
  });
});

describe('searchAndRankRecommendation cache wiring', () => {
  it('routes plan execution through the cache wrapper when a cacheStore is provided', async () => {
    const request = {
      requestId: 'request-cache',
      mode: 'course',
      language: 'ko',
      location: {
        source: 'kakao',
        label: '을지로입구역',
        latitude: 37.5674,
        longitude: 126.9827,
        kind: 'station',
      },
      courseSteps: [
        { id: 'step-0', category: 'meal', label: '식사' },
        { id: 'step-1', category: 'cafe', label: '카페' },
      ],
    } as unknown as Parameters<typeof searchAndRankRecommendation>[0];
    const { store } = memoryStore({
      [buildKakaoSearchCacheKey({ categoryCode: 'FD6', page: 1 }, location)]: [],
      [buildKakaoSearchCacheKey({ categoryCode: 'CE7', page: 1 }, location)]: [],
    });
    const metrics = { hits: 0, misses: 0, kakaoCalls: 0 };
    const fetcher = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ documents: [] }),
    } as unknown as Response));

    await searchAndRankRecommendation(request, {
      kakaoRestApiKey: 'k',
      fetcher: fetcher as never,
      cacheStore: store,
      cacheMetrics: metrics,
    });

    expect(store.fetchFresh).toHaveBeenCalledTimes(1);
    expect(metrics.hits).toBeGreaterThanOrEqual(2);
  });

  it('keeps the live Kakao path untouched when no cacheStore is provided', async () => {
    const request = {
      requestId: 'request-live',
      mode: 'course',
      language: 'ko',
      location: {
        source: 'kakao',
        label: '을지로입구역',
        latitude: 37.5674,
        longitude: 126.9827,
        kind: 'station',
      },
      courseSteps: [
        { id: 'step-0', category: 'meal', label: '식사' },
        { id: 'step-1', category: 'cafe', label: '카페' },
      ],
    } as unknown as Parameters<typeof searchAndRankRecommendation>[0];
    const fetcher = jest.fn(async (url: string) => {
      expect(url).toContain('y=37.5674');
      return {
        ok: true,
        status: 200,
        json: async () => ({ documents: [] }),
      } as unknown as Response;
    });

    await searchAndRankRecommendation(request, {
      kakaoRestApiKey: 'k',
      fetcher: fetcher as never,
    });

    expect(fetcher).toHaveBeenCalled();
  });
});

describe('TTL constant', () => {
  it('keeps the cache TTL aligned with the 30-day AI data retention policy', () => {
    expect(KAKAO_SEARCH_CACHE_TTL_DAYS).toBe(30);
  });
});

describe('createSupabaseKakaoSearchCacheStore', () => {
  it('logs a structured event when a cache write fails instead of failing silently', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const client = {
        from: jest.fn(() => ({
          upsert: jest.fn(async () => ({ error: { message: 'permission denied' } })),
        })),
      };
      const store = createSupabaseKakaoSearchCacheStore(client as never);
      await store.put({
        cacheKey: 'category|CE7|37.565|126.985|1',
        endpoint: 'category',
        categoryCode: 'CE7',
        gridLatitude: 37.565,
        gridLongitude: 126.985,
        page: 1,
        documents: [],
      });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('kakao_cache_put_failed'));
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
