# 카카오 검색 크로스 유저 캐시 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오 검색 결과를 크로스 유저 DB 캐시(TTL 30일)로 공유해 교체 시트 2~3초 로딩 제거 + 카카오 호출량 절감. 교체 시트 AI 큐레이션 제거(결정론 랭킹만).

**Architecture:** `kakao_search_cache` 테이블(service role 전용) + `_shared/kakao-search-cache.ts` read-through 래퍼. `searchAndRankRecommendation`에 optional `cacheStore` 주입 — `recommend-date`·`replacement-candidates` 양쪽 배선. 캐시 실패는 항상 카카오 라이브 폴백.

**Tech Stack:** Supabase Edge (Deno), supabase-js, Zod, Jest.

**규칙:** 스펙 = `docs/superpowers/specs/2026-07-18-kakao-search-cache-design.md`. 커밋은 사용자 명시 요청 시에만(PLAN.md 규칙 — 스킬 기본보다 우선). 각 태스크 종료 시 대상 Jest + `npm run validate`.

---

### Task 1: 마이그레이션 + 계약 테스트

**Files:**
- Create: `supabase/migrations/20260718020000_kakao_search_cache.sql`
- Test: `__tests__/kakaoSearchCacheMigration.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('kakao_search_cache migration', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260718020000_kakao_search_cache.sql'),
    'utf8',
  ).toLowerCase();

  it('creates a service-role-only cache table keyed by cache_key', () => {
    expect(sql).toContain('create table if not exists public.kakao_search_cache');
    expect(sql).toContain('cache_key text primary key');
    expect(sql).toContain('documents jsonb not null');
    expect(sql).toContain('fetched_at timestamptz not null default now()');
    expect(sql).toContain('alter table public.kakao_search_cache enable row level security');
    expect(sql).toContain('revoke all on table public.kakao_search_cache from anon, authenticated');
    expect(sql).not.toContain('create policy');
  });

  it('extends purge_expired_ai_data with the 30-day cache purge while keeping existing purges', () => {
    expect(sql).toContain("delete from public.recommendation_generation_attestations where created_at < now() - interval '30 days'");
    expect(sql).toContain("delete from public.ai_recommendation_logs where created_at < now() - interval '30 days'");
    expect(sql).toContain("delete from public.kakao_search_cache where fetched_at < now() - interval '30 days'");
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest kakaoSearchCacheMigration -t 'cache table'` → FAIL (파일 없음)

- [ ] **Step 3: 마이그레이션 작성**

```sql
begin;

create table if not exists public.kakao_search_cache (
  cache_key text primary key,
  endpoint text not null check (endpoint in ('category', 'keyword')),
  category_code text,
  query_text text,
  grid_latitude double precision not null,
  grid_longitude double precision not null,
  page integer not null check (page between 1 and 3),
  documents jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.kakao_search_cache enable row level security;
revoke all on table public.kakao_search_cache from anon, authenticated;

create or replace function public.purge_expired_ai_data()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.recommendation_generation_attestations where created_at < now() - interval '30 days';
  delete from public.ai_recommendation_logs where created_at < now() - interval '30 days';
  delete from public.kakao_search_cache where fetched_at < now() - interval '30 days';
end;
$$;
revoke all on function public.purge_expired_ai_data() from public;

commit;
```

- [ ] **Step 4: 통과 확인** — `npx jest kakaoSearchCacheMigration` → PASS

---

### Task 2: `_shared/kakao-search-cache.ts` — 스냅/키/스토어/래퍼

**Files:**
- Create: `supabase/functions/_shared/kakao-search-cache.ts`
- Test: `__tests__/kakaoSearchCache.test.ts`

- [ ] **Step 1: 실패 테스트 작성** (핵심 케이스 전부)

```ts
import {
  KAKAO_CACHE_GRID_DEGREES,
  KAKAO_SEARCH_CACHE_TTL_DAYS,
  buildKakaoSearchCacheKey,
  createCachedKakaoSearchPage,
  snapCoordinateToCacheGrid,
  snapLocationToCacheGrid,
  type KakaoSearchCacheEntry,
  type KakaoSearchCacheStore,
} from '../supabase/functions/_shared/kakao-search-cache';
import type { KakaoSearchOutcome, KakaoSearchPlanItem, KakaoSearchQuery } from '../supabase/functions/_shared/recommendation-search';

const planItem = (overrides: Partial<KakaoSearchPlanItem> = {}): KakaoSearchPlanItem => ({
  queryId: 'q1', source: 'category', categoryCode: 'CE7', phase: 'required', ...overrides,
} as KakaoSearchPlanItem);
const query = (overrides: Partial<KakaoSearchQuery> = {}): KakaoSearchQuery => ({
  ...planItem(), page: 1, ...overrides,
} as KakaoSearchQuery);
const location = { latitude: 37.5674, longitude: 126.9827 } as never;
const memoryStore = (initial: Record<string, unknown[]> = {}) => {
  const rows = new Map(Object.entries(initial));
  const puts: KakaoSearchCacheEntry[] = [];
  const store: KakaoSearchCacheStore = {
    fetchFresh: jest.fn(async (keys: readonly string[]) => new Map([...rows].filter(([k]) => keys.includes(k))) as never),
    put: jest.fn(async (entry: KakaoSearchCacheEntry) => { puts.push(entry); }),
  };
  return { store, puts };
};

describe('grid snap and cache key', () => {
  it('snaps coordinates onto the 0.005-degree grid with stable 3-decimal key parts', () => {
    expect(KAKAO_CACHE_GRID_DEGREES).toBe(0.005);
    expect(snapCoordinateToCacheGrid(37.5674)).toBeCloseTo(37.565, 10);
    expect(snapLocationToCacheGrid(location)).toEqual(expect.objectContaining({ latitude: expect.any(Number) }));
    const key = buildKakaoSearchCacheKey({ categoryCode: 'CE7', page: 1 }, { latitude: 37.5674, longitude: 126.9827 });
    expect(key).toBe('category|CE7|37.565|126.985|1');
  });
  it('keys keyword queries by their query text with the shared default', () => {
    expect(buildKakaoSearchCacheKey({ queryText: '술집', page: 2 }, { latitude: 37.5674, longitude: 126.9827 }))
      .toBe('keyword|술집|37.565|126.985|2');
    expect(buildKakaoSearchCacheKey({ page: 1 }, { latitude: 37.5674, longitude: 126.9827 }))
      .toBe('keyword|데이트 장소|37.565|126.985|1');
  });
  it('shares the same key for two users in the same grid cell and splits across cells', () => {
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
    const searchPage = createCachedKakaoSearchPage({ plan: [planItem()], center: location, store, kakaoRestApiKey: 'k', fetchPage: fetchPage as never, metrics });
    const outcome = await searchPage(query());
    expect(outcome.status).toBe('success');
    expect(outcome.documents).toEqual([{ id: 'doc-1' }]);
    expect(fetchPage).not.toHaveBeenCalled();
    expect(metrics).toEqual({ hits: 1, misses: 0, kakaoCalls: 0 });
  });
  it('prefetches every plan key (pages 1..max) in a single store read', async () => {
    const { store } = memoryStore();
    const fetchPage = jest.fn(async (q: KakaoSearchQuery): Promise<KakaoSearchOutcome> => ({ query: q, status: 'success', documents: [] }));
    const searchPage = createCachedKakaoSearchPage({ plan: [planItem(), planItem({ queryId: 'q2', categoryCode: undefined, queryText: '술집', source: 'keyword' })], center: location, store, kakaoRestApiKey: 'k', fetchPage: fetchPage as never });
    await searchPage(query());
    await searchPage(query({ queryId: 'q2', categoryCode: undefined, queryText: '술집' }));
    expect(store.fetchFresh).toHaveBeenCalledTimes(1);
    expect((store.fetchFresh as jest.Mock).mock.calls[0][0]).toHaveLength(4);
  });
  it('falls through to Kakao with the snapped center on miss and upserts successful outcomes', async () => {
    const { store, puts } = memoryStore();
    const fetchPage = jest.fn(async (q: KakaoSearchQuery): Promise<KakaoSearchOutcome> => ({ query: q, status: 'success', documents: [{ id: 'live' }] as never }));
    const metrics = { hits: 0, misses: 0, kakaoCalls: 0 };
    const searchPage = createCachedKakaoSearchPage({ plan: [planItem()], center: location, store, kakaoRestApiKey: 'k', fetchPage: fetchPage as never, metrics });
    const outcome = await searchPage(query());
    expect(outcome.documents).toEqual([{ id: 'live' }]);
    expect(fetchPage.mock.calls[0][1]).toEqual(expect.objectContaining({ latitude: snapCoordinateToCacheGrid(location.latitude), longitude: snapCoordinateToCacheGrid(location.longitude) }));
    await Promise.resolve();
    expect(puts).toHaveLength(1);
    expect(puts[0]).toEqual(expect.objectContaining({ endpoint: 'category', categoryCode: 'CE7', page: 1, documents: [{ id: 'live' }] }));
    expect(metrics).toEqual({ hits: 0, misses: 1, kakaoCalls: 1 });
  });
  it('caches empty successful pages but never failure/rate_limited/timeout outcomes', async () => {
    const { store, puts } = memoryStore();
    const statuses: KakaoSearchOutcome['status'][] = ['success', 'failure', 'rate_limited', 'timeout'];
    let call = 0;
    const fetchPage = jest.fn(async (q: KakaoSearchQuery): Promise<KakaoSearchOutcome> => ({ query: q, status: statuses[call++], documents: [] }));
    const searchPage = createCachedKakaoSearchPage({ plan: [planItem()], center: location, store, kakaoRestApiKey: 'k', fetchPage: fetchPage as never });
    await searchPage(query());
    await searchPage(query({ page: 2 }));
    await searchPage(query({ page: 3 }));
    await searchPage(query({ page: 3 }));
    await Promise.resolve();
    expect(puts).toHaveLength(1);
  });
  it('treats store read/write failures as misses and never breaks the search', async () => {
    const store: KakaoSearchCacheStore = {
      fetchFresh: jest.fn(async () => { throw new Error('db down'); }),
      put: jest.fn(async () => { throw new Error('db down'); }),
    };
    const fetchPage = jest.fn(async (q: KakaoSearchQuery): Promise<KakaoSearchOutcome> => ({ query: q, status: 'success', documents: [{ id: 'live' }] as never }));
    const searchPage = createCachedKakaoSearchPage({ plan: [planItem()], center: location, store, kakaoRestApiKey: 'k', fetchPage: fetchPage as never });
    const outcome = await searchPage(query());
    expect(outcome.status).toBe('success');
    expect(outcome.documents).toEqual([{ id: 'live' }]);
  });
});

describe('TTL constant', () => {
  it('keeps the cache TTL aligned with the 30-day AI data retention policy', () => {
    expect(KAKAO_SEARCH_CACHE_TTL_DAYS).toBe(30);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest kakaoSearchCache.test` → FAIL (모듈 없음)

- [ ] **Step 3: 구현**

```ts
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
        (data as { cache_key: string; documents: KakaoDocument[] }[])
          .filter((row) => typeof row.cache_key === 'string' && Array.isArray(row.documents))
          .map((row) => [row.cache_key, row.documents]),
      );
    },
    put: async (entry) => {
      await client.from('kakao_search_cache').upsert({
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

  const prefetchAll = (): Promise<Map<string, KakaoDocument[]>> => {
    if (!prefetch) {
      const keys = [...new Set(options.plan.flatMap((item) => {
        const itemKeys: string[] = [];
        for (let page = 1; page <= maxPages; page += 1) {
          itemKeys.push(buildKakaoSearchCacheKey({ categoryCode: item.categoryCode, queryText: item.queryText, page }, snappedCenter));
        }
        return itemKeys;
      }))];
      prefetch = options.store.fetchFresh(keys).catch(() => new Map<string, KakaoDocument[]>());
    }
    return prefetch;
  };

  return async (query) => {
    const cached = await prefetchAll();
    const cacheKey = buildKakaoSearchCacheKey(query, snappedCenter);
    const documents = cached.get(cacheKey);
    if (documents) {
      if (options.metrics) options.metrics.hits += 1;
      return { query, status: 'success', documents };
    }
    if (options.metrics) {
      options.metrics.misses += 1;
      options.metrics.kakaoCalls += 1;
    }
    const outcome = await fetchPage(query, snappedCenter, options.kakaoRestApiKey, options.fetcher);
    if (outcome.status === 'success') {
      void options.store.put({
        cacheKey,
        endpoint: query.categoryCode ? 'category' : 'keyword',
        ...(query.categoryCode ? { categoryCode: query.categoryCode } : { queryText: query.queryText ?? DEFAULT_KEYWORD_QUERY }),
        gridLatitude: snapCoordinateToCacheGrid(options.center.latitude),
        gridLongitude: snapCoordinateToCacheGrid(options.center.longitude),
        page: query.page,
        documents: outcome.documents,
      }).catch(() => { /* cache write must never break search */ });
    }
    return outcome;
  };
}
```

- [ ] **Step 4: 통과 확인** — `npx jest kakaoSearchCache.test` → PASS. 캐시된 빈 페이지 케이스에서 page 2/3 재호출 시나리오가 prefetch Map 기준인지 주의(성공 캐시는 다음 요청의 prefetch에서만 반영 — 동일 인스턴스 내 재조회 아님. 테스트의 4번째 호출은 같은 인스턴스라 미스가 정상이며 puts 길이로만 검증).

---

### Task 3: 파이프라인에 optional cacheStore 주입

**Files:**
- Modify: `supabase/functions/_shared/recommendation-search-pipeline.ts`
- Test: `__tests__/kakaoSearchCache.test.ts` (추가 describe)

- [ ] **Step 1: 실패 테스트 추가** (같은 테스트 파일에)

```ts
import { searchAndRankRecommendation } from '../supabase/functions/_shared/recommendation-search-pipeline';

describe('searchAndRankRecommendation cache wiring', () => {
  it('routes plan execution through the cache wrapper when a cacheStore is provided', async () => {
    const request = {
      requestId: 'req-1', mode: 'course',
      location: { latitude: 37.5674, longitude: 126.9827, name: '을지로입구역', kakaoPlaceId: 'loc-1' },
      courseSteps: [{ id: 'meal', category: 'meal', label: '식사' }, { id: 'cafe', category: 'cafe', label: '카페' }],
    } as never;
    const key = buildKakaoSearchCacheKey({ categoryCode: 'FD6', page: 1 }, { latitude: 37.5674, longitude: 126.9827 });
    const { store } = memoryStore({ [key]: [] });
    const metrics = { hits: 0, misses: 0, kakaoCalls: 0 };
    const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ documents: [] }) }));
    await searchAndRankRecommendation(request, { kakaoRestApiKey: 'k', fetcher: fetcher as never, cacheStore: store, cacheMetrics: metrics });
    expect(store.fetchFresh).toHaveBeenCalledTimes(1);
    expect(metrics.hits).toBeGreaterThanOrEqual(1);
  });
});
```

(주의: request는 `buildKakaoSearchPlan`이 소비 가능한 최소 형태 — 실제 필드는 기존 `recommend-date-search-server.test.ts`의 request 픽스처를 재사용해 맞춘다.)

- [ ] **Step 2: 실패 확인** — `npx jest kakaoSearchCache.test -t 'cache wiring'` → FAIL (`cacheStore` 미지원)

- [ ] **Step 3: 파이프라인 수정**

```ts
import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import {
  buildKakaoSearchPlan,
  executeKakaoSearchPlan,
  fetchKakaoSearchPage,
  KAKAO_SEARCH_LIMITS,
  type KakaoFetch,
  type KakaoSearchMetadata,
} from './recommendation-search.ts';
import {
  createCachedKakaoSearchPage,
  type KakaoCacheMetrics,
  type KakaoSearchCacheStore,
} from './kakao-search-cache.ts';
import {
  rankPlaceCandidates,
  type RankedRecommendationSearch,
} from './recommendation-ranking.ts';

export type RecommendationSearchPipelineResult = RankedRecommendationSearch & {
  searchMetadata: KakaoSearchMetadata;
};

export async function searchAndRankRecommendation(
  request: RecommendationRequest,
  dependencies: {
    kakaoRestApiKey: string;
    fetcher?: KakaoFetch;
    cacheStore?: KakaoSearchCacheStore;
    cacheMetrics?: KakaoCacheMetrics;
  },
): Promise<RecommendationSearchPipelineResult> {
  const plan = buildKakaoSearchPlan(request);
  const searchPage = dependencies.cacheStore
    ? createCachedKakaoSearchPage({
      plan,
      center: request.location,
      store: dependencies.cacheStore,
      kakaoRestApiKey: dependencies.kakaoRestApiKey,
      fetcher: dependencies.fetcher,
      metrics: dependencies.cacheMetrics,
    })
    : (query: Parameters<typeof fetchKakaoSearchPage>[0]) => fetchKakaoSearchPage(
      query,
      request.location,
      dependencies.kakaoRestApiKey,
      dependencies.fetcher,
    );
  const search = await executeKakaoSearchPlan(plan, searchPage);
  return {
    ...rankPlaceCandidates(search.places, request, { limit: KAKAO_SEARCH_LIMITS.maxUniqueCandidates }),
    searchMetadata: search.metadata,
  };
}
```

- [ ] **Step 4: 통과 확인** — `npx jest kakaoSearchCache.test recommend-date-search-server` → PASS (기존 호출부 무회귀 — cacheStore 없으면 기존 경로 그대로)

---

### Task 4: `recommend-date` Edge 배선 + 관측 로그

**Files:**
- Modify: `supabase/functions/recommend-date/index.ts`
- Test: `__tests__/kakaoSearchCacheWiring.test.ts` (신규 — 소스 문자열 계약, 기존 wiring 테스트 패턴)

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('kakao search cache edge wiring', () => {
  const root = join(__dirname, '..');
  const recommendDate = readFileSync(join(root, 'supabase/functions/recommend-date/index.ts'), 'utf8');
  const replacement = readFileSync(join(root, 'supabase/functions/replacement-candidates/index.ts'), 'utf8');

  it('routes recommend-date search through the service-role cache store and logs lookup metrics', () => {
    expect(recommendDate).toContain('createSupabaseKakaoSearchCacheStore');
    expect(recommendDate).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(recommendDate).toContain('cacheStore');
    expect(recommendDate).toContain('kakao_cache_lookup');
    expect(recommendDate).toContain('searchTotalMs');
  });

  it('routes replacement-candidates search through the same cache store and logs serving metrics', () => {
    expect(replacement).toContain('createSupabaseKakaoSearchCacheStore');
    expect(replacement).toContain('cacheStore');
    expect(replacement).toContain('replacement_candidates_served');
    expect(replacement).toContain('poolSize');
  });

  it('keeps the replacement sheet fully deterministic — no AI curation call', () => {
    expect(replacement).not.toContain('invokeGenerateAiSelection');
    expect(replacement).not.toContain('buildReplacementSelectionPrompt');
    expect(replacement).not.toContain('selectCuratedReplacementCandidates');
    expect(replacement).toContain('rankReplacementCandidates');
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest kakaoSearchCacheWiring` → FAIL

- [ ] **Step 3: `recommend-date/index.ts` 수정** — `searchCandidates` 의존성 교체:

```ts
import { createSupabaseKakaoSearchCacheStore } from '../_shared/kakao-search-cache.ts';
// ...기존 import 유지

    searchCandidates: async (input) => {
      const startedAt = Date.now();
      const cacheMetrics = { hits: 0, misses: 0, kakaoCalls: 0 };
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const result = await searchAndRankRecommendation(input, {
        kakaoRestApiKey: Deno.env.get('KAKAO_REST_API_KEY') ?? '',
        fetcher: fetch,
        cacheStore: createSupabaseKakaoSearchCacheStore(serviceClient),
        cacheMetrics,
      });
      console.error(JSON.stringify({
        event: 'kakao_cache_lookup',
        fn: 'recommend-date',
        ...cacheMetrics,
        searchTotalMs: Date.now() - startedAt,
      }));
      return result;
    },
```

- [ ] **Step 4: 부분 통과 확인** — `npx jest kakaoSearchCacheWiring -t 'recommend-date'` → PASS. `npx jest recommend-date-server -t 'transitive'` → PASS (Deno import graph에 신규 파일 포함 확인)

---

### Task 5: `replacement-candidates` — AI 큐레이션 제거 + 캐시 배선

**Files:**
- Modify: `supabase/functions/replacement-candidates/index.ts`
- Modify: `__tests__/replacementCandidatesWiring.test.ts` (큐레이션 계약 테스트 반전)
- Modify: `shared/recommendation/replacement-candidates.ts` (`selectCuratedReplacementCandidates` 제거)
- Modify: `lib/replacement-candidates.ts` (재수출 제거)
- Modify: `supabase/functions/_shared/recommendation-prompt.ts` (`buildReplacementSelectionPrompt`·`REPLACEMENT_SELECT_PROMPT_VERSION` 제거)
- Modify: `__tests__/replacementCandidates.test.ts` (큐레이션 케이스 제거)
- Delete: `__tests__/replacementSelectionPrompt.test.ts`
- 유지: `generate-ai`의 `replacement_select` action + 관련 마이그레이션/테스트 (soft_message 전례 — 인프라 보존)

- [ ] **Step 1: 기존 wiring 테스트의 큐레이션 계약 테스트 교체** — `'curates the deterministic candidate pool with Haiku...'` it 블록 삭제 (신규 계약은 Task 4의 `kakaoSearchCacheWiring.test.ts`가 담당). `replacementCandidates.test.ts`에서 `selectCuratedReplacementCandidates` import·describe 제거. `__tests__/replacementSelectionPrompt.test.ts` 삭제.

- [ ] **Step 2: 실패 확인** — `npx jest kakaoSearchCacheWiring -t 'deterministic'` → FAIL (edge에 아직 AI 호출 존재)

- [ ] **Step 3: edge 수정** — import에서 `selectCuratedReplacementCandidates`/`buildReplacementSelectionPrompt`/`REPLACEMENT_SELECT_PROMPT_VERSION`/`invokeGenerateAiSelection` 제거, `createSupabaseKakaoSearchCacheStore` 추가. try 블록 교체:

```ts
  const startedAt = Date.now();
  const cacheMetrics = { hits: 0, misses: 0, kakaoCalls: 0 };
  try {
    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const search = await searchAndRankRecommendation(currentRequest, {
      kakaoRestApiKey: Deno.env.get('KAKAO_REST_API_KEY') ?? '',
      fetcher: fetch,
      cacheStore: createSupabaseKakaoSearchCacheStore(serviceClient),
      cacheMetrics,
    });
    // toStep / previousStep / nextStep / ranked 계산은 기존 그대로 유지
    const ranked = rankReplacementCandidates({ /* 기존 인자 그대로 */ });
    console.error(JSON.stringify({
      event: 'replacement_candidates_served',
      totalMs: Date.now() - startedAt,
      ...cacheMetrics,
      poolSize: ranked.pool.length,
    }));
    return new Response(JSON.stringify({ targetStepId: target.step_id, top: ranked.top, additional: ranked.additional, limit: 15 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'PLACE_SEARCH_TIMEOUT' }), { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
```

(`let top/additional` 및 curation try-catch 블록 전체 삭제.)

- [ ] **Step 4: 고아 심볼 제거** — `shared/recommendation/replacement-candidates.ts`에서 `selectCuratedReplacementCandidates`(+전용 타입) 삭제, `lib/replacement-candidates.ts` 재수출 정리, `recommendation-prompt.ts`에서 replacement 프롬프트 빌더·버전 상수 삭제. `rg -n "selectCuratedReplacementCandidates|buildReplacementSelectionPrompt|REPLACEMENT_SELECT_PROMPT_VERSION" --glob '!docs/**'` → 0건 확인.

- [ ] **Step 5: 통과 확인** — `npx jest kakaoSearchCacheWiring replacementCandidates replacementCandidatesWiring` → PASS

---

### Task 6: 전체 게이트

- [ ] `npx jest --runInBand` 전체 → PASS (신규 포함)
- [ ] `npm run validate` → 에러 0
- [ ] `git diff --check` → 클린
- [ ] Deno import graph 테스트 2종(`recommend-date-server`, 기존 replacement 관련) PASS 재확인

---

### Task 7: 배포 (마이그레이션 → 함수)

- [ ] **Step 1:** MCP `apply_migration`으로 `20260718020000_kakao_search_cache` linked Supabase(`wqjguifsmtblgrhdfnji`) 적용, `list_migrations`로 history 기록 확인
- [ ] **Step 2:** 원격 검증 SQL — 테이블 존재·RLS relrowsecurity=true·anon/authenticated 권한 0·`purge_expired_ai_data` 정의에 cache delete 포함
- [ ] **Step 3:** MCP `deploy_edge_function` — `recommend-date` (신규 `_shared/kakao-search-cache.ts` 포함 전체 파일 셋)
- [ ] **Step 4:** MCP `deploy_edge_function` — `replacement-candidates`
- [ ] **Step 5:** 원격 스모크 — 두 함수 OPTIONS 204, invalid-JWT 401

---

### Task 8: KPI 시뮬레이션 + 보고

**전략:** 임시 인증 유저로 실제 E2E 호출(1안). 1안 불가 시 사용자 실기기 조작 + edge 로그 수집(2안 폴백).

- [ ] **Step 1: 임시 유저 준비 (1안)** — MCP `execute_sql`로 `auth.users`+`auth.identities`에 crypt 패스워드 유저 삽입(기존 세션 AQ의 라이브 재현 패턴) → GoTrue `POST /auth/v1/token?grant_type=password`(anon key)로 JWT 발급. 실패(프로바이더 비활성 등) 시 2안 전환.
- [ ] **Step 2: 사전 조건** — JWT로 `record_ai_data_processing_consent` RPC 호출(Phase 13 동의 게이트).
- [ ] **Step 3: 콜드/웜 측정 스크립트** — scratchpad에 Node 스크립트(`npx tsx`, shared 스키마로 요청 검증):
  - `recommend-date` 콜드 1회(신규 셀 좌표) → `persist_recommendation_session` RPC → 세션 확보
  - `replacement-candidates` 콜드 1회 + 웜 3회 — 각 total ms 기록
  - `recommend-date` 웜 1회(같은 셀, 새 requestId) — total ms
  - 같은 셀 내 다른 좌표(+0.001°)로 `recommend-date` 1회 — 크로스 셀 공유 검증
- [ ] **Step 4: 데이터 수집** — MCP `get_logs`로 `kakao_cache_lookup`/`replacement_candidates_served` 이벤트의 hits/misses/kakaoCalls/searchTotalMs 추출. `execute_sql`로 `kakao_search_cache` 행 수·키 분포 확인.
- [ ] **Step 5: 품질 KPI** — 웜 교체 응답의 top3를 카테고리 일치·도보 거리로 타당성 점검. AI 큐레이션 대비 정량 비교는 불가(제거됨)를 명시하되, 기존에도 AI 실패 시 결정론 폴백이 프로덕션 경로였음을 근거로 서술.
- [ ] **Step 6: 정리** — 임시 유저의 세션/attestation/카드 삭제 + auth 유저 삭제(SQL). 캐시 행은 실사용 자산이므로 유지.
- [ ] **Step 7: KPI 보고** — 표로 보고: 교체 콜드 vs 웜 ms, 생성 검색 콜드 vs 웜 ms, 카카오 호출 수(콜드/웜), 크로스 셀 히트 여부, 후보 documents 동일성(정확도 중립 확인), top3 타당성. **미화 없이.**

---

### Task 9: 문서/메모리 갱신

- [ ] `PLAN.md` — Pending Approval에 [Done] 한 줄 추가
- [ ] `RESULT.md` — 세션 항목 추가(변경·배포·KPI 결과·남은 것)
- [ ] 메모리 `next-step-candidate-caching.md` 갱신 — 완료 + 실제 채택 방향(세션 풀 대신 크로스 유저 캐시) 기록, `MEMORY.md` 인덱스 줄 수정
- [ ] 실기기 확인 항목 안내(Xcode Run 불필요 — 클라 무변경, 앱 그대로 교체 시트만 빨라짐)

---

## Self-Review 결과

- 스펙 커버리지: 스키마(T1), 스냅/래퍼/실패의미론(T2), 파이프라인(T3), 소비자 배선+관측(T4·T5), AI 제거(T5), 배포 순서(T7), KPI(T8) — 전부 매핑됨.
- 타입 일관성: `KakaoSearchCacheStore.fetchFresh/put`, `cacheMetrics {hits,misses,kakaoCalls}` 전 태스크 동일.
- 주의점 명시: 캐시 히트는 같은 요청 인스턴스 내 미스 재조회를 하지 않음(prefetch 1회 원칙), `put`은 fire-and-forget.
