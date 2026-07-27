# 목표 지출대 기반 장소 예산 랭킹 Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** 사용자가 입력한 예산을 최대 한도가 아닌 목표 지출대로 처리해, 동일 조건 후보 중 목표 금액대에 가까운 장소가 우선 추천되게 한다.

**Architecture:** `shared/recommendation/place-price.ts`의 순수 예산 점수만 목표 구간 기반으로 교체한다. `recommendation-ranking.ts`와 교체 후보 핸들러는 이미 그 함수를 소비하므로 인터페이스를 유지한 채 신규 규칙을 자동 상속한다. 가격 미상은 0점으로 남기고, 신규 장소의 응답 후 백그라운드 가격 축적 구조는 변경하지 않는다.

**Tech Stack:** TypeScript, Jest, Supabase Edge Functions (Deno), Supabase Postgres, Claude Haiku 가격 추정 원장.

## Global Constraints

- 예산 입력 UI는 1인 기준이며 `buildStructuredCourseInput`은 Edge 계약의 2인 총액 `totalBudgetKRW`로 변환한다.
- 현재 코스와 교체 후보 모두 `priceAnchorKRW(totalBudgetKRW, stepCount)`를 사용한다. 교체 후보는 이미 코스 전체 예산을 전체 스텝 수로 나눈 몫만 검색에 전달한다.
- 가격은 하드 필터가 아니다. 예산 미입력·가격 미상·불완전한 범위는 항상 점수 0이며 후보를 제거하지 않는다.
- 카테고리, 명시적 제외, 직접 지정 핀, 필수 step intent, 잠금, 도보 제약의 기존 우선순위를 바꾸지 않는다.
- 공유 `recommendation-ranking.ts`를 수정하면 `recommend-date`와 `replacement-candidates`를 같은 작업에서 함께 재배포한다.
- 모든 테스트는 루트에서 실행한다. 코드 변경 뒤 `npm run validate`를 반드시 실행한다.

---

## 파일 맵

| 파일 | 역할 |
| --- | --- |
| `shared/recommendation/place-price.ts` | 가격 범위와 스텝별 목표 지출대의 순수 점수 규칙 및 상수 |
| `__tests__/place-price.test.ts` | 순수 목표 지출대 규칙의 단위 회귀 테스트 |
| `__tests__/recommend-date-ranking-server.test.ts` | 실제 후보 랭킹에서 목표 가격 후보가 우선하는 통합 단위 테스트 |
| `docs/superpowers/specs/2026-07-27-budget-target-spend-design.md` | 사용자 합의 의미·규칙·비목표의 정본 |
| `docs/superpowers/plans/2026-07-27-budget-target-spend.md` | 이 실행 계획과 배포·실데이터 QA 절차 |
| `PLAN.md` | 다음 세션에서 실행할 활성 계획 링크 |

## Task 1: 목표 지출대 순수 점수 규칙

**Files:**
- Modify: `shared/recommendation/place-price.ts:83-101`
- Modify: `__tests__/place-price.test.ts:128-141`

**Interfaces:**
- Consumes: `PriceRange` (`source`, `minKRW`, `maxKRW`)와 nullable `shareKRW`.
- Produces: 기존 시그니처를 유지하는 `budgetScoreFor(range: PriceRange, shareKRW: number | null): number`.
- Produces: `BUDGET_SCORE_WEIGHTS`에 `targetFit`, `nearTarget`, `underTargetPenalty`, `overTargetPenalty`, `targetLowerRatio`, `targetUpperRatio`, `nearLowerRatio`, `nearUpperRatio`를 명시한다.

- [ ] **Step 1: 목표 근접·저가·고가의 실패 테스트를 작성한다.**

  `__tests__/place-price.test.ts`의 `budgetScoreFor` describe를 아래 케이스로 교체한다. 이 테스트가 잡아야 하는 생산 변경은 기존의 "목표 이하 장소 모두 +10" 규칙이다.

  ```ts
  it('목표 구간과 겹치는 장소를 목표보다 크게 저렴하거나 비싼 장소보다 높게 점수화한다', () => {
    const target = 50_000;
    const targetFit = budgetScoreFor({ source: 'estimated', minKRW: 40_000, maxKRW: 55_000 }, target);
    const tooCheap = budgetScoreFor({ source: 'estimated', minKRW: 8_000, maxKRW: 20_000 }, target);
    const tooExpensive = budgetScoreFor({ source: 'estimated', minKRW: 80_000, maxKRW: 100_000 }, target);

    expect(targetFit).toBeGreaterThan(0);
    expect(tooCheap).toBeLessThan(0);
    expect(tooExpensive).toBeLessThan(tooCheap);
    expect(targetFit).toBeGreaterThan(tooCheap);
  });

  it('목표 구간 바깥이지만 가까운 가격은 약한 가점을 받는다', () => {
    expect(budgetScoreFor({ source: 'estimated', minKRW: 28_000, maxKRW: 30_000 }, 50_000)).toBeGreaterThan(0);
  });

  it('가격 미상 또는 예산 미입력은 0이라 후보를 제거하지 않는다', () => {
    expect(budgetScoreFor({ source: 'unknown', minKRW: null, maxKRW: null }, 50_000)).toBe(0);
    expect(budgetScoreFor({ source: 'estimated', minKRW: 40_000, maxKRW: 55_000 }, null)).toBe(0);
  });
  ```

- [ ] **Step 2: 실패를 확인한다.**

  Run: `npx jest __tests__/place-price.test.ts --runInBand`

  Expected: 첫 테스트가 실패한다. 기존 구현은 `8,000~20,000원`을 목표 50,000원 이하로 보아 양수 점수를 주므로 `tooCheap < 0` 단언을 통과할 수 없다.

- [ ] **Step 3: 최소 구현으로 목표 구간 점수를 만든다.**

  `BUDGET_SCORE_WEIGHTS`를 아래 값으로 바꾸고, `budgetScoreFor`에 경계 겹침을 계산하는 작은 로컬 헬퍼를 둔다. `minKRW` 또는 `maxKRW`가 null이면 존재하는 경계로만 "완전히 아래/위" 여부를 판단한다.

  ```ts
  export const BUDGET_SCORE_WEIGHTS = {
    targetFit: 20,
    nearTarget: 4,
    underTargetPenalty: -10,
    overTargetPenalty: -20,
    targetLowerRatio: 0.75,
    targetUpperRatio: 1.25,
    nearLowerRatio: 0.55,
    nearUpperRatio: 1.5,
  } as const;

  function overlaps(range: PriceRange, lower: number, upper: number): boolean {
    return (range.maxKRW === null || range.maxKRW >= lower)
      && (range.minKRW === null || range.minKRW <= upper);
  }

  export function budgetScoreFor(range: PriceRange, targetKRW: number | null): number {
    if (targetKRW === null || range.source === 'unknown') return 0;
    const targetLower = targetKRW * BUDGET_SCORE_WEIGHTS.targetLowerRatio;
    const targetUpper = targetKRW * BUDGET_SCORE_WEIGHTS.targetUpperRatio;
    if (overlaps(range, targetLower, targetUpper)) return BUDGET_SCORE_WEIGHTS.targetFit;
    const nearLower = targetKRW * BUDGET_SCORE_WEIGHTS.nearLowerRatio;
    const nearUpper = targetKRW * BUDGET_SCORE_WEIGHTS.nearUpperRatio;
    if (overlaps(range, nearLower, nearUpper)) return BUDGET_SCORE_WEIGHTS.nearTarget;
    if (range.maxKRW !== null && range.maxKRW < nearLower) return BUDGET_SCORE_WEIGHTS.underTargetPenalty;
    if (range.minKRW !== null && range.minKRW > nearUpper) return BUDGET_SCORE_WEIGHTS.overTargetPenalty;
    return 0;
  }
  ```

- [ ] **Step 4: 순수 테스트를 통과시킨다.**

  Run: `npx jest __tests__/place-price.test.ts --runInBand`

  Expected: PASS. 기존 `priceAnchorKRW`, 관측 범위 선택, 만족도 축소 보정 테스트도 모두 통과한다.

- [ ] **Step 5: 커밋한다.**

  ```bash
  git add shared/recommendation/place-price.ts __tests__/place-price.test.ts
  git commit -m "feat: rank places by target budget range"
  ```

## Task 2: 실제 후보 랭킹 회귀 고정

**Files:**
- Modify: `__tests__/recommend-date-ranking-server.test.ts:455-480`

**Interfaces:**
- Consumes: `rankPlaceCandidates(places, request, { limit, prices })`와 Task 1의 `budgetScoreFor`.
- Produces: 예산 입력·알려진 가격·동일 카테고리/거리 조건에서 목표 가격 후보가 최상위라는 회귀 보장.

- [ ] **Step 1: 동일 조건 세 후보의 실패 테스트를 작성한다.**

  기존 예산 테스트 주변에 아래 테스트를 추가한다. `placeA`, `placeB`의 기존 fixture가 카테고리와 거리에서 같은 점수를 받지 않으면, 같은 `categoryGroupCode`, `matchedSearchEvidence`, 좌표를 복사한 `place('target')`, `place('cheap')`, `place('expensive')` fixture를 이 테스트 안에 만든다.

  ```ts
  it('같은 카테고리·거리 후보에서는 스텝별 목표 지출대 장소를 최상위로 둔다', () => {
    const target = place('target', 'FD6');
    const cheap = place('cheap', 'FD6');
    const expensive = place('expensive', 'FD6');
    const ranked = rankPlaceCandidates([cheap, expensive, target], {
      ...request(),
      totalBudgetKRW: 100_000,
    }, {
      limit: 10,
      prices: new Map([
        ['target', priceFields({ estimatedMinKRW: 40_000, estimatedMaxKRW: 55_000 })],
        ['cheap', priceFields({ estimatedMinKRW: 8_000, estimatedMaxKRW: 20_000 })],
        ['expensive', priceFields({ estimatedMinKRW: 80_000, estimatedMaxKRW: 100_000 })],
      ]),
    });

    expect(ranked.candidates.map((candidate) => candidate.kakaoPlaceId)).toEqual(['target', 'cheap', 'expensive']);
    expect(budgetOf(ranked, 'target')).toBeGreaterThan(0);
    expect(budgetOf(ranked, 'cheap')).toBeLessThan(0);
    expect(budgetOf(ranked, 'expensive')).toBeLessThan(budgetOf(ranked, 'cheap'));
  });
  ```

- [ ] **Step 2: 실패를 확인한다.**

  Run: `npx jest __tests__/recommend-date-ranking-server.test.ts --runInBand`

  Expected: Task 1 구현 전에는 저가 후보가 양수 점수라 순서 또는 `cheap < 0` 단언이 실패한다. Task 1이 이미 적용된 실행에서는 이 단계가 GREEN일 수 있으므로, 실행 순서를 지킬 때 반드시 Task 1 Step 2에서 RED를 기록한다.

- [ ] **Step 3: 랭킹 코드 변경 없이 연결을 확인한다.**

  `supabase/functions/_shared/recommendation-ranking.ts`의 아래 호출이 Task 1의 반환값을 그대로 `scoreBreakdown.budget`에 넣는지 확인한다. 이미 연결돼 있으므로 이 태스크에서 생산 코드를 바꾸지 않는다.

  ```ts
  const budgetShareKRW = priceAnchorKRW(request.totalBudgetKRW, request.courseSteps.length);
  const budgetScoreOf = (kakaoPlaceId: string) => {
    const price = options.prices?.get(kakaoPlaceId);
    return price ? budgetScoreFor(pickPriceRange(price), budgetShareKRW) : 0;
  };
  ```

- [ ] **Step 4: 랭킹·교체 회귀를 통과시킨다.**

  Run: `npx jest __tests__/recommend-date-ranking-server.test.ts __tests__/replacementCandidatesHandler.test.ts --runInBand`

  Expected: PASS. 교체 후보가 전체 예산을 전체 스텝 수로 나눈 금액만 전달하는 기존 회귀 테스트도 PASS한다.

- [ ] **Step 5: 커밋한다.**

  ```bash
  git add __tests__/recommend-date-ranking-server.test.ts
  git commit -m "test: cover target-budget recommendation ranking"
  ```

## Task 3: 전체 검증과 Edge 동시 배포

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-budget-target-spend.md` (실행 결과만 추가)

**Interfaces:**
- Consumes: Task 1의 순수 점수와 Task 2의 랭킹 회귀 보장.
- Produces: 동일 공유 랭킹 모듈을 포함한 라이브 `recommend-date` 및 `replacement-candidates` 배포본.

- [ ] **Step 1: 전체 로컬 검증을 실행한다.**

  Run: `npx jest --runInBand && npm run validate`

  Expected: Jest 전체 PASS와 `tsc --noEmit` 오류 0개. 실패가 있으면 해당 실패의 근본 원인을 먼저 분석하고, 범위 밖 변경을 섞지 않는다.

- [ ] **Step 2: 배포 직전 번들 범위를 확인한다.**

  Run: `git diff --check HEAD~2..HEAD && git status --short`

  Expected: 공백 오류 없음. 사용자의 기존 미커밋 `AGENTS.md`, `CLAUDE.md`는 스테이징하거나 수정하지 않는다.

- [ ] **Step 3: 공유 랭킹을 포함한 Edge 두 함수를 순서대로 배포한다.**

  Run: `supabase functions deploy recommend-date --project-ref wqjguifsmtblgrhdfnji && supabase functions deploy replacement-candidates --project-ref wqjguifsmtblgrhdfnji`

  Expected: 두 배포 모두 성공. `generate-ai`는 이 변경의 공유 랭킹 모듈을 번들하지 않으므로 재배포하지 않는다.

- [ ] **Step 4: 실데이터에서 목표 지출대 반영을 확인한다.**

  동일 지역·동일 2스텝 조합으로 낮은 예산과 높은 예산을 각각 한 번 생성한다. 생성 뒤 아래 읽기 전용 쿼리를 실행한다. `totalBudgetKRW / step_count`와 선택 장소의 가격 범위를 비교해, 목표 근처 후보가 저가/고가 후보보다 우선됐는지 기록한다.

  ```sql
  with recent as (
    select id, created_at, coalesce(latest_request, original_request) as request
    from public.recommendation_sessions
    order by created_at desc
    limit 4
  )
  select
    r.id as session_id,
    r.created_at at time zone 'Asia/Seoul' as created_kst,
    (r.request->>'totalBudgetKRW')::int as total_budget_krw,
    round((r.request->>'totalBudgetKRW')::numeric / count(*) over (partition by r.id)) as per_step_target_krw,
    cs.step_order,
    cs.place_name,
    coalesce(p.observed_min_krw, p.estimated_min_krw) as min_krw,
    coalesce(p.observed_max_krw, p.estimated_max_krw) as max_krw
  from recent r
  join public.recommendation_course_steps cs on cs.session_id = r.id
  left join public.places p on p.kakao_place_id = cs.current_kakao_place_id
  order by r.created_at desc, cs.step_order;
  ```

  Expected: 새로 만든 두 세션 모두 `totalBudgetKRW`가 입력값과 일치한다. 가격이 이미 알려진 후보가 충분할 때, 더 높은 목표의 세션은 낮은 목표 세션보다 목표 구간에 가까운 선택을 보인다. 신규·미상 가격만 나온 경우에는 이 검증을 "가격 미상"으로 기록하고, 같은 조건을 한 번 더 생성해 백그라운드 추정 후 재확인한다.

- [ ] **Step 5: 실행 결과를 기록하고 커밋한다.**

  계획 문서 하단에 실행 일시, 전체 테스트·타입검사 결과, Edge 배포 버전, 두 실데이터 세션의 목표값/선택 가격/판정을 추가한다.

  ```bash
  git add docs/superpowers/plans/2026-07-27-budget-target-spend.md
  git commit -m "docs: record target-budget rollout verification"
  ```

## 계획 자체 검토

- 스펙의 목표 지출대·저가/고가 비대칭·가격 미상 중립·무지연 요구사항은 Task 1과 Task 3에 각각 대응한다.
- 카테고리별 배분, 동기 AI 가격 추정, 하드 필터는 비목표로 명시했고 어떤 태스크에도 넣지 않았다.
- 모든 새 생산 동작은 Task 1의 RED→GREEN 테스트로 먼저 고정하며, Task 2는 실제 랭킹 연결을 고정한다.
- `budgetScoreFor`, 상수명, 비율, 배포 대상 함수가 모든 태스크에서 동일하다.
