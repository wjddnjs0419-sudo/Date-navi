# 장소 지식 원장(Place Knowledge Ledger) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세션 수명과 무관하게 살아남는 `places` 원장을 만들고, AI 가격 추정 + 리뷰 관측으로 예산 기능을 배선하며, AI 로그를 집계 후 삭제하는 보존 체계를 세운다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-26-place-knowledge-ledger-design.md` 기준. ① 순수 로직(shared/lib) → ② 마이그레이션 4개(집계→원장→뷰→pg_cron 순서 고정) → ③ Edge(추정 액션 + 응답 후 백그라운드 upsert + 랭킹 budget 점수) → ④ 리뷰 UI 장소별 등급 → ⑤ 배포·백필. 부가 기록은 절대 원본 쓰기를 실패시키지 않는다(모든 원장 쓰기는 exception-swallow).

**Tech Stack:** Supabase Postgres(마이그레이션은 MCP `apply_migration`), Deno Edge Functions, Expo RN, Jest, zod. TDD(RED→GREEN→REFACTOR) 필수.

**중요 전제(코드 조사로 확정된 사실):**
- 카드→세션 연결은 `recommendation_sessions.confirmed_card_id`(unique partial index 존재).
- `recommendation_course_steps`에는 `category_name`이 **없다**. Kakao 세분 카테고리는 생성 시점의 `EvidencedKakaoPlace.categoryName`([recommendation-search.ts:69](supabase/functions/_shared/recommendation-search.ts#L69))에만 있으므로 upsert는 Edge 생성 경로에서 해야 한다.
- 세션 select RLS는 owner 전용 → 파트너는 리뷰 화면에서 스텝을 직접 못 읽는다. security definer RPC 필요.
- `record_recommendation_place_feedback`도 owner 전용 → 커플 멤버 허용으로 완화 필요.
- `ai_recommendation_logs.action`에 check 제약 있음 → `estimate_place_price` 추가 마이그레이션 필요.
- 랭킹 `budget: 0` 하드코딩 위치: [recommendation-ranking.ts:232](supabase/functions/_shared/recommendation-ranking.ts#L232).
- `recommendation-ranking.ts`는 `replacement-candidates`도 공유 → 배포 시 recommend-date·generate-ai·replacement-candidates 세 함수 모두 재배포(메모리: 공유 스키마 변경 = 전 함수 재배포 사고 이력).

**Phase 1 실행 중 확정된 결정(2026-07-26, 코드 리뷰 반영. 1·2는 사용자 승인, 3은 사용자 질의에 답하며 정리):**
1. **관측 구간 계산은 비보간 표본 선택이 정본이다.** 계획 원안의 보간 백분위는 자기 테스트를 실패시켰다(하한 후보 [5000, 5200, 90000]의 0.75분위가 47600으로 튀어 상한 12000과 모순). `shared/recommendation/place-price.ts`의 `samplePercentile`이 규칙을 고정하며, **Task 4의 SQL이 이 규칙을 따라간다**(아래 SQL 반영 완료). `percentile_cont`도 `percentile_disc`도 이 규칙과 다르므로 `array_agg` 첨자로 직접 계산한다.
2. **관측이 추정을 덮으려면 표본 3건 이상**(`OBSERVED_MIN_SAMPLE_COUNT`). 미만이면 추정을 유지하고, 추정도 없으면 unknown. 임계치는 소비 시점(`pickPriceRange`)에만 적용하고 DB에는 관측을 그대로 저장한다 — 임계치를 나중에 바꿔도 재계산이 필요 없게.
3. **만족도 무응답과 부정 응답을 구별한다.** `revisit` 태그 유무로 역추적하면 "별로였다"와 "말 안 했다"가 같은 모양이 되어, 가격만 답한 사용자가 만족도까지 깎는다. `place_feedback`에 만족도 컬럼(nullable: null=무응답)을 두고 집계는 non-null만 센다. **Task 4 마이그레이션과 Task 11 리뷰 UI·Task 2의 `placeFeedbackRpcArgs`가 함께 반영해야 한다.**

**승인 게이트(사용자 확인 후 진행):**
1. Task 6·13 이전 — 원격 마이그레이션 적용(특히 pg_cron 활성화·삭제 스케줄 시작).
2. Task 14 이전 — Edge 3함수 재배포.
3. Task 15 백필 실행(AI 호출 비용: 장소 51곳 × haiku 1회 ≈ 무시 가능하나 보고).

---

## Task 1: `shared/recommendation/place-price.ts` — 가격 순수 로직

**Files:**
- Create: `shared/recommendation/place-price.ts`
- Test: `__tests__/place-price.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/place-price.test.ts
import {
  priceAnchorKRW,
  observedBoundsFromAnswers,
  pickPriceRange,
  budgetScoreFor,
  shrunkPositiveRate,
  PRICE_LEVEL,
} from '../shared/recommendation/place-price';

describe('priceAnchorKRW', () => {
  it('예산을 코스 장소 수로 나눈 몫이 앵커다', () => {
    expect(priceAnchorKRW(30000, 3)).toBe(10000);
  });
  it('장소 수 0 이하나 예산 없음은 null', () => {
    expect(priceAnchorKRW(30000, 0)).toBeNull();
    expect(priceAnchorKRW(undefined, 3)).toBeNull();
  });
});

describe('observedBoundsFromAnswers', () => {
  it('비쌈은 하한, 저렴은 상한을 준다', () => {
    const result = observedBoundsFromAnswers([
      { priceLevel: PRICE_LEVEL.expensive, anchorKRW: 10000 },
      { priceLevel: PRICE_LEVEL.cheap, anchorKRW: 20000 },
    ]);
    expect(result).toEqual({ minKRW: 10000, maxKRW: 20000, contradictory: false });
  });
  it('극단값 한 건이 구간을 붕괴시키지 않는다(안쪽 백분위)', () => {
    // 하한 후보 [5000, 5200, 90000] — p75가 아닌 극단 max(90000)를 쓰면 상한과 모순난다.
    const result = observedBoundsFromAnswers([
      { priceLevel: PRICE_LEVEL.expensive, anchorKRW: 5000 },
      { priceLevel: PRICE_LEVEL.expensive, anchorKRW: 5200 },
      { priceLevel: PRICE_LEVEL.expensive, anchorKRW: 90000 },
      { priceLevel: PRICE_LEVEL.cheap, anchorKRW: 12000 },
    ]);
    expect(result.contradictory).toBe(false);
    expect(result.minKRW).toBeLessThanOrEqual(result.maxKRW!);
  });
  it('보정 후에도 하한 > 상한이면 contradictory', () => {
    const result = observedBoundsFromAnswers([
      { priceLevel: PRICE_LEVEL.expensive, anchorKRW: 30000 },
      { priceLevel: PRICE_LEVEL.cheap, anchorKRW: 5000 },
    ]);
    expect(result.contradictory).toBe(true);
    expect(result.minKRW).toBeNull();
    expect(result.maxKRW).toBeNull();
  });
  it('보통 답변은 구간에 관여하지 않는다', () => {
    expect(observedBoundsFromAnswers([{ priceLevel: PRICE_LEVEL.normal, anchorKRW: 10000 }]))
      .toEqual({ minKRW: null, maxKRW: null, contradictory: false });
  });
});

describe('pickPriceRange (소비 규칙: 관측 > 추정 > 모름)', () => {
  const base = {
    estimatedMinKRW: 8000, estimatedMaxKRW: 12000,
    observedMinKRW: null as number | null, observedMaxKRW: null as number | null,
  };
  it('관측이 하나라도 있으면 관측만 쓴다', () => {
    expect(pickPriceRange({ ...base, observedMinKRW: 15000 }))
      .toEqual({ source: 'observed', minKRW: 15000, maxKRW: null });
  });
  it('관측 없으면 추정', () => {
    expect(pickPriceRange(base)).toEqual({ source: 'estimated', minKRW: 8000, maxKRW: 12000 });
  });
  it('둘 다 없으면 unknown', () => {
    expect(pickPriceRange({ estimatedMinKRW: null, estimatedMaxKRW: null, observedMinKRW: null, observedMaxKRW: null }))
      .toEqual({ source: 'unknown', minKRW: null, maxKRW: null });
  });
});

describe('budgetScoreFor', () => {
  it('상한이 1인 몫 이하이면 가점', () => {
    expect(budgetScoreFor({ source: 'estimated', minKRW: 5000, maxKRW: 9000 }, 10000)).toBeGreaterThan(0);
  });
  it('하한이 몫의 1.5배를 넘으면 감점', () => {
    expect(budgetScoreFor({ source: 'estimated', minKRW: 20000, maxKRW: 30000 }, 10000)).toBeLessThan(0);
  });
  it('unknown은 0 — 어떤 필터링에도 관여하지 않는다', () => {
    expect(budgetScoreFor({ source: 'unknown', minKRW: null, maxKRW: null }, 10000)).toBe(0);
  });
  it('앵커 없으면 0', () => {
    expect(budgetScoreFor({ source: 'estimated', minKRW: 5000, maxKRW: 9000 }, null)).toBe(0);
  });
});

describe('shrunkPositiveRate (축소 보정)', () => {
  it('회귀: 표본 1건 긍정이 100%가 되지 않는다', () => {
    const rate = shrunkPositiveRate({ positives: 1, total: 1, priorRate: 0.6, priorStrength: 10 });
    expect(rate).toBeLessThan(1);
    expect(rate).toBeGreaterThan(0.6);
  });
  it('표본이 쌓일수록 자기 값에 수렴한다', () => {
    const small = shrunkPositiveRate({ positives: 1, total: 1, priorRate: 0.6, priorStrength: 10 });
    const large = shrunkPositiveRate({ positives: 100, total: 100, priorRate: 0.6, priorStrength: 10 });
    expect(large).toBeGreaterThan(small);
    expect(large).toBeCloseTo(1, 1);
  });
  it('표본 0이면 prior 그대로', () => {
    expect(shrunkPositiveRate({ positives: 0, total: 0, priorRate: 0.6, priorStrength: 10 })).toBe(0.6);
  });
});
```

- [x] **Step 2: 실패 확인** — `npx jest __tests__/place-price.test.ts` → FAIL(모듈 없음).

- [x] **Step 3: 구현**

```ts
// shared/recommendation/place-price.ts
// 장소 가격 두 계층(추정/관측)의 순수 계산. 스펙 §2·§5-1 참조.
// DB·네트워크 의존 없음 — Edge와 SQL 재계산 로직이 같은 규칙을 공유하도록 단일 소스.

export const PRICE_LEVEL = { cheap: 1, normal: 2, expensive: 3 } as const;
export type PriceLevel = (typeof PRICE_LEVEL)[keyof typeof PRICE_LEVEL];

// 미결정 사항(스펙): 안쪽 백분위 값. 실측 분포 확인 전까지의 초기값.
export const OBSERVED_BOUND_INNER_PERCENTILE = 0.25;

export type PriceAnswer = { priceLevel: PriceLevel; anchorKRW: number };
export type ObservedBounds = { minKRW: number | null; maxKRW: number | null; contradictory: boolean };

export function priceAnchorKRW(totalBudgetKRW: number | null | undefined, stepCount: number): number | null {
  if (!totalBudgetKRW || totalBudgetKRW <= 0 || stepCount <= 0) return null;
  return Math.round(totalBudgetKRW / stepCount);
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

// "비쌈"(하한 주장)들은 극단 최대 대신 위에서 안쪽 백분위, "저렴"(상한 주장)들은
// 아래에서 안쪽 백분위. 한 답이 틀려도 구간이 붕괴하지 않는다(스펙 §5-1 가격).
export function observedBoundsFromAnswers(answers: readonly PriceAnswer[]): ObservedBounds {
  const lowers = answers.filter((a) => a.priceLevel === PRICE_LEVEL.expensive).map((a) => a.anchorKRW).sort((a, b) => a - b);
  const uppers = answers.filter((a) => a.priceLevel === PRICE_LEVEL.cheap).map((a) => a.anchorKRW).sort((a, b) => a - b);
  const minKRW = lowers.length > 0 ? Math.round(percentile(lowers, 1 - OBSERVED_BOUND_INNER_PERCENTILE)) : null;
  const maxKRW = uppers.length > 0 ? Math.round(percentile(uppers, OBSERVED_BOUND_INNER_PERCENTILE)) : null;
  if (minKRW !== null && maxKRW !== null && minKRW > maxKRW) {
    // 모순이면 관측을 버리고 추정으로 되돌린다(신뢰도 낮음 취급).
    return { minKRW: null, maxKRW: null, contradictory: true };
  }
  return { minKRW, maxKRW, contradictory: false };
}

export type PlacePriceFields = {
  estimatedMinKRW: number | null;
  estimatedMaxKRW: number | null;
  observedMinKRW: number | null;
  observedMaxKRW: number | null;
};
export type PriceRange = { source: 'observed' | 'estimated' | 'unknown'; minKRW: number | null; maxKRW: number | null };

export function pickPriceRange(place: PlacePriceFields): PriceRange {
  if (place.observedMinKRW !== null || place.observedMaxKRW !== null) {
    return { source: 'observed', minKRW: place.observedMinKRW, maxKRW: place.observedMaxKRW };
  }
  if (place.estimatedMinKRW !== null || place.estimatedMaxKRW !== null) {
    return { source: 'estimated', minKRW: place.estimatedMinKRW, maxKRW: place.estimatedMaxKRW };
  }
  return { source: 'unknown', minKRW: null, maxKRW: null };
}

export const BUDGET_SCORE_WEIGHTS = {
  fit: 10,
  overPenalty: -15,
  // 하한이 몫을 얼마나 초과해야 감점하는지의 여유 계수. 균등 분할 앵커의 거칠기를 흡수한다.
  overHeadroomRatio: 1.5,
} as const;

export function budgetScoreFor(range: PriceRange, shareKRW: number | null): number {
  if (shareKRW === null || range.source === 'unknown') return 0;
  if (range.minKRW !== null && range.minKRW > shareKRW * BUDGET_SCORE_WEIGHTS.overHeadroomRatio) {
    return BUDGET_SCORE_WEIGHTS.overPenalty;
  }
  if (range.maxKRW !== null && range.maxKRW <= shareKRW) return BUDGET_SCORE_WEIGHTS.fit;
  return 0;
}

// 만족도 비율 축소 보정(shrinkage): (positives + prior*strength) / (total + strength).
// 표본 1건이 100%가 되지 않게 하는 것이 존재 이유(스펙 §5-1 만족도).
export function shrunkPositiveRate(input: {
  positives: number; total: number; priorRate: number; priorStrength: number;
}): number {
  return (input.positives + input.priorRate * input.priorStrength) / (input.total + input.priorStrength);
}
```

- [x] **Step 4: 통과 확인** — `npx jest __tests__/place-price.test.ts` → PASS.
- [x] **Step 5: 커밋** — `git add shared/recommendation/place-price.ts __tests__/place-price.test.ts && git commit -m "feat: 장소 가격 두 계층 순수 로직(앵커·구간 좁히기·소비 규칙·축소 보정)"`

---

## Task 2: `lib/placeReview.ts` — 별점 유도 규칙 순수 로직

**Files:**
- Create: `lib/placeReview.ts`
- Test: `__tests__/placeReview.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/placeReview.test.ts
import {
  initialPlaceSatisfactions,
  togglePlaceSatisfaction,
  placeFeedbackRpcArgs,
  type PlaceSatisfaction,
} from '../lib/placeReview';

const stepIds = ['s1', 's2', 's3'];

describe('initialPlaceSatisfactions (별점 유도, 비대칭 전파)', () => {
  it('별점 4 이상이면 전 장소 긍정 미리 선택', () => {
    expect(initialPlaceSatisfactions(4, stepIds)).toEqual({ s1: 'good', s2: 'good', s3: 'good' });
    expect(initialPlaceSatisfactions(5, stepIds)).toEqual({ s1: 'good', s2: 'good', s3: 'good' });
  });
  it('별점 3 이하면 아무것도 선택하지 않는다 — 낮은 별점을 장소에 전파하지 않는다', () => {
    expect(initialPlaceSatisfactions(3, stepIds)).toEqual({});
    expect(initialPlaceSatisfactions(1, stepIds)).toEqual({});
  });
});

describe('togglePlaceSatisfaction', () => {
  it('같은 값을 다시 탭하면 해제된다', () => {
    expect(togglePlaceSatisfaction('good', 'good')).toBeUndefined();
  });
  it('다른 값을 탭하면 뒤집힌다', () => {
    expect(togglePlaceSatisfaction('good', 'bad')).toBe('bad');
    expect(togglePlaceSatisfaction(undefined, 'bad')).toBe('bad');
  });
});

describe('placeFeedbackRpcArgs', () => {
  it('긍정은 revisit 태그로 저장된다(소비 측 behaviorScoreFor 배선)', () => {
    expect(placeFeedbackRpcArgs({ sessionId: 'sess', stepId: 's1', satisfaction: 'good', priceLevel: 2 }))
      .toEqual({ p_session_id: 'sess', p_step_id: 's1', p_visited: true, p_tags: ['revisit'], p_price_level: 2 });
  });
  it('부정은 revisit 없는 방문 기록이다', () => {
    expect(placeFeedbackRpcArgs({ sessionId: 'sess', stepId: 's1', satisfaction: 'bad', priceLevel: null }))
      .toEqual({ p_session_id: 'sess', p_step_id: 's1', p_visited: true, p_tags: [], p_price_level: null });
  });
  it('만족도도 가격도 없으면 보낼 것이 없다 → null', () => {
    expect(placeFeedbackRpcArgs({ sessionId: 'sess', stepId: 's1', satisfaction: undefined, priceLevel: null }))
      .toBeNull();
  });
});
```

- [x] **Step 2: 실패 확인** — `npx jest __tests__/placeReview.test.ts` → FAIL.
- [x] **Step 3: 구현**

```ts
// lib/placeReview.ts
// 리뷰 화면 장소별 등급의 별점 유도 규칙(스펙 §5). UI에서 분리된 순수 로직.
import { Rating, deriveWantAgain } from './ratingFeedback';

export type PlaceSatisfaction = 'good' | 'bad';

// 긍정은 자동 전파(가점이라 틀려도 피해가 작다), 감점은 명시적 탭만.
export function initialPlaceSatisfactions(
  rating: Rating, stepIds: readonly string[],
): Record<string, PlaceSatisfaction> {
  if (!deriveWantAgain(rating)) return {};
  return Object.fromEntries(stepIds.map((id) => [id, 'good' as const]));
}

export function togglePlaceSatisfaction(
  current: PlaceSatisfaction | undefined, tapped: PlaceSatisfaction,
): PlaceSatisfaction | undefined {
  return current === tapped ? undefined : tapped;
}

export type PlaceFeedbackInput = {
  sessionId: string;
  stepId: string;
  satisfaction: PlaceSatisfaction | undefined;
  priceLevel: 1 | 2 | 3 | null;
};

export function placeFeedbackRpcArgs(input: PlaceFeedbackInput): {
  p_session_id: string; p_step_id: string; p_visited: boolean; p_tags: string[]; p_price_level: number | null;
} | null {
  if (input.satisfaction === undefined && input.priceLevel === null) return null;
  return {
    p_session_id: input.sessionId,
    p_step_id: input.stepId,
    p_visited: true,
    p_tags: input.satisfaction === 'good' ? ['revisit'] : [],
    p_price_level: input.priceLevel,
  };
}
```

- [x] **Step 4: 통과 확인** — PASS.
- [x] **Step 5: 커밋** — `git commit -m "feat: 리뷰 장소별 등급 별점 유도 규칙(비대칭 전파)"`

---

## Task 3: 마이그레이션 1 — AI 로그 일별 집계

**Files:**
- Create: `supabase/migrations/20260727100000_ai_log_daily_stats.sql`
- Modify: `docs/supabase-schema.sql` (동일 내용 append — 기존 관례)
- Test: `__tests__/aiLogDailyStatsMigration.test.ts`

- [x] **Step 1: 실패하는 테스트 작성** (`recommendationHistoryAbMetricsMigration.test.ts`의 파일 내용 검증 패턴)

```ts
// __tests__/aiLogDailyStatsMigration.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AI 로그 일별 집계 마이그레이션', () => {
  const root = join(__dirname, '..');
  const migration = readFileSync(
    join(root, 'supabase/migrations/20260727100000_ai_log_daily_stats.sql'), 'utf8',
  );
  const canonical = readFileSync(join(root, 'docs/supabase-schema.sql'), 'utf8');

  it.each([['migration', () => migration], ['canonical', () => canonical]])(
    '%s: 집계 테이블·함수·서비스 롤 전용 잠금이 정의된다', (_l, sql) => {
      expect(sql()).toContain('create table if not exists public.ai_recommendation_log_daily_stats');
      expect(sql()).toContain('primary key (stat_date, action)');
      expect(sql()).toContain('aggregate_ai_recommendation_log_daily_stats');
      expect(sql()).toContain('percentile_cont(0.95) within group');
      expect(sql()).toContain('on conflict (stat_date, action) do update');
      expect(sql()).toContain('revoke all on public.ai_recommendation_log_daily_stats from authenticated');
    });

  it('개인정보 컬럼(prompt·response)은 집계에 포함되지 않는다', () => {
    expect(migration).not.toMatch(/insert into public\.ai_recommendation_log_daily_stats[\s\S]*?\b(prompt|response_json)\b/);
  });
});
```

- [x] **Step 2: 실패 확인** — FAIL(파일 없음).
- [x] **Step 3: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/20260727100000_ai_log_daily_stats.sql
-- AI 로그 30일 삭제 전에 아키텍처 지표 추세를 영구 보존하는 일별 집계.
-- 삭제 스케줄(pg_cron)보다 반드시 먼저 배포되어야 한다 — 반대면 첫 실행에서 이력이 사라진다.
begin;

create table if not exists public.ai_recommendation_log_daily_stats (
  stat_date date not null,
  action text not null,
  call_count integer not null check (call_count >= 0),
  error_count integer not null check (error_count >= 0),
  avg_latency_ms integer,
  p95_latency_ms integer,
  avg_input_tokens integer,
  avg_output_tokens integer,
  aggregated_at timestamptz not null default now(),
  primary key (stat_date, action)
);
comment on table public.ai_recommendation_log_daily_stats is
  'ai_recommendation_logs 삭제 전 일별 집계. 개인정보 없음, 영구 보존. service_role 전용.';

alter table public.ai_recommendation_log_daily_stats enable row level security;
revoke all on public.ai_recommendation_log_daily_stats from authenticated;
revoke all on public.ai_recommendation_log_daily_stats from anon;

-- 멱등: 원본에 아직 남아 있는 날짜만 다시 계산해 upsert. 이미 삭제된 날짜의 집계는 건드리지 않는다.
create or replace function public.aggregate_ai_recommendation_log_daily_stats()
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.ai_recommendation_log_daily_stats
    (stat_date, action, call_count, error_count, avg_latency_ms, p95_latency_ms, avg_input_tokens, avg_output_tokens, aggregated_at)
  select
    created_at::date,
    action,
    count(*),
    count(*) filter (where status = 'error'),
    round(avg(latency_ms))::integer,
    round((percentile_cont(0.95) within group (order by latency_ms))::numeric)::integer,
    round(avg(input_tokens))::integer,
    round(avg(output_tokens))::integer,
    now()
  from public.ai_recommendation_logs
  group by 1, 2
  on conflict (stat_date, action) do update set
    call_count = excluded.call_count,
    error_count = excluded.error_count,
    avg_latency_ms = excluded.avg_latency_ms,
    p95_latency_ms = excluded.p95_latency_ms,
    avg_input_tokens = excluded.avg_input_tokens,
    avg_output_tokens = excluded.avg_output_tokens,
    aggregated_at = excluded.aggregated_at;
$$;
revoke all on function public.aggregate_ai_recommendation_log_daily_stats() from public;

commit;
```

- [x] **Step 4: `docs/supabase-schema.sql` 끝에 같은 내용 append** (begin/commit 제외한 본문).
- [x] **Step 5: 통과 확인** — `npx jest __tests__/aiLogDailyStatsMigration.test.ts` → PASS.
- [x] **Step 6: 커밋** — `git commit -m "feat(db): AI 로그 일별 집계 테이블·함수(삭제 스케줄 선행 조건)"`

---

## Task 4: 마이그레이션 2 — `places` 원장 + `price_level` + RPC 확장

**Files:**
- Create: `supabase/migrations/20260727110000_places_ledger.sql`
- Modify: `docs/supabase-schema.sql`
- Test: `__tests__/placesLedgerMigration.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/placesLedgerMigration.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('places 원장 마이그레이션', () => {
  const root = join(__dirname, '..');
  const migration = readFileSync(join(root, 'supabase/migrations/20260727110000_places_ledger.sql'), 'utf8');
  const canonical = readFileSync(join(root, 'docs/supabase-schema.sql'), 'utf8');

  it.each([['migration', () => migration], ['canonical', () => canonical]])(
    '%s: 원장은 추정·관측을 별도 컬럼으로 갖고 서비스 롤 전용이다', (_l, sql) => {
      expect(sql()).toContain('create table if not exists public.places');
      expect(sql()).toContain('kakao_place_id text primary key');
      for (const col of ['estimated_min_krw', 'estimated_max_krw', 'estimated_at', 'estimate_model',
        'observed_min_krw', 'observed_max_krw', 'observed_sample_count', 'first_seen_at', 'last_seen_at']) {
        expect(sql()).toContain(col);
      }
      expect(sql()).toContain('revoke all on public.places from authenticated');
    });

  it('place_feedback.price_level은 1~3 nullable', () => {
    expect(migration).toContain('add column if not exists price_level smallint');
    expect(migration).toContain('price_level between 1 and 3');
  });

  it('피드백 RPC는 커플 멤버를 허용하고 price_level·satisfaction을 받는다', () => {
    expect(migration).toContain('drop function if exists public.record_recommendation_place_feedback(text,text,boolean,text[])');
    expect(migration).toContain('p_price_level smallint default null');
    expect(migration).toContain('p_satisfaction boolean default null');
    expect(migration).toContain('public.is_couple_member(v_session.couple_id)');
  });

  it('만족도는 무응답(null)과 부정(false)을 구별하는 별도 컬럼이다', () => {
    expect(migration).toContain('add column if not exists satisfaction boolean');
    // revisit 태그로 역추적하면 "말 안 함"이 "별로였음"으로 집계된다.
    expect(migration).toContain('satisfaction=excluded.satisfaction');
  });

  it('관측 구간은 보간 백분위를 쓰지 않는다 — place-price.ts와 같은 표본 선택 규칙', () => {
    expect(migration).not.toContain('percentile_cont');
    expect(migration).toContain("lowers[floor((array_length(lowers, 1) - 1) * 0.75)::integer + 1]");
    expect(migration).toContain("uppers[ceil((array_length(uppers, 1) - 1) * 0.25)::integer + 1]");
  });

  it('관측 재계산 실패는 피드백 저장을 실패시키지 않는다', () => {
    expect(migration).toMatch(/perform public\.recompute_place_observed_price[\s\S]*?exception when others then null/);
  });

  it('리뷰 화면용 장소 조회 RPC가 커플 멤버 검사와 함께 정의된다', () => {
    expect(migration).toContain('create or replace function public.get_course_places_for_review(p_card_id text)');
    expect(migration).toContain("status = 'confirmed'");
  });

  it('ai_recommendation_logs action 제약에 estimate_place_price가 추가된다', () => {
    expect(migration).toContain("'estimate_place_price'");
  });
});
```

- [x] **Step 2: 실패 확인** — FAIL.
- [x] **Step 3: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/20260727110000_places_ledger.sql
-- 장소 지식 원장: 세션 수명과 무관하게 살아남는 장소별 신원 스냅샷 + 가격 두 계층.
-- 추정(AI)과 관측(리뷰)은 절대 같은 컬럼에 섞지 않는다(스펙 §2).
begin;

create table if not exists public.places (
  kakao_place_id text primary key check (length(btrim(kakao_place_id)) > 0),
  place_name text not null check (length(btrim(place_name)) > 0),
  address text not null default '',
  road_address text not null default '',
  map_url text not null default '',
  category_group_code text not null default '',
  category_name text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  -- 추정 계층(AI, 1인 기준 원 단위 범위)
  estimated_min_krw integer check (estimated_min_krw >= 0),
  estimated_max_krw integer check (estimated_max_krw >= 0),
  estimated_at timestamptz,
  estimate_model text,
  -- 관측 계층(리뷰 유래)
  observed_min_krw integer check (observed_min_krw >= 0),
  observed_max_krw integer check (observed_max_krw >= 0),
  observed_sample_count integer not null default 0 check (observed_sample_count >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estimated_min_krw is null or estimated_max_krw is null or estimated_min_krw <= estimated_max_krw),
  check (observed_min_krw is null or observed_max_krw is null or observed_min_krw <= observed_max_krw)
);
comment on table public.places is
  '장소 지식 원장. 신원 스냅샷은 표시용 최소한이며 오래되면 재조회 갱신. service_role 전용.';

alter table public.places enable row level security;
revoke all on public.places from authenticated;
revoke all on public.places from anon;

alter table public.place_feedback
  add column if not exists price_level smallint
  check (price_level is null or price_level between 1 and 3);
comment on column public.place_feedback.price_level is '1=저렴, 2=보통, 3=비쌈. 행동으로 드러나지 않아 직접 묻는 유일한 항목.';

-- 무응답(null)과 부정(false)을 구별한다. revisit 태그 유무로 역추적하면 "별로였다"와
-- "만족도는 말 안 하고 가격만 답했다"가 같은 모양이 되어, 후자가 만족도를 깎는다.
alter table public.place_feedback add column if not exists satisfaction boolean;
comment on column public.place_feedback.satisfaction is
  'null=무응답(집계 제외), true=좋았음, false=별로. 만족도 비율은 non-null만 분모로 센다.';

-- 관측 범위 재계산: 커플 단위 중복 제거 후, 예산÷장소수 앵커의 부등식들을 안쪽 백분위로 좁힌다.
-- 백분위 선택과 모순 시 폐기는 shared/recommendation/place-price.ts와 동일 규칙(정본은 TS 테스트).
-- percentile_cont(보간)은 쓸 수 없다 — 이상치를 부분적으로 섞어 구간을 붕괴시킨다.
-- percentile_disc도 규칙이 다르므로(N=3, f=0.75에서 최댓값 선택) 인덱스를 직접 계산한다:
-- 하한은 floor((n-1)*0.75), 상한은 ceil((n-1)*0.25) — 둘 다 이상치 반대 방향.
create or replace function public.recompute_place_observed_price(p_kakao_place_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_min integer; v_max integer; v_samples integer;
begin
  with couple_answers as (
    -- 커플당 최신 가격 답변 1건 = 1표본. 예산이 있는 세션만 앵커를 만들 수 있다.
    select distinct on (pf.couple_id)
      pf.price_level,
      round(((rs.original_request ->> 'totalBudgetKRW')::numeric)
        / greatest((select count(*) from public.recommendation_course_steps cs where cs.session_id = pf.session_id), 1)
      )::integer as anchor_krw
    from public.place_feedback pf
    join public.recommendation_sessions rs on rs.id = pf.session_id
    where pf.kakao_place_id = p_kakao_place_id
      and pf.price_level is not null
      and pf.couple_id is not null
      and (rs.original_request ->> 'totalBudgetKRW') ~ '^[0-9]+$'
    order by pf.couple_id, pf.updated_at desc
  ),
  sorted as (
    select
      array_agg(anchor_krw order by anchor_krw) filter (where price_level = 3) as lowers,
      array_agg(anchor_krw order by anchor_krw) filter (where price_level = 1) as uppers,
      count(*)::integer as sample_count
    from couple_answers
  ),
  bounds as (
    -- postgres 배열은 1-based라 TS의 0-based 인덱스에 +1.
    select
      case when lowers is null then null
        else lowers[floor((array_length(lowers, 1) - 1) * 0.75)::integer + 1] end as min_krw,
      case when uppers is null then null
        else uppers[ceil((array_length(uppers, 1) - 1) * 0.25)::integer + 1] end as max_krw,
      sample_count
    from sorted
  )
  select
    case when b.min_krw is not null and b.max_krw is not null and b.min_krw > b.max_krw then null else b.min_krw end,
    case when b.min_krw is not null and b.max_krw is not null and b.min_krw > b.max_krw then null else b.max_krw end,
    b.sample_count
  into v_min, v_max, v_samples
  from bounds b;

  update public.places set
    observed_min_krw = v_min,
    observed_max_krw = v_max,
    observed_sample_count = coalesce(v_samples, 0),
    updated_at = now()
  where kakao_place_id = p_kakao_place_id;
end;
$$;
revoke all on function public.recompute_place_observed_price(text) from public;

-- 기존 owner 전용 4-인자 버전을 5-인자(가격 포함, 커플 멤버 허용)로 교체.
-- 같은 이름의 다른 인자 수 함수가 남으면 PostgREST rpc 해석이 모호해지므로 명시적으로 drop.
drop function if exists public.record_recommendation_place_feedback(text,text,boolean,text[]);
create or replace function public.record_recommendation_place_feedback(
  p_session_id text, p_step_id text, p_visited boolean,
  p_tags text[] default '{}'::text[], p_price_level smallint default null,
  p_satisfaction boolean default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid := auth.uid(); v_session public.recommendation_sessions%rowtype; v_place text;
begin
  if v_owner is null then raise insufficient_privilege using message = 'not authenticated'; end if;
  select * into v_session from public.recommendation_sessions where id = p_session_id;
  -- 리뷰는 커플 활동이다: 세션 생성자뿐 아니라 커플 상대도 장소 등급을 남길 수 있어야 한다.
  if not found or v_session.status <> 'confirmed'
    or (v_session.owner_user_id <> v_owner
      and (v_session.couple_id is null or not public.is_couple_member(v_session.couple_id))) then
    raise check_violation using message = 'constraint_violation';
  end if;
  select current_kakao_place_id into v_place from public.recommendation_course_steps
    where session_id = p_session_id and step_id = p_step_id;
  if v_place is null
    or coalesce(p_tags, '{}'::text[]) <@ array['conversation','quiet','noisy','value','expensive','photos','revisit','crowded']::text[] is false
    or (p_price_level is not null and p_price_level not between 1 and 3) then
    raise invalid_parameter_value using message = 'invalid_candidate';
  end if;
  insert into public.place_feedback(session_id,step_id,kakao_place_id,owner_user_id,couple_id,visited,tags,price_level,satisfaction)
    values (p_session_id,p_step_id,v_place,v_owner,v_session.couple_id,p_visited,coalesce(p_tags,'{}'::text[]),p_price_level,p_satisfaction)
    on conflict (session_id,step_id,owner_user_id) do update
      set visited=excluded.visited,tags=excluded.tags,price_level=excluded.price_level,
          satisfaction=excluded.satisfaction,updated_at=now();
  perform public.write_recommendation_step_event(p_session_id,p_step_id,
    case when p_visited then 'place_visited' else 'feedback_submitted' end,v_place,v_place);
  -- 부가 기록(관측 범위 갱신)은 원본 쓰기를 절대 되돌리지 않는다(스펙 오류 처리).
  begin
    perform public.recompute_place_observed_price(v_place);
  exception when others then null;
  end;
end;
$$;
revoke all on function public.record_recommendation_place_feedback(text,text,boolean,text[],smallint,boolean) from public;
grant execute on function public.record_recommendation_place_feedback(text,text,boolean,text[],smallint,boolean) to authenticated;

-- 리뷰 화면이 카드에서 코스 장소 목록을 읽는 통로. 세션 select RLS가 owner 전용이라
-- 파트너는 직접 조회가 불가능하므로 security definer + 커플 멤버 검사로 연다.
create or replace function public.get_course_places_for_review(p_card_id text)
returns table (session_id text, step_id text, step_order smallint, place_name text, kakao_place_id text)
language sql security definer set search_path = public, pg_temp stable as $$
  select cs.session_id, cs.step_id, cs.step_order, cs.place_name, cs.current_kakao_place_id
  from public.recommendation_sessions rs
  join public.recommendation_course_steps cs on cs.session_id = rs.id
  where rs.confirmed_card_id = p_card_id
    and rs.status = 'confirmed'
    and (rs.owner_user_id = auth.uid()
      or (rs.couple_id is not null and public.is_couple_member(rs.couple_id)))
  order by cs.step_order;
$$;
revoke all on function public.get_course_places_for_review(text) from public;
grant execute on function public.get_course_places_for_review(text) to authenticated;

-- generate-ai의 새 액션 로깅 허용.
alter table public.ai_recommendation_logs drop constraint if exists ai_recommendation_logs_action_check;
alter table public.ai_recommendation_logs add constraint ai_recommendation_logs_action_check
  check (action in ('cards','feeling_select','course_select','recommend_date_select','replacement_select','parse_step_intents','estimate_place_price'));

commit;
```

  **주의:** action check의 기존 허용 목록은 적용 전에 실 DB에서 확인한다(`select pg_get_constraintdef(oid) from pg_constraint where conname='ai_recommendation_logs_action_check'`). 위 목록은 마이그레이션 파일 이력 기준 추정이므로 실측과 다르면 실측 + `estimate_place_price`로 쓴다.

- [x] **Step 4: `docs/supabase-schema.sql` append.**
- [x] **Step 5: 통과 확인** — PASS.
- [x] **Step 6: 커밋** — `git commit -m "feat(db): places 원장 + place_feedback.price_level + 커플 멤버 리뷰 RPC"`

---

## Task 5: 마이그레이션 3 — `place_behavior_stats` 뷰

**Files:**
- Create: `supabase/migrations/20260727120000_place_behavior_stats_view.sql`
- Modify: `docs/supabase-schema.sql`
- Test: `__tests__/placeBehaviorStatsMigration.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/placeBehaviorStatsMigration.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('place_behavior_stats 뷰 마이그레이션', () => {
  const root = join(__dirname, '..');
  const migration = readFileSync(
    join(root, 'supabase/migrations/20260727120000_place_behavior_stats_view.sql'), 'utf8',
  );

  it('테이블+트리거가 아니라 뷰다 — tg_op 사고의 재발 방지 구조', () => {
    expect(migration).toContain('create or replace view public.place_behavior_stats');
    expect(migration).not.toMatch(/create trigger/i);
  });
  it('노출·교체·삭제·확정과 커플 중복 제거 카운트를 원본에서 계산한다', () => {
    for (const marker of ['exposure_session_count', 'replaced_count', 'deleted_count',
      'confirmed_session_count', 'distinct_couple_count', "event_type = 'place_replaced'",
      "event_type = 'place_deleted'", "status = 'confirmed'"]) {
      expect(migration).toContain(marker);
    }
  });
  it('클라이언트 롤에서 읽을 수 없다', () => {
    expect(migration).toContain('revoke all on public.place_behavior_stats from authenticated');
  });
});
```

- [x] **Step 2: 실패 확인** — FAIL.
- [x] **Step 3: SQL 작성**

```sql
-- supabase/migrations/20260727120000_place_behavior_stats_view.sql
-- 장소 행동 통계. 테이블+트리거가 아니라 뷰인 이유: 같은 날 발견한 tg_op 소문자 비교
-- 사고처럼 트리거는 조용히 0을 세도 아무도 모른다. 뷰는 매번 재계산되어 틀리면 즉시
-- 드러나고 검증할 상태가 없다. 51곳 규모에서 성능은 고려 대상이 아니며 느려지면 실체화한다.
-- 이번 범위에서는 뷰만 만들고 소비하지 않는다 — 임계치 확정은 다음 작업.
begin;

create or replace view public.place_behavior_stats as
with exposures as (
  select cs.current_kakao_place_id as kakao_place_id, cs.session_id, rs.couple_id, rs.status
  from public.recommendation_course_steps cs
  join public.recommendation_sessions rs on rs.id = cs.session_id
),
events as (
  select previous_kakao_place_id as kakao_place_id, event_type
  from public.recommendation_step_events
  where event_type in ('place_replaced', 'place_deleted')
    and previous_kakao_place_id is not null
)
select
  e.kakao_place_id,
  count(distinct e.session_id) as exposure_session_count,
  count(distinct e.couple_id) filter (where e.couple_id is not null) as distinct_couple_count,
  count(distinct e.session_id) filter (where e.status = 'confirmed') as confirmed_session_count,
  count(distinct e.couple_id) filter (where e.status = 'confirmed' and e.couple_id is not null) as confirmed_couple_count,
  (select count(*) from events ev where ev.kakao_place_id = e.kakao_place_id and ev.event_type = 'place_replaced') as replaced_count,
  (select count(*) from events ev where ev.kakao_place_id = e.kakao_place_id and ev.event_type = 'place_deleted') as deleted_count
from exposures e
group by e.kakao_place_id;

revoke all on public.place_behavior_stats from authenticated;
revoke all on public.place_behavior_stats from anon;

commit;
```

  **참고(스펙 편차 1건):** 스펙 마이그레이션 순서 3번의 "커플 중복 제거 테이블"은 만들지 않는다. 뷰는 원본(`recommendation_sessions.couple_id`)에서 `count(distinct couple_id)`로 직접 중복 제거가 가능해 별도 상태 테이블이 불필요하다(YAGNI — 상태 테이블은 정확히 트리거 방식의 실패 모드를 다시 들여온다). `place_pair_stat_couples`가 테이블인 이유는 그쪽이 트리거 누적형이기 때문.

- [x] **Step 4: `docs/supabase-schema.sql` append, 테스트 PASS 확인.**
- [x] **Step 5: 커밋** — `git commit -m "feat(db): place_behavior_stats 뷰(원본 재계산, 소비는 다음 작업)"`

---

## Task 6: 원격 마이그레이션 적용 + 프로덕션 검증 【승인 게이트 1】

- [x] **Step 1: 사용자에게 적용 보고·승인** — 마이그레이션 3개(집계·원장·뷰) 내용 요약, 위험(기존 RPC 교체 → 배포 중 순단 가능성, drop function 후 create 사이는 한 트랜잭션이라 실질 없음) 설명.
- [x] **Step 2: MCP `apply_migration`으로 순서대로 적용** (`ai_log_daily_stats` → `places_ledger` → `place_behavior_stats_view`).
- [x] **Step 3: 프로덕션 검증 — 롤백되는 do 블록** (트리거 사고 때와 동일 방식, MCP `execute_sql`):

```sql
-- 1) 집계 함수 실측: 실행 후 일별 행 수 = 원본의 distinct (일,action) 수인지 확인하고 롤백.
begin;
select public.aggregate_ai_recommendation_log_daily_stats();
select
  (select count(*) from public.ai_recommendation_log_daily_stats) as agg_rows,
  (select count(distinct (created_at::date, action)) from public.ai_recommendation_logs) as source_pairs;
rollback;

-- 2) 뷰 vs 원본 대조: 임의 장소 1곳의 노출 수를 손 계산과 비교.
select * from public.place_behavior_stats order by exposure_session_count desc limit 5;
select count(distinct session_id) from public.recommendation_course_steps where current_kakao_place_id = '<위 1위 장소 id>';

-- 3) 피드백 RPC 경로: 실제 confirmed 세션 1건으로 insert→places 관측 재계산이 도는지 확인 후 롤백.
--    (auth.uid() 없는 콘솔에서는 RPC 본문 로직만 발췌 실행)
```

- [x] **Step 4: `get_advisors`로 신규 보안·성능 이슈 없는지 확인.**
- [x] **Step 5: 결과를 커밋 메시지에 기록** — `git commit --allow-empty -m "chore(db): 원장 마이그레이션 3건 원격 적용·실측 검증 완료"` (또는 RESULT.md에 기록).

---

## Task 7: generate-ai — `estimate_place_price` 액션

**Files:**
- Create: `supabase/functions/_shared/place-price-prompt.ts`
- Modify: `supabase/functions/generate-ai/index.ts` (ACTION_CONFIG + 응답 분기)
- Test: `__tests__/place-price-prompt.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/place-price-prompt.test.ts
import {
  buildPlacePriceEstimationPrompt,
  parsePlacePriceEstimate,
  PLACE_PRICE_PROMPT_VERSION,
} from '../supabase/functions/_shared/place-price-prompt';

const place = {
  placeName: '메가MGC커피 강남점',
  categoryName: '음식점 > 카페 > 커피전문점',
  address: '서울 강남구 역삼동 123-4',
};

describe('buildPlacePriceEstimationPrompt', () => {
  it('추정 입력값 3종(카테고리·이름·주소)이 모두 프롬프트에 들어간다', () => {
    const prompt = buildPlacePriceEstimationPrompt(place);
    expect(prompt).toContain(place.placeName);
    expect(prompt).toContain(place.categoryName);
    expect(prompt).toContain(place.address);
    expect(prompt).toContain('1인');
  });
  it('버전 상수가 있다', () => {
    expect(PLACE_PRICE_PROMPT_VERSION).toMatch(/^place-price-v\d+$/);
  });
});

describe('parsePlacePriceEstimate', () => {
  it('정상 응답을 파싱한다', () => {
    expect(parsePlacePriceEstimate({ minKRW: 4000, maxKRW: 7000 })).toEqual({ minKRW: 4000, maxKRW: 7000 });
  });
  it('min > max, 음수, 비정수, 상한 초과는 null', () => {
    expect(parsePlacePriceEstimate({ minKRW: 9000, maxKRW: 4000 })).toBeNull();
    expect(parsePlacePriceEstimate({ minKRW: -1, maxKRW: 4000 })).toBeNull();
    expect(parsePlacePriceEstimate({ minKRW: 1000.5, maxKRW: 4000 })).toBeNull();
    expect(parsePlacePriceEstimate({ minKRW: 0, maxKRW: 2_000_000 })).toBeNull();
    expect(parsePlacePriceEstimate('garbage')).toBeNull();
  });
});
```

- [x] **Step 2: 실패 확인** — FAIL.
- [x] **Step 3: 구현**

```ts
// supabase/functions/_shared/place-price-prompt.ts
// 가격 추정은 생성 인라인이 아니라 별도 호출이다 — 같은 장소가 세션마다 다른 값을
// 받으면 안 되고(가격은 장소의 속성), 코스 선택 프롬프트 품질을 흔들지 않기 위함(스펙 §4).
import { z } from 'zod'; // 기존 shared 모듈 관례(bare specifier) — jest·deno 둘 다 해석된다

export const PLACE_PRICE_PROMPT_VERSION = 'place-price-v1';

export type PlacePriceEstimationInput = {
  placeName: string;
  categoryName: string;
  address: string;
};

export function buildPlacePriceEstimationPrompt(place: PlacePriceEstimationInput): string {
  return [
    '너는 한국 데이트 장소의 1인 기준 예상 지출을 추정한다.',
    '아래 장소에서 방문자 1명이 통상적으로 쓰는 금액 범위를 원 단위 정수로 답하라.',
    '식당이면 1인 식사, 카페면 음료 1잔+디저트 절반, 관람·체험이면 1인 입장/이용료 기준.',
    '',
    `장소명: ${place.placeName}`,
    `카테고리: ${place.categoryName}`,
    `주소: ${place.address}`,
    '',
    'JSON만 출력: {"minKRW": <정수>, "maxKRW": <정수>}',
  ].join('\n');
}

const estimateSchema = z.object({
  minKRW: z.number().int().min(0).max(1_000_000),
  maxKRW: z.number().int().min(0).max(1_000_000),
}).refine((v) => v.minKRW <= v.maxKRW);

export function parsePlacePriceEstimate(raw: unknown): { minKRW: number; maxKRW: number } | null {
  const parsed = estimateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
```

  `generate-ai/index.ts` 변경 2곳:

```ts
// (1) tool schema 추가 — 기존 *_SCHEMA 상수들 옆에
const PLACE_PRICE_SCHEMA = {
  type: 'object',
  properties: {
    minKRW: { type: 'integer', minimum: 0, maximum: 1000000 },
    maxKRW: { type: 'integer', minimum: 0, maximum: 1000000 },
  },
  required: ['minKRW', 'maxKRW'],
  additionalProperties: false,
};

// (2) ACTION_CONFIG에 추가
  estimate_place_price: { schema: PLACE_PRICE_SCHEMA, maxTokens: 256, temperature: 0, logged: true },

// (3) 응답 분기(파싱 결과 그대로 반환하는 기존 라인)에 액션 추가
    if (action === 'recommend_date_select' || action === 'replacement_select'
      || action === 'parse_step_intents' || action === 'estimate_place_price') return json(parsed);
```

- [x] **Step 4: 테스트 PASS + `npm run validate` 클린.**
- [x] **Step 5: 커밋** — `git commit -m "feat(edge): estimate_place_price 액션 + 프롬프트·파서"`

---

## Task 8: `_shared/place-ledger.ts` — upsert + 추정 오케스트레이션

**Files:**
- Create: `supabase/functions/_shared/place-ledger.ts`
- Test: `__tests__/place-ledger.test.ts`

- [x] **Step 1: 실패하는 테스트 작성** (가짜 client/AI로 순수하게 검증 — 기존 `recommend-date-server.test.ts`의 fake 주입 패턴)

```ts
// __tests__/place-ledger.test.ts
import { recordPlaceKnowledge, type PlaceLedgerRow } from '../supabase/functions/_shared/place-ledger';

function fakeDb() {
  const upserts: unknown[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  let existing: Partial<PlaceLedgerRow>[] = [];
  const client = {
    from: (table: string) => ({
      upsert: async (rows: unknown[]) => { upserts.push(...(rows as unknown[])); return { error: null }; },
      select: () => ({
        in: async () => ({ data: existing, error: null }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => { updates.push({ id, patch }); return { error: null }; },
      }),
    }),
  };
  return { client, upserts, updates, setExisting: (rows: Partial<PlaceLedgerRow>[]) => { existing = rows; } };
}

const place = {
  kakaoPlaceId: 'k1', name: '가마솥김치전골', categoryName: '음식점 > 한식',
  categoryGroupCode: 'FD6', address: '서울 어딘가', roadAddress: '', mapUrl: '',
  latitude: 37.5, longitude: 127.0,
};

describe('recordPlaceKnowledge', () => {
  it('선정된 장소를 원장에 upsert하고 last_seen_at을 갱신한다', async () => {
    const db = fakeDb();
    db.setExisting([{ kakao_place_id: 'k1', estimated_at: '2026-07-01T00:00:00Z' }]);
    await recordPlaceKnowledge({
      client: db.client as never,
      places: [place],
      estimate: async () => ({ minKRW: 8000, maxKRW: 12000 }),
      model: 'claude-haiku-4-5',
    });
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({ kakao_place_id: 'k1', place_name: '가마솥김치전골' });
  });

  it('추정이 이미 있는 장소는 다시 추정하지 않는다', async () => {
    const db = fakeDb();
    db.setExisting([{ kakao_place_id: 'k1', estimated_at: '2026-07-01T00:00:00Z' }]);
    let called = 0;
    await recordPlaceKnowledge({
      client: db.client as never, places: [place],
      estimate: async () => { called += 1; return { minKRW: 1, maxKRW: 2 }; },
      model: 'm',
    });
    expect(called).toBe(0);
  });

  it('추정이 없는 장소만 추정해 estimated_* 컬럼을 채운다', async () => {
    const db = fakeDb();
    db.setExisting([{ kakao_place_id: 'k1', estimated_at: null }]);
    await recordPlaceKnowledge({
      client: db.client as never, places: [place],
      estimate: async () => ({ minKRW: 8000, maxKRW: 12000 }),
      model: 'claude-haiku-4-5',
    });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].patch).toMatchObject({
      estimated_min_krw: 8000, estimated_max_krw: 12000, estimate_model: 'claude-haiku-4-5',
    });
  });

  it('추정 실패는 삼켜지고 장소는 모름으로 남는다 — 다음 노출 때 재시도', async () => {
    const db = fakeDb();
    db.setExisting([{ kakao_place_id: 'k1', estimated_at: null }]);
    await expect(recordPlaceKnowledge({
      client: db.client as never, places: [place],
      estimate: async () => { throw new Error('ai down'); },
      model: 'm',
    })).resolves.toBeUndefined();
    expect(db.updates).toHaveLength(0);
  });
});
```

- [x] **Step 2: 실패 확인** — FAIL.
- [x] **Step 3: 구현**

```ts
// supabase/functions/_shared/place-ledger.ts
// 코스 응답 전송 후 백그라운드에서 도는 원장 기록. 어떤 실패도 밖으로 던지지 않는다 —
// 부가 기록이 원본 흐름을 되돌리는 구조를 만들지 않는다(스펙 오류 처리).
export type PlaceLedgerCandidate = {
  kakaoPlaceId: string;
  name: string;
  categoryGroupCode: string;
  categoryName: string;
  address: string;
  roadAddress: string;
  mapUrl: string;
  latitude: number;
  longitude: number;
};

export type PlaceLedgerRow = {
  kakao_place_id: string;
  estimated_at: string | null;
};

type MinimalClient = {
  from: (table: string) => {
    upsert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>;
    select: (columns: string) => { in: (col: string, ids: string[]) => Promise<{ data: PlaceLedgerRow[] | null; error: unknown }> };
    update: (patch: Record<string, unknown>) => { eq: (col: string, id: string) => Promise<{ error: unknown }> };
  };
};

export async function recordPlaceKnowledge(input: {
  client: MinimalClient;
  places: readonly PlaceLedgerCandidate[];
  estimate: (place: PlaceLedgerCandidate) => Promise<{ minKRW: number; maxKRW: number } | null>;
  model: string;
}): Promise<void> {
  if (input.places.length === 0) return;
  try {
    const now = new Date().toISOString();
    const { error: upsertError } = await input.client.from('places').upsert(
      input.places.map((place) => ({
        kakao_place_id: place.kakaoPlaceId,
        place_name: place.name,
        address: place.address,
        road_address: place.roadAddress,
        map_url: place.mapUrl,
        category_group_code: place.categoryGroupCode,
        category_name: place.categoryName,
        latitude: place.latitude,
        longitude: place.longitude,
        last_seen_at: now,
        updated_at: now,
      })),
    );
    if (upsertError) throw upsertError;

    const { data: rows, error: selectError } = await input.client
      .from('places').select('kakao_place_id, estimated_at')
      .in('kakao_place_id', input.places.map((p) => p.kakaoPlaceId));
    if (selectError) throw selectError;
    const needsEstimate = new Set((rows ?? []).filter((r) => r.estimated_at === null).map((r) => r.kakao_place_id));

    for (const place of input.places) {
      if (!needsEstimate.has(place.kakaoPlaceId)) continue;
      try {
        const estimate = await input.estimate(place);
        if (!estimate) continue;
        await input.client.from('places').update({
          estimated_min_krw: estimate.minKRW,
          estimated_max_krw: estimate.maxKRW,
          estimated_at: new Date().toISOString(),
          estimate_model: input.model,
          updated_at: new Date().toISOString(),
        }).eq('kakao_place_id', place.kakaoPlaceId);
      } catch (error) {
        console.error(JSON.stringify({ event: 'place_price_estimate_failed', kakaoPlaceId: place.kakaoPlaceId, error: String(error) }));
      }
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'place_ledger_record_failed', error: String(error) }));
  }
}
```

  **참고:** upsert의 `on conflict`는 supabase-js가 PK 기준 merge duplicates로 처리하므로 `first_seen_at`은 default가 최초 1회만 적용되도록 upsert payload에서 제외한다(위 코드가 이미 그렇게 함 — supabase-js upsert는 명시 컬럼만 갱신).

- [x] **Step 4: 테스트 PASS.**
- [x] **Step 5: 커밋** — `git commit -m "feat(edge): 장소 원장 upsert·미추정 장소 백그라운드 추정 모듈"`

---

## Task 9: recommend-date 배선 — 응답 후 백그라운드 기록

**Files:**
- Modify: `supabase/functions/_shared/recommend-date-handler.ts` (선택 완료 지점에 optional dep 호출)
- Modify: `supabase/functions/recommend-date/index.ts` (dep 구현 + `EdgeRuntime.waitUntil`)
- Test: `__tests__/recommend-date-server.test.ts`에 케이스 추가

- [x] **Step 1: 실패하는 테스트 작성** — 기존 recommend-date-server 테스트의 성공 생성 픽스처를 재사용해, deps에 `recordPlaceKnowledge` spy를 넣고 다음을 검증:

```ts
it('성공 생성 후 선정된 스텝 장소들의 전체 카카오 필드로 recordPlaceKnowledge를 호출한다', async () => {
  const recorded: unknown[] = [];
  const result = await handleRecommendDate(successRequestFixture, {
    ...successDeps,
    recordPlaceKnowledge: (input) => { recorded.push(input); },
  });
  expect(result.status).toBe(200);
  const call = recorded[0] as { places: { kakaoPlaceId: string; categoryName: string }[] };
  // 응답 스텝 수와 동일, categoryName 등 검색 후보의 원본 필드가 실려 있다.
  expect(call.places.length).toBeGreaterThanOrEqual(2);
  expect(call.places.every((p) => typeof p.categoryName === 'string')).toBe(true);
});

it('recordPlaceKnowledge가 던져도 응답은 성공한다', async () => {
  const result = await handleRecommendDate(successRequestFixture, {
    ...successDeps,
    recordPlaceKnowledge: () => { throw new Error('boom'); },
  });
  expect(result.status).toBe(200);
});
```

  (픽스처 이름은 파일 내 실제 명칭을 따른다 — 성공 경로 테스트가 이미 존재한다.)

- [x] **Step 2: 실패 확인** — FAIL(dep 없음).
- [x] **Step 3: 구현**
  - `RecommendDateDependencies`에 추가:

```ts
  /** 응답과 무관한 부가 기록. 던져도 무시된다 — 원본 흐름을 절대 실패시키지 않는다. */
  recordPlaceKnowledge?: (input: { places: PlaceCandidate[] }) => void;
```

  - 핸들러의 최종 코스 확정 직후(응답 객체 완성 지점), 선정된 stepId→candidateId를 후보 풀에서 역참조해 호출:

```ts
  if (dependencies.recordPlaceKnowledge) {
    try {
      const selectedIds = new Set(finalSteps.map((step) => step.candidateId));
      dependencies.recordPlaceKnowledge({
        places: candidates.filter((candidate) => selectedIds.has(candidate.candidateId)),
      });
    } catch { /* 부가 기록은 응답을 막지 않는다 */ }
  }
```

  - `index.ts` deps에 구현(응답 이후 실행 보장은 `EdgeRuntime.waitUntil`):

```ts
    recordPlaceKnowledge: ({ places }) => {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const authorization = request.headers.get('Authorization') ?? '';
      // @ts-ignore Supabase Edge Runtime 전역
      EdgeRuntime.waitUntil(recordPlaceKnowledge({
        client: serviceClient as never,
        places,
        model: 'claude-haiku-4-5',
        estimate: async (place) => {
          const raw = await invokeGenerateAiSelection({
            supabaseUrl: Deno.env.get('SUPABASE_URL')!,
            anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
            authorization,
            action: 'estimate_place_price',
            prompt: buildPlacePriceEstimationPrompt({
              placeName: place.name, categoryName: place.categoryName, address: place.address,
            }),
            promptVersion: PLACE_PRICE_PROMPT_VERSION,
          }, { timeoutMs: 8_000 });
          return parsePlacePriceEstimate(raw);
        },
      }));
    },
```

- [x] **Step 4: 전체 recommend-date 테스트 PASS + `npm run validate` 클린.**
- [x] **Step 5: 커밋** — `git commit -m "feat(edge): 코스 응답 후 백그라운드 장소 원장 기록·가격 추정 배선"`

---

## Task 10: 랭킹 budget 점수 채우기

**Files:**
- Modify: `supabase/functions/_shared/recommendation-ranking.ts` ([232행](supabase/functions/_shared/recommendation-ranking.ts#L232) `budget: 0` 대체 + options 확장)
- Modify: `supabase/functions/_shared/recommendation-search-pipeline.ts` (`priceLookup` dep)
- Modify: `supabase/functions/recommend-date/index.ts` (`priceLookup` 구현)
- Test: `__tests__/recommend-date-ranking-server.test.ts`에 케이스 추가

- [x] **Step 1: 실패하는 테스트 작성** (기존 랭킹 테스트의 place/request 픽스처 헬퍼 재사용)

```ts
describe('budget 점수', () => {
  it('예산과 가격이 모두 있으면 몫 이내 장소가 가점을 받는다', () => {
    const ranked = rankPlaceCandidates([placeA, placeB], { ...request, totalBudgetKRW: 30000 }, {
      limit: 10,
      prices: new Map([
        [placeA.kakaoPlaceId, { estimatedMinKRW: 5000, estimatedMaxKRW: 9000, observedMinKRW: null, observedMaxKRW: null }],
        [placeB.kakaoPlaceId, { estimatedMinKRW: 40000, estimatedMaxKRW: 60000, observedMinKRW: null, observedMaxKRW: null }],
      ]),
    });
    const a = ranked.candidates.find((c) => c.kakaoPlaceId === placeA.kakaoPlaceId)!;
    const b = ranked.candidates.find((c) => c.kakaoPlaceId === placeB.kakaoPlaceId)!;
    expect(a.scoreBreakdown.budget).toBeGreaterThan(0);
    expect(b.scoreBreakdown.budget).toBeLessThan(0);
  });
  it('예산이 없으면 전원 0 — 예산 미입력 사용자는 영향 없다', () => {
    const ranked = rankPlaceCandidates([placeA], request, { limit: 10, prices: new Map([[placeA.kakaoPlaceId, { estimatedMinKRW: 999999, estimatedMaxKRW: 999999, observedMinKRW: null, observedMaxKRW: null }]]) });
    expect(ranked.candidates[0].scoreBreakdown.budget).toBe(0);
  });
  it('가격을 모르는 장소는 0 — 필터링에 관여하지 않는다(하드 필터 없음, 0개 절벽 원천 차단)', () => {
    const ranked = rankPlaceCandidates([placeA], { ...request, totalBudgetKRW: 30000 }, { limit: 10 });
    expect(ranked.candidates[0].scoreBreakdown.budget).toBe(0);
  });
  it('관측이 있으면 추정을 무시한다', () => {
    const ranked = rankPlaceCandidates([placeA], { ...request, totalBudgetKRW: 30000 }, {
      limit: 10,
      prices: new Map([[placeA.kakaoPlaceId, {
        estimatedMinKRW: 1000, estimatedMaxKRW: 2000,        // 추정: 저렴
        observedMinKRW: 50000, observedMaxKRW: null,          // 관측: 비쌈
      }]]),
    });
    expect(ranked.candidates[0].scoreBreakdown.budget).toBeLessThan(0);
  });
});
```

- [x] **Step 2: 실패 확인** — FAIL(options.prices 없음).
- [x] **Step 3: 구현**
  - `recommendation-ranking.ts`:

```ts
import { pickPriceRange, budgetScoreFor, priceAnchorKRW, type PlacePriceFields } from '../../../shared/recommendation/place-price.ts';

// rankPlaceCandidates options 타입에 추가
  prices?: ReadonlyMap<string, PlacePriceFields>;

// scored 계산부(232행 근처)에서
  const budgetShare = priceAnchorKRW(request.totalBudgetKRW, request.courseSteps.length);
  // ...
      budget: options.prices?.has(place.kakaoPlaceId)
        ? budgetScoreFor(pickPriceRange(options.prices.get(place.kakaoPlaceId)!), budgetShare)
        : 0,
```

  - `recommendation-search-pipeline.ts` dependencies에 추가하고 랭킹 직전에 조회:

```ts
    priceLookup?: (kakaoPlaceIds: string[]) => Promise<ReadonlyMap<string, PlacePriceFields>>;
// ...
  let prices: ReadonlyMap<string, PlacePriceFields> | undefined;
  if (dependencies.priceLookup && request.totalBudgetKRW) {
    try {
      prices = await dependencies.priceLookup(places.map((p) => p.kakaoPlaceId));
    } catch { prices = undefined; } // 가격 조회 실패는 추천을 막지 않는다
  }
  return {
    ...rankPlaceCandidates(places, request, {
      limit: KAKAO_SEARCH_LIMITS.maxUniqueCandidates,
      history: dependencies.history,
      prices,
    }),
```

  - `recommend-date/index.ts`의 `searchCandidates` dep에 구현:

```ts
        priceLookup: async (ids) => {
          const { data } = await serviceClient.from('places')
            .select('kakao_place_id, estimated_min_krw, estimated_max_krw, observed_min_krw, observed_max_krw')
            .in('kakao_place_id', ids);
          return new Map((data ?? []).map((row) => [row.kakao_place_id, {
            estimatedMinKRW: row.estimated_min_krw, estimatedMaxKRW: row.estimated_max_krw,
            observedMinKRW: row.observed_min_krw, observedMaxKRW: row.observed_max_krw,
          }]));
        },
```

  **설계 메모:** 스펙의 "코스 합계 대 예산 비교"는 후보 랭킹 단계에서는 코스가 아직 조립 전이므로, 균등 분할 몫(예산÷장소수) 대 후보 단가 비교로 근사한다(스펙 §5-1 앵커 정정과 동일 논리). 하드 필터가 없어서 "후보 0개 → 완화" 케이스는 구조적으로 발생하지 않는다.

- [x] **Step 4: 전체 테스트 + `npm run validate` 클린.**
- [x] **Step 5: 커밋** — `git commit -m "feat(edge): 랭킹 budget 점수 배선(관측>추정>모름, 예산÷장소수 앵커)"`

---

## Task 11: 리뷰 화면 — 장소별 등급 UI + i18n

**Files:**
- Modify: `app/card/review.tsx`
- Modify: `locales/ko.json`, `locales/en.json` (동일 작업에서 동시 갱신 — 프로젝트 규칙)
- Test: `__tests__/review-place-feedback.test.tsx` (기존 review 화면 테스트 패턴 참조: `__tests__/course-screen.test.tsx` 등의 mock supabase 방식)

- [x] **Step 1: 실패하는 테스트 작성** — 핵심 시나리오 4개:

```tsx
// __tests__/review-place-feedback.test.tsx
// mock supabase는 __mocks__/supabase.js 경유(jest.config moduleNameMapper가 lib/supabase를 자동 치환).
// 렌더·이벤트는 기존 화면 테스트(__tests__/course-screen.test.tsx)의 @testing-library/react-native 패턴을 따른다.
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ReviewScreen from '../app/card/review';
import { supabase } from '../lib/supabase'; // = mock

const placeRows = [
  { session_id: 'sess1', step_id: 's1', step_order: 1, place_name: '가마솥김치전골', kakao_place_id: 'k1' },
  { session_id: 'sess1', step_id: 's2', step_order: 2, place_name: '메가MGC커피', kakao_place_id: 'k2' },
];

function mockRpc(placesResult: unknown[] = placeRows) {
  (supabase.rpc as jest.Mock).mockImplementation(async (name: string) => (
    name === 'get_course_places_for_review'
      ? { data: placesResult, error: null }
      : { data: null, error: null }
  ));
}

it('코스 카드면 get_course_places_for_review 결과로 장소 목록을 렌더한다', async () => {
  mockRpc();
  const screen = render(<ReviewScreen />);
  await waitFor(() => expect(screen.getByText('가마솥김치전골')).toBeTruthy());
  expect(screen.getByText('메가MGC커피')).toBeTruthy();
});

it('별점 4를 주면 전 장소가 좋아요로 미리 선택되고, 3 이하면 선택되지 않는다', async () => {
  mockRpc();
  const screen = render(<ReviewScreen />);
  await waitFor(() => screen.getByText('가마솥김치전골'));
  fireEvent.press(screen.getByTestId('review-star-4'));
  expect(screen.getByTestId('place-good-s1').props.accessibilityState?.selected).toBe(true);
  expect(screen.getByTestId('place-good-s2').props.accessibilityState?.selected).toBe(true);
  fireEvent.press(screen.getByTestId('review-star-3'));
  expect(screen.getByTestId('place-good-s1').props.accessibilityState?.selected).toBeFalsy();
});

it('저장 시 등급 있는 장소마다 피드백 rpc가 호출되고, rpc 실패해도 별점 저장은 성공 흐름을 탄다', async () => {
  mockRpc();
  (supabase.rpc as jest.Mock).mockImplementation(async (name: string) => (
    name === 'get_course_places_for_review'
      ? { data: placeRows, error: null }
      : { data: null, error: { message: 'boom' } } // 피드백 rpc는 실패시켜 본다
  ));
  const screen = render(<ReviewScreen />);
  await waitFor(() => screen.getByText('가마솥김치전골'));
  fireEvent.press(screen.getByTestId('review-star-5'));
  fireEvent.press(screen.getByText(/저장/)); // 실제 라벨은 locales/ko.json review.saveButton
  await waitFor(() => {
    const feedbackCalls = (supabase.rpc as jest.Mock).mock.calls
      .filter(([name]) => name === 'record_recommendation_place_feedback');
    expect(feedbackCalls).toHaveLength(2); // 별점 5 → 두 장소 모두 revisit 긍정
  });
  // date_memories insert 후 성공 라우팅(router.replace)까지 도달 — 실패 Alert 미노출.
});

it('장소 목록이 비면(수동 카드) 장소 섹션이 렌더되지 않는다', async () => {
  mockRpc([]);
  const screen = render(<ReviewScreen />);
  await waitFor(() => expect(screen.queryByTestId('place-good-s1')).toBeNull());
});
```

  (auth/profile mock, router mock 등 보일러플레이트는 기존 화면 테스트에서 그대로 가져온다. 만족도 칩에 `testID={'place-good-'+stepId}` / `place-bad-…` / `place-price-…-{1,2,3}`을 부여하는 것이 구현 요건이다.)

- [x] **Step 2: 실패 확인** — FAIL.
- [x] **Step 3: 구현** — `review.tsx`에 추가:
  - 로드: `useFocusEffect` 내 기존 프로필 조회에 이어 `supabase.rpc('get_course_places_for_review', { p_card_id: id })` → `places` state. 실패·빈 배열이면 섹션 미렌더.
  - state: `const [placeSatisfactions, setPlaceSatisfactions] = useState<Record<string, PlaceSatisfaction>>({});`, `const [placePrices, setPlacePrices] = useState<Record<string, 1|2|3>>({});`, `const touchedRef = useRef<Set<string>>(new Set())`.
  - 별점 변경 시: `setRating(n)` 핸들러에서 유도 기본값 재적용하되 사용자가 탭한 스텝은 보존:

```ts
function handleRating(n: Rating) {
  setRating(n);
  setPlaceSatisfactions((prev) => {
    const derived = initialPlaceSatisfactions(n, placeEntries.map((p) => p.step_id));
    const kept = Object.fromEntries(
      [...touchedRef.current].filter((id) => prev[id] !== undefined).map((id) => [id, prev[id]]),
    );
    return { ...derived, ...kept };
  });
}
```

  - UI: 별점 피드백 카드 아래 섹션. 장소 행마다 이름 + 만족도 칩 2개(좋아요/별로예요, `togglePlaceSatisfaction`) + 가격 칩 3개(저렴/보통/비쌈, 기본값 없음, 재탭 해제). 스타일은 파일 내 기존 칩·카드 토큰(`C`, `SP`, `R`) 재사용.
  - 저장: `handleSave`의 `date_memories` insert 성공 직후, 라우팅 전에:

```ts
      // 장소별 등급은 선택 사항 — 실패해도 별점 저장 성공 흐름을 막지 않는다.
      const feedbackCalls = placeEntries
        .map((entry) => placeFeedbackRpcArgs({
          sessionId: entry.session_id,
          stepId: entry.step_id,
          satisfaction: placeSatisfactions[entry.step_id],
          priceLevel: placePrices[entry.step_id] ?? null,
        }))
        .filter((args): args is NonNullable<typeof args> => args !== null);
      await Promise.allSettled(feedbackCalls.map((args) =>
        supabase.rpc('record_recommendation_place_feedback', args)));
```

  - i18n(`review` 네임스페이스, ko/en 동시):

```jsonc
// ko.json review 하위
"placeSection": {
  "title": "이번 코스 장소들은 어땠나요?",
  "sub": "아쉬웠던 곳만 바꿔주세요. 가격은 알려주시면 다음 추천이 좋아져요.",
  "good": "좋아요",
  "bad": "별로예요",
  "priceCheap": "저렴",
  "priceNormal": "보통",
  "priceExpensive": "비쌈"
}
// en.json 동일 키: "How were the places on this course?", "Only flag the ones that fell short. Sharing prices improves future picks.",
// "Liked it", "Not great", "Cheap", "Fair", "Pricey"
```

- [x] **Step 4: 테스트 PASS + `npm run validate` 클린.**
- [x] **Step 5: StyleSeed Gate** — `/ss-score` Gate 모드로 `app/card/review.tsx` 채점, <80이면 수정 후 재채점(≥80까지), `styleseed-design-review`도 실행. 점수와 함께 제시.
- [x] **Step 6: 커밋** — `git commit -m "feat: 리뷰 화면 장소별 만족도·가격 수집(별점 유도 기본값, 건너뛰기 허용)"`

---

## Task 12: 통합 검증

- [x] **Step 1:** 루트에서 `npx jest` 전체 → 전 suite PASS.
- [x] **Step 2:** `npm run validate`(tsc) 클린. 에러는 스스로 수정(해결한 유형은 AGENTS.md Anti-Patterns에 1줄 추가).
- [x] **Step 3:** 전체 완료 후 한 번에 코드 리뷰(superpowers:requesting-code-review — 사용자 선호: 단계별 리뷰 금지, 완료 후 일괄).
- [x] **Step 4:** 커밋(리뷰 지적 수정 반영).

---

## Task 13: 마이그레이션 4 — pg_cron 활성화 + 집계→삭제 스케줄 【승인 게이트 1 계속】

**Files:**
- Create: `supabase/migrations/20260727140000_pg_cron_ai_retention.sql`
- Modify: `docs/supabase-schema.sql`
- Test: `__tests__/aiRetentionCronMigration.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/aiRetentionCronMigration.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AI 보존 cron 마이그레이션', () => {
  const migration = readFileSync(
    join(__dirname, '..', 'supabase/migrations/20260727140000_pg_cron_ai_retention.sql'), 'utf8',
  );
  it('한 함수 안에서 집계가 삭제보다 반드시 먼저 실행된다', () => {
    const body = migration.slice(migration.indexOf('run_ai_retention'));
    const aggregateIndex = body.indexOf('aggregate_ai_recommendation_log_daily_stats');
    const purgeIndex = body.indexOf('purge_expired_ai_data');
    expect(aggregateIndex).toBeGreaterThan(-1);
    expect(purgeIndex).toBeGreaterThan(aggregateIndex);
  });
  it('pg_cron으로 하루 한 번 스케줄된다', () => {
    expect(migration).toContain('create extension if not exists pg_cron');
    expect(migration).toContain("cron.schedule");
    expect(migration).toContain('run_ai_retention');
  });
});
```

- [x] **Step 2: 실패 확인 → SQL 작성**

```sql
-- supabase/migrations/20260727140000_pg_cron_ai_retention.sql
-- 반드시 일별 집계 마이그레이션(20260727100000) 이후에 적용한다.
-- 순서가 뒤집히면 첫 purge에서 집계 없는 이력이 사라진다.
begin;

create extension if not exists pg_cron;

-- 집계 → 삭제를 한 함수에 묶어 순서를 스케줄 설정이 아니라 코드로 보장한다.
create or replace function public.run_ai_retention()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.aggregate_ai_recommendation_log_daily_stats();
  perform public.purge_expired_ai_data();
end;
$$;
revoke all on function public.run_ai_retention() from public;

-- 03:30 KST(= 18:30 UTC) 매일. 중복 등록 방지를 위해 기존 잡을 먼저 내린다.
select cron.unschedule(jobid) from cron.job where jobname = 'ai-retention-daily';
select cron.schedule('ai-retention-daily', '30 18 * * *', $$select public.run_ai_retention()$$);

commit;
```

- [x] **Step 3: 테스트 PASS, `docs/supabase-schema.sql` append.**
- [x] **Step 4: 사용자 승인 후 MCP `apply_migration` 적용.** 첫 만료일(2026-08-17) 전 아무 날이나 안전. 적용 직후 검증:

```sql
select jobname, schedule, command from cron.job;                -- 잡 등록 확인
select public.run_ai_retention();                               -- 수동 1회 실행
select count(*) from public.ai_recommendation_log_daily_stats;  -- 집계 적재 확인
select min(created_at) from public.ai_recommendation_logs;      -- 30일 내 데이터만 남았는지(현재는 전부 8~일차라 삭제 0건이어야 정상)
```

- [x] **Step 5: 커밋** — `git commit -m "feat(db): pg_cron 일별 집계→삭제 보존 스케줄(집계 선행 코드 보장)"`

---

## Task 14: Edge 함수 재배포 【승인 게이트 2】

- [x] **Step 1: 사용자 승인** — 변경 요약: generate-ai(신규 액션), recommend-date(백그라운드 기록 + budget 랭킹), replacement-candidates(공유 랭킹 모듈 변경 반영). 위험: 공유 모듈 번들 스큐(과거 404 사고) → **세 함수 동시 재배포**로 회피. 추정 비용: 신규 장소당 haiku 1회(생성 1회 ≈ 수 원 수준 증가).
- [x] **Step 2: MCP `deploy_edge_function`으로 `generate-ai` → `recommend-date` → `replacement-candidates` 순 배포.**
- [x] **Step 3: 라이브 검증** — 실기기/시뮬에서 코스 1회 생성 후:

```sql
select kakao_place_id, place_name, estimated_min_krw, estimated_max_krw, estimate_model
from public.places order by first_seen_at desc limit 10;
select action, status, latency_ms from public.ai_recommendation_logs
where action = 'estimate_place_price' order by created_at desc limit 10;
```

  생성 응답 지연이 기존과 동일한지(백그라운드이므로 0 영향이어야 함) `get_logs`로 확인.
- [x] **Step 4: 결과 기록 커밋.**

---

## Task 15: 기존 51곳 백필 — 추정 품질 검증 【승인 게이트 3】

**Files:**
- Create: `scripts/backfill-place-prices.ts`

- [x] **Step 1: 스크립트 작성** (deno, 기존 `scripts/eval-ai-logs.ts` 실행 관례 참조 — Anthropic API 직접 호출로 사용자 JWT 불요. 프롬프트·파서는 Task 7 모듈 import로 Edge와 단일 소스):

```ts
// scripts/backfill-place-prices.ts
// 목적: 커버리지가 아니라 추정 품질 검증(스펙 §4). 이름만으로 가격대를 아는 개발 중
// 장소들로 AI 추정 로직을 출시 전에 사람이 검증한다. 결과는 markdown 표로 출력.
// 실행: deno run -A scripts/backfill-place-prices.ts
import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import {
  buildPlacePriceEstimationPrompt, parsePlacePriceEstimate, PLACE_PRICE_PROMPT_VERSION,
} from '../supabase/functions/_shared/place-price-prompt.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const KAKAO_KEY = Deno.env.get('KAKAO_REST_API_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL = 'claude-haiku-4-5';

// 1) 이력에 등장한 모든 장소(스텝 테이블에는 category_name이 없어 카카오 재조회로 보강).
const { data: steps, error } = await supabase
  .from('recommendation_course_steps')
  .select('current_kakao_place_id, place_name, address, road_address, map_url, latitude, longitude');
if (error) throw error;
const byId = new Map<string, typeof steps[number]>();
for (const step of steps ?? []) byId.set(step.current_kakao_place_id, step);

async function kakaoCategory(name: string, id: string): Promise<{ categoryName: string; categoryGroupCode: string }> {
  const response = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(name)}&size=15`,
    { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } },
  );
  const body = await response.json();
  const doc = (body.documents ?? []).find((d: { id: string }) => d.id === id);
  return { categoryName: doc?.category_name ?? '', categoryGroupCode: doc?.category_group_code ?? '' };
}

async function estimate(prompt: string): Promise<unknown> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 256, temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = await response.json();
  const text = body.content?.[0]?.text ?? '';
  try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { return null; }
}

const rows: string[] = ['| 장소 | 카테고리 | 추정(1인) | 판정 |', '|---|---|---|---|'];
for (const [id, step] of byId) {
  const category = await kakaoCategory(step.place_name, id);
  const raw = await estimate(buildPlacePriceEstimationPrompt({
    placeName: step.place_name, categoryName: category.categoryName, address: step.address,
  }));
  const parsed = parsePlacePriceEstimate(raw);
  if (parsed) {
    await supabase.from('places').upsert([{
      kakao_place_id: id, place_name: step.place_name, address: step.address,
      road_address: step.road_address, map_url: step.map_url,
      latitude: step.latitude, longitude: step.longitude,
      category_name: category.categoryName, category_group_code: category.categoryGroupCode,
      estimated_min_krw: parsed.minKRW, estimated_max_krw: parsed.maxKRW,
      estimated_at: new Date().toISOString(), estimate_model: MODEL,
    }]);
  }
  rows.push(`| ${step.place_name} | ${category.categoryName} | ${parsed ? `${parsed.minKRW.toLocaleString()}~${parsed.maxKRW.toLocaleString()}원` : '실패'} |  |`);
}
console.log(rows.join('\n'));
console.log(`\nprompt version: ${PLACE_PRICE_PROMPT_VERSION}`);
```

- [x] **Step 2: 사용자 승인 후 실행** — `deno run -A scripts/backfill-place-prices.ts` (env 3종 필요).
- [x] **Step 3: 표를 사용자와 함께 훑는다.** 명백한 오답(국밥집 5만원류)이 있으면 Task 7 프롬프트를 고치고 재실행. 판정 결과에 따라 프롬프트 버전 bump(`place-price-v2`).
- [x] **Step 4: 커밋** — `git commit -m "feat: 51곳 가격 추정 백필 스크립트 + 품질 검증 결과"`

---

## 스펙 대비 범위 노트

- **포함:** 목표 1~4 전부, 리뷰 §5(장소별 등급 + `price_level`), §5-1의 순수 로직(축소 보정·구간 좁히기 — 관측 재계산 SQL은 배선까지, 만족도 축소 보정은 함수+테스트만), 데이터 흐름 3단(생성 upsert / 리뷰 갱신 / 소비 budget 점수), 보존 §6.
- **명시적 제외(스펙 비목표·미결정):** 행동 통계 임계치 확정과 랭킹 반영, 카테고리별 예산 배분, "왜 별로였는지" 이유 태그, 신원 스냅샷 갱신 주기(원장에 `updated_at`·`last_seen_at`으로 준비만).
- **Phase 3 실행 중 확정된 결정(2026-07-27, 코드 리뷰 반영):**
  1. 선정 장소 역참조는 `candidateId`가 아니라 **`kakaoPlaceId`**로 한다. 잠긴 스텝의 `candidateId`는 이전 요청에서 발급된 값이라 현재 후보 풀의 무관한 장소와 매칭된다(계획 원안의 잠재 버그).
  2. **관측 임계치는 경계별 표본 수에 건다.** 전체 응답 수(보통 포함)로 세면 "보통 2건 + 비쌈 1건"이 임계치 3을 통과해 한 사람의 앵커가 하한이 된다. `observed_min_sample_count`·`observed_max_sample_count` 신설(마이그레이션 `20260727140000`, 원격 미적용 — 승인 게이트 1).
  3. **교체 시트도 예산 점수를 쓴다.** 랭킹 `score`에 budget이 포함되어 `contextScore`→`replacementScore`로 자연히 흐른다. 단 교체 요청은 `courseSteps`를 1개로 좁히므로 **예산도 코스 스텝 수로 나눈 몫**을 실어야 한다(안 그러면 앵커가 코스 전체 예산이 되어 전원 가점).
  4. 원장 경로는 전부 예외를 삼키므로 **성공/실패는 로그로만 드러난다** — `place_ledger_recorded`(요약 카운트)·`place_price_lookup_failed`를 반드시 유지한다.
- **스펙 편차 2건(각 태스크에 근거 기록):** ① 커플 중복 제거 "테이블" 대신 뷰 내 `count(distinct)` (Task 5), ② "예산 필터 0개 완화"는 하드 필터 자체를 두지 않는 소프트 점수로 구조적 해소(Task 10).

## 성공 지표 확인 쿼리(출시 후 사용, 참고용)

```sql
-- 추정 커버리지
select count(*) filter (where estimated_at is not null)::float / count(*) from public.places;
-- 관측 승격 수
select count(*) from public.places where observed_min_krw is not null or observed_max_krw is not null;
-- 리뷰 참여율·확정률은 기존 대시보드 쿼리 유지.
```

---

## 실행 결과 기록 (2026-07-27, Task 11~15 종결)

- **Task 11:** 리뷰 화면 장소별 만족도·가격 수집 구현. 코드 리뷰 지적 3건 반영 —
  ① 유도 기본값을 사용자가 *해제*한 스텝이 별점 재선택으로 되살아나던 버그(touched를
  derived에서 제외), ② `supabase.rpc`는 실패해도 reject하지 않아 수집 0건이 무음이던 문제
  (`console.warn` 두 경로 추가), ③ 칩 라벨 대비(핑크 #C24B57 on 파스텔 = 4.2:1) → 본문색으로.
- **Task 13:** 파일명은 `20260727150000`(원안 140000은 관측 표본 수 교정이 선점).
  계획에 없던 `revoke ... purge_expired_ai_data() from anon, authenticated` 추가 —
  생성 당시 `from public`만 회수돼 로그인 사용자가 직접 호출 가능했다.
- **게이트 1 (원격 적용 완료):** 마이그레이션 2건 적용. `run_ai_retention()` 수동 1회 실행 →
  일별 집계 9행 적재, `ai_recommendation_logs` 60건 유지(최고령 9일차라 삭제 0건 정상),
  `has_function_privilege('authenticated', …)` 두 함수 모두 false 확인.
- **게이트 2 (배포 완료):** generate-ai → recommend-date → replacement-candidates 순 재배포(CLI).
  라이브 코스 1회 생성 검증은 사용자 실기기 확인 대기.
- **게이트 3 (백필 완료):** 60곳(계획의 51곳은 그 사이 증가) 전부 추정 성공, 파싱 실패 0건.
  카테고리는 Kakao REST 키가 로컬에 없어 `kakao_search_cache`에서 조달(미해결 5곳).
  표 육안 검증: 빽다방 5~8천, 갈비 3.5~5.5만, 미술관 1~1.5만 등 명백한 오답 없음 →
  프롬프트 버전 bump 불필요(`place-price-v1` 유지).
