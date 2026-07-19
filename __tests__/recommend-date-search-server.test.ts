import type { RecommendationRequest } from '../shared/recommendation/schemas';
import {
  KAKAO_SEARCH_LIMITS,
  buildKakaoSearchPlan,
  executeKakaoSearchPlan,
  fetchKakaoSearchPage,
  mergeKakaoSearchEvidence,
  type KakaoFetch,
  type KakaoSearchQuery,
  type KakaoSearchOutcome,
} from '../supabase/functions/_shared/recommendation-search';
import { searchAndRankRecommendation } from '../supabase/functions/_shared/recommendation-search-pipeline';

const request = (steps = ['meal', 'cafe', 'meal']): RecommendationRequest => ({
  requestId: 'request-search',
  mode: 'course',
  language: 'en',
  location: {
    source: 'kakao',
    label: 'Seoul Forest',
    latitude: 37.5444,
    longitude: 127.0374,
    kind: 'landmark',
  },
  courseSteps: steps.map((category, index) => ({ id: `step-${index}`, category, label: category })),
});

const document = (id: string, overrides: Record<string, string> = {}) => ({
  id,
  place_name: `Place ${id}`,
  category_group_code: 'CE7',
  category_group_name: '카페',
  category_name: '음식점 > 카페',
  address_name: '서울 성동구',
  road_address_name: '서울 성동구 왕십리로',
  x: '127.038',
  y: '37.545',
  place_url: `https://place.map.kakao.com/${id}`,
  ...overrides,
});

const response = (status: number, body: unknown): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn(async () => body),
} as unknown as Response);

describe('recommend-date deterministic Kakao search plan', () => {
  it('fixes request budget, page size, candidate bounds, timeout, and second-page policy', () => {
    expect(KAKAO_SEARCH_LIMITS).toEqual({
      maxRequests: 12,
      pageSize: 15,
      minUniqueCandidates: 12,
      maxUniqueCandidates: 40,
      maxPagesPerQuery: 2,
      timeoutMs: 4000,
    });
  });

  it('orders deduped required categories before explicit keyword, intent proxy, and fallback', () => {
    const plan = buildKakaoSearchPlan({
      ...request(['meal', 'drinks', 'meal']),
      additionalRequest: '루프탑',
    });

    expect(plan.map((item) => [item.source, item.category, item.categoryCode, item.queryText])).toEqual([
      ['category', 'meal', 'FD6', undefined],
      ['keyword', 'drinks', undefined, '술집'],
      ['keyword', undefined, undefined, '루프탑'],
      ['keyword', undefined, undefined, '데이트 코스'],
      ['fallback', undefined, undefined, '주변 데이트 장소'],
    ]);
    expect(new Set(plan.map((item) => item.queryId)).size).toBe(plan.length);
  });

  it('uses official codes and stable Korean proxies independent of UI language', () => {
    const ko = buildKakaoSearchPlan({ ...request(['meal', 'cafe', 'culture', 'walk', 'activity']), language: 'ko' });
    const en = buildKakaoSearchPlan({ ...request(['meal', 'cafe', 'culture', 'walk', 'activity']), language: 'en' });

    expect(en).toEqual(ko);
    expect(ko.slice(0, 5).map((item) => item.categoryCode ?? item.queryText))
      .toEqual(['FD6', 'CE7', 'CT1', 'AT4', '액티비티']);
  });

  it('runs required page-one searches before broad searches and requests page two only on shortage', async () => {
    const calls: string[] = [];
    const searchPage = jest.fn(async (query: KakaoSearchQuery): Promise<KakaoSearchOutcome> => {
      calls.push(`${query.source}:${query.queryId}:p${query.page}`);
      const count = query.source === 'category' && query.page === 1 ? 3 : 0;
      return {
        query,
        status: 'success' as const,
        documents: Array.from({ length: count }, (_, index) => document(`${query.queryId}-${index}`)),
      };
    });

    const result = await executeKakaoSearchPlan(buildKakaoSearchPlan(request()), searchPage);

    expect(calls.slice(0, 2).every((call) => call.startsWith('category:'))).toBe(true);
    expect(calls.some((call) => call.endsWith(':p2'))).toBe(true);
    expect(result.metadata.requestCount).toBeLessThanOrEqual(KAKAO_SEARCH_LIMITS.maxRequests);
  });

  it('early-stops before page two once the unique candidate minimum is reached', async () => {
    const searchPage = jest.fn(async (query: KakaoSearchQuery): Promise<KakaoSearchOutcome> => ({
      query,
      status: 'success' as const,
      documents: Array.from({ length: 12 }, (_, index) => document(`${query.queryId}-${index}`)),
    }));

    await executeKakaoSearchPlan(buildKakaoSearchPlan(request()), searchPage);

    expect(searchPage.mock.calls.every(([query]) => query.page === 1)).toBe(true);
  });
});

describe('recommend-date Kakao fetch adapter and evidence', () => {
  it('builds category URL, server-only authorization, center, size, and pagination', async () => {
    const fetcher = jest.fn(async () => response(200, { documents: [document('1')] })) as KakaoFetch;
    const query = buildKakaoSearchPlan(request())[0];

    await fetchKakaoSearchPage({ ...query, page: 2 }, request().location, 'secret-key', fetcher);

    const [url, init] = (fetcher as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v2/local/search/category.json?');
    expect(url).toContain('category_group_code=FD6');
    expect(url).toContain('x=127.0374');
    expect(url).toContain('y=37.5444');
    expect(url).toContain('size=15');
    expect(url).toContain('page=2');
    expect(init.headers).toEqual({ Authorization: 'KakaoAK secret-key' });
    expect(init.signal).toBeDefined();
  });

  it('uses keyword endpoint and query text', async () => {
    const fetcher = jest.fn(async () => response(200, { documents: [] })) as KakaoFetch;
    const query = buildKakaoSearchPlan({ ...request(['drinks']), additionalRequest: '루프탑' })[0];

    await fetchKakaoSearchPage({ ...query, page: 1 }, request().location, 'secret-key', fetcher);

    const url = new URL((fetcher as jest.Mock).mock.calls[0][0]);
    expect(url.pathname).toBe('/v2/local/search/keyword.json');
    expect(url.searchParams.get('query')).toBe('술집');
  });

  it.each([
    [429, 'rate_limited'],
    [500, 'failure'],
  ] as const)('classifies HTTP %s without exposing raw response or key', async (status, expectedStatus) => {
    const fetcher = jest.fn(async () => response(status, { error: 'private body secret-key' })) as KakaoFetch;
    const query = buildKakaoSearchPlan(request())[0];

    const result = await fetchKakaoSearchPage({ ...query, page: 1 }, request().location, 'secret-key', fetcher);

    expect(result).toMatchObject({ status: expectedStatus, documents: [] });
    expect(JSON.stringify(result)).not.toContain('private body');
    expect(JSON.stringify(result)).not.toContain('secret-key');
  });

  it('classifies a bounded AbortController timeout and clears its timer', async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })) as KakaoFetch;
    const query = buildKakaoSearchPlan(request())[0];

    const pending = fetchKakaoSearchPage({ ...query, page: 1 }, request().location, 'secret-key', fetcher, 25);
    await jest.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toMatchObject({ status: 'timeout', documents: [] });
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('deduplicates only by stable Kakao ID and merges deterministic evidence', () => {
    const outcomes: KakaoSearchOutcome[] = [
      {
        query: { queryId: 'query_002', source: 'keyword', queryText: '데이트', page: 1 },
        status: 'success',
        documents: [document('same', { place_name: 'Same name' }), document('other', { place_name: 'Same name' })],
      },
      {
        query: { queryId: 'query_001', source: 'category', categoryCode: 'CE7', page: 1 },
        status: 'success',
        documents: [document('same')],
      },
      {
        query: { queryId: 'query_001', source: 'category', categoryCode: 'CE7', page: 2 },
        status: 'success',
        documents: [document('same'), document('', { id: '' }), document('bad-coord', { x: 'NaN' })],
      },
    ];

    const places = mergeKakaoSearchEvidence(outcomes);

    expect(places.map((place) => place.kakaoPlaceId)).toEqual(['other', 'same']);
    expect(places.find((place) => place.kakaoPlaceId === 'same')?.matchedSearchEvidence).toEqual([
      { queryId: 'query_001', source: 'category', page: 1, categoryCode: 'CE7' },
      { queryId: 'query_001', source: 'category', page: 2, categoryCode: 'CE7' },
      { queryId: 'query_002', source: 'keyword', page: 1, queryText: '데이트' },
    ]);
  });

  it('normalizes sparse duplicate documents and chooses the same canonical fields regardless of outcome order', () => {
    const sparse: KakaoSearchOutcome = {
      query: { queryId: 'query_002', source: 'keyword', queryText: '데이트', page: 1 },
      status: 'success',
      documents: [{
        id: 'same',
        place_name: 'Same',
        x: '127.02',
        y: '37.52',
      }],
    };
    const complete: KakaoSearchOutcome = {
      query: { queryId: 'query_001', source: 'category', categoryCode: 'FD6', page: 1 },
      status: 'success',
      documents: [{
        ...document('same'),
        place_name: 'Same',
        category_group_code: 'FD6',
        category_group_name: '음식점',
        category_name: '음식점 > 한식',
        x: '127.01',
        y: '37.51',
      }],
    };

    const forward = mergeKakaoSearchEvidence([sparse, complete]);
    const reversed = mergeKakaoSearchEvidence([complete, sparse]);

    expect(forward).toEqual(reversed);
    expect(forward).toHaveLength(1);
    expect(forward[0].matchedSearchEvidence).toHaveLength(2);
    expect(Object.values(forward[0]).some((value) => value === undefined)).toBe(false);
  });

  it('rejects blank or whitespace coordinates before numeric conversion', () => {
    const outcome: KakaoSearchOutcome = {
      query: { queryId: 'query_001', source: 'category', categoryCode: 'CE7', page: 1 },
      status: 'success',
      documents: [
        document('blank-x', { x: '' }),
        document('blank-y', { y: '   ' }),
        document('valid'),
      ],
    };

    expect(mergeKakaoSearchEvidence([outcome]).map((place) => place.kakaoPlaceId)).toEqual(['valid']);
  });

  it('preserves partial success, failure, rate-limit, and timeout metadata', async () => {
    const statuses = ['success', 'failure', 'rate_limited', 'timeout'] as const;
    let index = 0;
    const searchPage = jest.fn(async (query) => ({
      query,
      status: statuses[index++] ?? 'failure',
      documents: index === 1 ? [document('one')] : [],
    }));
    const plan = buildKakaoSearchPlan(request()).slice(0, 4);

    const result = await executeKakaoSearchPlan(plan, searchPage, { ...KAKAO_SEARCH_LIMITS, maxPagesPerQuery: 1 });

    expect(result.places).toHaveLength(1);
    expect(result.metadata.outcomes.map((outcome) => outcome.status)).toEqual(statuses);
    expect(result.metadata).toMatchObject({
      successfulCount: 1,
      failedCount: 1,
      rateLimitedCount: 1,
      timeoutCount: 1,
      allSearchesFailed: false,
    });
  });

  it('keeps all-failed search metadata available at the ranking pipeline boundary', async () => {
    const fetcher = jest.fn(async () => response(500, { error: 'private' })) as KakaoFetch;

    const result = await searchAndRankRecommendation(request(), {
      kakaoRestApiKey: 'secret-key',
      fetcher,
    });

    expect(result.candidates).toEqual([]);
    expect(result.searchMetadata.allSearchesFailed).toBe(true);
    expect(result.searchMetadata.failedCount).toBe(result.searchMetadata.requestCount);
  });

  it('applies the 40-place bound after category-aware recall instead of lexical pre-slicing', async () => {
    const fourCategoryRequest = request(['meal', 'cafe', 'culture', 'walk']);
    const docsByCode: Record<string, ReturnType<typeof document>[]> = {
      FD6: Array.from({ length: 15 }, (_, index) => document(`a-meal-${index}`, {
        category_group_code: 'FD6', category_group_name: '음식점', category_name: '음식점 > 한식',
      })),
      CE7: Array.from({ length: 15 }, (_, index) => document(`b-cafe-${index}`, {
        category_group_code: 'CE7', category_group_name: '카페', category_name: '음식점 > 카페',
      })),
      CT1: Array.from({ length: 15 }, (_, index) => document(`c-culture-${index}`, {
        category_group_code: 'CT1', category_group_name: '문화시설', category_name: '문화시설 > 전시',
      })),
      AT4: Array.from({ length: 15 }, (_, index) => document(`z-walk-${index}`, {
        category_group_code: 'AT4', category_group_name: '관광명소', category_name: '관광명소 > 공원',
      })),
    };
    const makeFetcher = (reverse: boolean): KakaoFetch => jest.fn(async (input: string | URL | Request) => {
      const code = new URL(String(input)).searchParams.get('category_group_code') ?? '';
      const documents = [...(docsByCode[code] ?? [])];
      return response(200, { documents: reverse ? documents.reverse() : documents });
    });

    const forward = await searchAndRankRecommendation(fourCategoryRequest, {
      kakaoRestApiKey: 'secret', fetcher: makeFetcher(false),
    });
    const reversed = await searchAndRankRecommendation(fourCategoryRequest, {
      kakaoRestApiKey: 'secret', fetcher: makeFetcher(true),
    });

    expect(forward.searchMetadata.requestCount).toBeLessThanOrEqual(KAKAO_SEARCH_LIMITS.maxRequests);
    expect(forward.candidates).toHaveLength(KAKAO_SEARCH_LIMITS.maxUniqueCandidates);
    expect(Object.values(forward.recallByCategory).every((count) => count > 0)).toBe(true);
    expect(reversed.candidates).toEqual(forward.candidates);
  });
});

describe('buildKakaoSearchPlan — step intent (Phase 1)', () => {
  const intentRequest = (additionalRequest: string): RecommendationRequest => ({
    ...request(['meal', 'cafe']),
    additionalRequest,
  });

  it('사전 매칭 시 step_intent 쿼리를 만들고 raw explicit 쿼리를 제거한다', () => {
    const plan = buildKakaoSearchPlan(intentRequest('삼겹살 먹고 싶어'));
    const stepIntent = plan.filter((item) => item.phase === 'step_intent');
    expect(stepIntent.map((item) => [item.queryText, item.expansionLevel])).toEqual([
      ['삼겹살', 0], ['돼지고기구이', 1], ['고기집', 2],
    ]);
    expect(stepIntent[0]).toMatchObject({
      stepId: 'step-0', canonicalTerm: '삼겹살', strength: 'preferred', source: 'keyword',
    });
    expect(plan.some((item) => item.phase === 'explicit')).toBe(false);
  });

  it('사전 미매칭 시 기존처럼 raw explicit 쿼리를 유지한다', () => {
    const plan = buildKakaoSearchPlan(intentRequest('감성 있는 곳이면 좋겠어'));
    expect(plan.some((item) => item.phase === 'step_intent')).toBe(false);
    expect(plan.find((item) => item.phase === 'explicit')?.queryText).toBe('감성 있는 곳이면 좋겠어');
  });

  it('step_intent 쿼리는 generic intent(데이트 코스)보다 앞에 온다', () => {
    const plan = buildKakaoSearchPlan(intentRequest('삼겹살'));
    const stepIntentIndex = plan.findIndex((item) => item.phase === 'step_intent');
    const genericIndex = plan.findIndex((item) => item.phase === 'intent');
    expect(stepIntentIndex).toBeGreaterThan(-1);
    expect(stepIntentIndex).toBeLessThan(genericIndex);
  });

  it('evidence에 phase/stepId/canonicalTerm/expansionLevel이 보존된다', () => {
    const plan = buildKakaoSearchPlan(intentRequest('삼겹살'));
    const exact = plan.find((item) => item.phase === 'step_intent' && item.expansionLevel === 0)!;
    const outcome: KakaoSearchOutcome = {
      query: { ...exact, page: 1 },
      status: 'success',
      documents: [document('intent-place')],
    };
    const [place] = mergeKakaoSearchEvidence([outcome]);
    expect(place.matchedSearchEvidence[0]).toMatchObject({
      phase: 'step_intent', stepId: 'step-0', canonicalTerm: '삼겹살', strength: 'preferred', expansionLevel: 0,
    });
  });

  it('실행 시 step_intent 쿼리가 required와 같은 1차 패스에서 실행된다', async () => {
    const searchPage = jest.fn(async (query: KakaoSearchQuery): Promise<KakaoSearchOutcome> => ({
      query,
      status: 'success' as const,
      documents: Array.from({ length: 12 }, (_, index) => document(`${query.queryId}-${index}`)),
    }));

    await executeKakaoSearchPlan(buildKakaoSearchPlan(intentRequest('삼겹살')), searchPage);

    const phases = searchPage.mock.calls.map(([query]) => (query as KakaoSearchQuery & { phase?: string }).phase);
    expect(phases).toContain('step_intent');
    expect(phases).not.toContain('intent');
  });
});
