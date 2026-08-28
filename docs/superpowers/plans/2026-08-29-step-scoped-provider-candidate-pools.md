# 단계별 Provider 후보풀 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Naver-first와 Kakao-first 추천, 재생성, 교체가 단계별로 분리된 후보풀에서만 선택하도록 만들고 Naver identity만 있는 세션의 편집을 가능하게 한다.

**Architecture:** 검색 plan과 discovery 결과에 `stepId`를 유지해 `StepCandidatePool[]`을 만든다. AI와 결정형 fallback은 대상 step pool의 selectable 후보만 고르고, snapshot·attestation·mutation은 `{ provider, providerPlaceId }` identity를 canonical 값으로 보존한다. 후보가 부족하면 전체 후보 수가 아닌 단계별 selectable 수(정확히 2개)를 기준으로 보조 provider를 호출한다.

**Tech Stack:** TypeScript, Zod, Jest, Supabase Edge Functions (Deno), Supabase Postgres/RPC, Expo React Native.

**Spec:** `docs/superpowers/specs/2026-08-29-step-scoped-provider-candidate-pools-design.md`

## Global Constraints

- 모든 selectable 후보는 정확히 하나의 `sourceStepId`를 갖고, 해당 step에서만 선택한다.
- 태그 유무와 무관하게 단계별 최소 selectable 후보 수는 **2개**다.
- `unknown`은 원래 step pool 안에서만 허용하고, clear known category mismatch는 계속 거부한다.
- 검색어 또는 `step_intent` 검색 phase 자체를 required keyword 일치 증거로 사용하지 않는다.
- 동일 물리 장소는 서로 다른 pool에 발견될 수 있으나 최종 코스에는 한 번만 선택한다.
- Kakao link는 선택적 지도·리뷰 메타데이터이며 provider identity 또는 편집 권한의 전제가 아니다.
- 기존 flat snapshot은 읽기 호환성을 유지하고, 새로 저장되는 후보 snapshot에는 `sourceStepId`와 qualification 근거를 기록한다.
- 원격 프로젝트는 `wqjguifsmtblgrhdfnji`이며 Edge 배포는 `supabase functions deploy` CLI를 사용한다.
- 모든 코드 변경 후 관련 Jest, `npm run validate`, `git diff --check`를 실행한다.

## 파일 구조

- `supabase/functions/_shared/provider-neutral-discovery-pipeline.ts`: `StepCandidatePool` 생성, 단계별 quality/intent 평가, 단계별 sufficient/fallback telemetry.
- `supabase/functions/_shared/recommendation-discovery.ts`: 평면 누적 discovery를 재사용 가능한 단일 pool runner로 제한하거나 step-scoped runner로 교체.
- `supabase/functions/_shared/recommendation-discovery-strategy.ts`: Naver query에 stepId를 보존한다.
- `supabase/functions/_shared/recommendation-search.ts`, `recommendation-search-pipeline.ts`: Kakao search plan 결과를 step별로 귀속한다. 캐시된 raw API 응답은 재사용 가능하지만 후보 객체는 pool별로 생성한다.
- `supabase/functions/_shared/provider-neutral-intent.ts`, `step-intent.ts`: 검색 근거가 아닌 provider metadata 기반 intent evidence만 selectable 판정에 사용한다.
- `supabase/functions/_shared/provider-neutral-course-selection.ts`, `recommendation-prompt.ts`, `recommend-date-handler.ts`: grouped prompt, source-step 검증, deterministic selection, snapshot/telemetry 연결.
- `shared/recommendation/schemas.ts`: step-scoped candidate snapshot 및 provider-neutral locked/mutation input schema.
- `supabase/functions/provider-neutral-replacements/index.ts`: 대상 step pool을 2개 기준으로 discovery하고 attestation에 identity/sourceStepId를 보존한다.
- `docs/supabase-schema.sql`, `supabase/migrations/20260829000000_provider_neutral_session_mutations.sql`: provider-neutral identity를 수용하도록 persistence/RPC 계약을 이행한다.
- `lib/recommendation-session-repository.ts`, `app/mode-flow/course-result.tsx`: Kakao ID early return을 제거하고 provider identity로 lock/regenerate/replacement/add mutation을 구성한다.
- `__tests__/provider-neutral-discovery-pipeline.test.ts`, `provider-neutral-course-selection.test.ts`, `provider-neutral-prompt.test.ts`, `recommend-date-search-server.test.ts`, `recommend-date-server.test.ts`, `recommend-date-phase7-handler.test.ts`, `recommendationSessionRepository.test.ts`, `course-result-screen.test.tsx`: 단계 소속, fallback, 태그, persistence, UI 회귀를 검증한다.

---

### Task 1: 단계별 후보 타입과 Naver discovery 경계를 만든다

**Files:**
- Modify: `supabase/functions/_shared/provider-neutral-course-selection.ts`
- Modify: `supabase/functions/_shared/provider-neutral-discovery-pipeline.ts`
- Modify: `supabase/functions/_shared/recommendation-discovery.ts`
- Test: `__tests__/provider-neutral-discovery-pipeline.test.ts`
- Test: `__tests__/provider-neutral-course-selection.test.ts`

**Interfaces:**

```ts
export type CandidateQualification = {
  category: 'compatible' | 'unknown';
  intent: 'not_required' | 'matched' | 'unmatched';
  intentEvidence: readonly IntentEvidence[];
};

export type ProviderNeutralCandidate = {
  candidateId: string;
  sourceStepId: string;
  place: NormalizedPlace;
  distanceFromSearchCenterMeters: number;
  popularityBonus: number;
  qualification: CandidateQualification;
};

export type StepCandidatePool = {
  stepId: string;
  candidates: readonly ProviderNeutralCandidate[];
  selectableCandidates: readonly ProviderNeutralCandidate[];
  sufficient: boolean;
};

export type StepDiscoveryAttempt = {
  stepId: string;
  run: () => Promise<NormalizedPlace[]>;
};
```

`discoverProviderNeutralCandidates()`는 `primaryAttempts`/`fallbackAttempts`를 `StepDiscoveryAttempt[]`로 받고 `{ pools, candidates, discovery, diagnostics }`를 반환한다. `candidates`는 legacy consumer 전환 기간에만 `pools.flatMap(pool => pool.selectableCandidates)`로 제공하며, selector는 `pools`를 사용한다.

- [ ] **Step 1: cross-step 후보 전용과 단계별 부족 RED test를 작성한다.**

  `provider-neutral-discovery-pipeline.test.ts`에 Meal/Cafe 두 step fixture를 만든다. Meal attempt에서 Meal 후보 2개, Cafe attempt에서 Cafe 후보 1개를 반환하고 fallback은 Cafe 후보 1개만 반환한다. 다음을 assertion한다.

  ```ts
  expect(result.pools.map((pool) => [pool.stepId, pool.selectableCandidates.length]))
    .toEqual([['meal-step', 2], ['cafe-step', 2]]);
  expect(result.diagnostics.steps.find((step) => step.stepId === 'meal-step')?.fallbackAttemptsRun).toBe(0);
  expect(result.diagnostics.steps.find((step) => step.stepId === 'cafe-step')?.fallbackAttemptsRun).toBe(1);
  expect(result.pools[1].candidates.every((candidate) => candidate.sourceStepId === 'cafe-step')).toBe(true);
  ```

  같은 파일에 `unknown` Meal 후보가 Cafe pool에 들어가거나 Cafe selector에서 선택되는 경우를 기대하는 assertion을 추가한다. `provider-neutral-course-selection.test.ts`에는 Cafe step이 Meal `sourceStepId` candidateId를 고르면 `ProviderNeutralCourseSelectionError`가 발생하는 test를 추가한다.

- [ ] **Step 2: RED를 확인한다.**

  Run:

  ```bash
  npx jest __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/provider-neutral-course-selection.test.ts --runInBand
  ```

  Expected: FAIL. 현재 결과는 flat `candidates`뿐이고, 전체 pool sufficient가 다른 step의 후보 수로 충족된다.

- [ ] **Step 3: `StepCandidatePool`과 step-local discovery runner를 구현한다.**

  `discoverQualifiedPlaces()`의 전역 `discovered` 배열을 여러 step이 공유하지 않게 한다. 새 helper는 하나의 `stepId`에 대해 primary attempts를 모두 실행하고, 그 pool의 qualified/selectable 수가 2개 미만일 때만 fallback attempts를 실행한다. pool 내부에서만 `dedupeNormalizedPlaces()`를 적용한다.

  `provider-neutral-discovery-pipeline.ts`에서 각 step의 `NormalizedPlace`를 `ProviderNeutralCandidate`로 변환할 때 `sourceStepId`를 부여한다. intent가 없으면 `not_required`, required intent가 provider metadata evidence로 확인되면 `matched`, 그렇지 않으면 `unmatched`를 기록한다. `selectableCandidates`는 quality/history 통과 + category compatible/unknown + intent가 `not_required` 또는 `matched`인 후보만 포함한다.

- [ ] **Step 4: 단계별 2개와 sourceStepId test를 통과시킨다.**

  Run:

  ```bash
  npx jest __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/provider-neutral-course-selection.test.ts --runInBand
  ```

  Expected: PASS. fallback은 부족한 Cafe pool에서만 실행되고, sourceStepId가 다른 candidate 선택은 거부된다.

- [ ] **Step 5: 커밋한다.**

  ```bash
  git add supabase/functions/_shared/provider-neutral-course-selection.ts supabase/functions/_shared/provider-neutral-discovery-pipeline.ts supabase/functions/_shared/recommendation-discovery.ts __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/provider-neutral-course-selection.test.ts
  git commit -m "feat: scope provider candidates to request steps"
  ```

### Task 2: Naver와 Kakao 검색 plan에 step ownership을 보존한다

**Files:**
- Modify: `supabase/functions/_shared/recommendation-discovery-strategy.ts`
- Modify: `supabase/functions/recommend-date/index.ts`
- Modify: `supabase/functions/_shared/recommendation-search.ts`
- Modify: `supabase/functions/_shared/recommendation-search-pipeline.ts`
- Test: `__tests__/recommendation-discovery-strategy.test.ts`
- Test: `__tests__/recommend-date-search-server.test.ts`

**Interfaces:**

```ts
type NaverDiscoveryQuery = { stepId: string; query: string };
type StepScopedKakaoSearchPlanItem = KakaoSearchPlanItem & { stepId: string };
```

Naver query builder는 `NaverDiscoveryQuery[]`을 반환한다. Kakao `buildKakaoSearchPlan()`은 같은 category인 두 step도 합치지 않고 각각 `stepId`가 있는 plan item을 만든다. request-wide `'데이트 코스'`/`'주변 데이트 장소'` fallback 검색은 step별 fallback item으로 바꾼다.

- [ ] **Step 1: Naver/Kakao 같은 카테고리 단계 분리 RED test를 작성한다.**

  Naver test에서 두 Cafe step의 결과가 서로 다른 `stepId`를 유지하는지, 태그 step이 `지역 + 태그` query만 쓰는지 확인한다.

  Kakao test에서 `buildKakaoSearchPlan(request(['cafe', 'cafe']))`의 required plan들이 서로 다른 stepId를 가지는지 assertion한다.

  ```ts
  expect(plan.filter((item) => item.category === 'cafe').map((item) => item.stepId))
    .toEqual(['cafe-one', 'cafe-two']);
  ```

  `executeKakaoSearchPlan` fixture는 같은 raw result가 두 plan에 반환될 때 두 provider candidate가 각기 다른 source step pool에서 생성될 수 있음을 검증한다.

- [ ] **Step 2: RED를 확인한다.**

  Run:

  ```bash
  npx jest __tests__/recommendation-discovery-strategy.test.ts __tests__/recommend-date-search-server.test.ts --runInBand
  ```

  Expected: FAIL. 현재 Kakao plan은 `seenCategories`로 두 번째 동일 category step을 제거하며 Naver caller는 query와 step 관계를 버린다.

- [ ] **Step 3: provider별 query 결과를 `StepDiscoveryAttempt`로 연결한다.**

  Naver `naverShadowQueries()` 반환값에 stepId를 포함하고, `recommend-date/index.ts`와 `provider-neutral-replacements/index.ts`가 `{ stepId, run }` 형태를 discovery pipeline에 전달하게 바꾼다.

  Kakao plan/item/evidence에 target stepId를 필수로 전파한다. raw search cache key는 provider query 자체를 계속 사용하되, cache hit 문서를 `stepId`가 달린 개별 attempt 결과로 정규화한다. `searchAndRankRecommendation()`은 새 step pools를 반환하거나 provider-neutral discovery와 공용 adapter를 사용한다. 결과가 request-wide flat array로 합쳐지는 경로를 남기지 않는다.

- [ ] **Step 4: provider별 step ownership test를 통과시킨다.**

  Run:

  ```bash
  npx jest __tests__/recommendation-discovery-strategy.test.ts __tests__/recommend-date-search-server.test.ts --runInBand
  ```

  Expected: PASS. 영어 표시 라벨은 query에 쓰이지 않고, 동일 category step도 독립 pool을 갖는다.

- [ ] **Step 5: 커밋한다.**

  ```bash
  git add supabase/functions/_shared/recommendation-discovery-strategy.ts supabase/functions/recommend-date/index.ts supabase/functions/_shared/recommendation-search.ts supabase/functions/_shared/recommendation-search-pipeline.ts supabase/functions/provider-neutral-replacements/index.ts __tests__/recommendation-discovery-strategy.test.ts __tests__/recommend-date-search-server.test.ts
  git commit -m "feat: preserve step ownership in provider searches"
  ```

### Task 3: 검색어 증거를 제거하고 provider metadata 기반 태그 검증을 강제한다

**Files:**
- Modify: `supabase/functions/_shared/step-intent.ts`
- Modify: `supabase/functions/_shared/provider-neutral-intent.ts`
- Modify: `supabase/functions/_shared/provider-neutral-discovery-pipeline.ts`
- Test: `__tests__/stepIntentResolve.test.ts`
- Test: `__tests__/provider-neutral-discovery-pipeline.test.ts`

**Interfaces:**

```ts
function hasExplicitProviderIntentEvidence(
  place: NormalizedPlace,
  intent: EffectiveStepIntent,
): readonly IntentEvidence[];
```

이 함수는 정규화 상호, provider raw category, dictionary alias/semantic tag만 검사한다. `SearchEvidence.phase === 'step_intent'`, `queryText`, `canonicalTerm`은 반환 근거로 사용하지 않는다.

- [ ] **Step 1: 검색 결과 자체가 태그 증거가 되는 RED test를 작성한다.**

  `삼겹살` step intent query에서 반환되었지만 상호가 `낙성대우리한우소곱창`, provider category가 `음식점 > 한식`인 fixture를 만든다. fixture evidence에 `{ phase: 'step_intent', canonicalTerm: '삼겹살', expansionLevel: 0 }`를 넣어도 아래가 false여야 한다.

  ```ts
  expect(providerNeutralPlaceMatchesStep(place, mealStep, samgyeopsalIntent)).toBe(false);
  ```

  반대로 상호 또는 provider category에 `삼겹살`/dictionary alias가 있는 fixture는 true여야 한다.

- [ ] **Step 2: RED를 확인한다.**

  Run:

  ```bash
  npx jest __tests__/stepIntentResolve.test.ts __tests__/provider-neutral-discovery-pipeline.test.ts --runInBand
  ```

  Expected: FAIL. 현재 `step_intent` level 0 evidence가 검색어 자체로 strict match를 만든다.

- [ ] **Step 3: explicit provider evidence만 intent match로 사용하게 구현한다.**

  `hasStrictIntentEvidence` 또는 해당 provider-neutral matcher에서 search-origin evidence fast path를 제거한다. NormalizedPlace 생성 시 provider raw category와 name에서 얻은 evidence는 보존한다. `qualification.intent`와 pool diagnostics에 `unmatched_intent`를 기록하고, unmatched 후보는 selectable 수에 세지 않는다.

- [ ] **Step 4: 태그 강제 및 unknown 범위 test를 통과시킨다.**

  Run:

  ```bash
  npx jest __tests__/stepIntentResolve.test.ts __tests__/provider-neutral-discovery-pipeline.test.ts --runInBand
  ```

  Expected: PASS. unknown category는 무태그 원래 step에서 selectable일 수 있으나, 검색어만으로 태그 일치가 되지 않는다.

- [ ] **Step 5: 커밋한다.**

  ```bash
  git add supabase/functions/_shared/step-intent.ts supabase/functions/_shared/provider-neutral-intent.ts supabase/functions/_shared/provider-neutral-discovery-pipeline.ts __tests__/stepIntentResolve.test.ts __tests__/provider-neutral-discovery-pipeline.test.ts
  git commit -m "fix: require provider evidence for step intent"
  ```

### Task 4: grouped prompt·선택 검증·추천 handler를 단계별 pool으로 전환한다

**Files:**
- Modify: `supabase/functions/_shared/recommendation-prompt.ts`
- Modify: `supabase/functions/_shared/provider-neutral-course-selection.ts`
- Modify: `supabase/functions/_shared/recommend-date-handler.ts`
- Test: `__tests__/provider-neutral-prompt.test.ts`
- Test: `__tests__/provider-neutral-course-selection.test.ts`
- Test: `__tests__/recommend-date-phase7-handler.test.ts`

**Interfaces:**

```ts
buildProviderNeutralRecommendationPrompt(
  request: RecommendationRequest,
  pools: readonly StepCandidatePool[],
): string;

buildProviderNeutralCourse({
  request,
  pools,
  selection,
  generatedAt,
}: { request: RecommendationRequest; pools: readonly StepCandidatePool[]; selection: unknown; generatedAt: string });
```

`deterministicSelection()`은 각 request step의 `pool.selectableCandidates`만 순회하며, 이미 선택된 place identity 및 `isSamePhysicalPlace`를 제외한다.

- [ ] **Step 1: grouped prompt와 cross-pool AI selection RED test를 작성한다.**

  prompt test에서 JSON의 각 `stepId` group이 그 pool의 candidateId만 포함하는지 확인한다. selection test에서 Meal candidate ID를 Cafe response entry에 넣으면 실패하고, 같은 물리 장소의 서로 다른 pool candidate ID를 두 단계에 넣어도 실패하는 test를 작성한다.

  handler test에는 Meal pool 3개/Cafe pool 1개 fixture를 주고, AI를 호출하지 않으며 `INSUFFICIENT_CANDIDATES`로 끝나는 assertion을 추가한다.

- [ ] **Step 2: RED를 확인한다.**

  Run:

  ```bash
  npx jest __tests__/provider-neutral-prompt.test.ts __tests__/provider-neutral-course-selection.test.ts __tests__/recommend-date-phase7-handler.test.ts --runInBand
  ```

  Expected: FAIL. 현재 prompt와 handler는 flat candidates를 전달하고 selection은 step membership을 검사하지 않는다.

- [ ] **Step 3: 선택 입력을 pool 기반으로 구현한다.**

  prompt에는 `stepCandidateGroups` 배열을 출력하고 평면 candidate 목록을 출력하지 않는다. handler는 모든 pool의 `sufficient`가 true인지 확인한 뒤에만 quota/AI를 호출한다. `buildProviderNeutralCourse()`는 candidate ID lookup 뒤 `candidate.sourceStepId === requested.id` 및 `candidate.qualification.intent !== 'unmatched'`를 검사한다.

  fallback selection과 Kakao link resolver의 selected candidate lookup은 `pools.flatMap(pool => pool.selectableCandidates)`를 사용하되, course step의 candidateId와 동일한 candidate만 선택한다.

- [ ] **Step 4: AI·fallback·부족 처리 회귀를 통과시킨다.**

  Run:

  ```bash
  npx jest __tests__/provider-neutral-prompt.test.ts __tests__/provider-neutral-course-selection.test.ts __tests__/recommend-date-phase7-handler.test.ts __tests__/recommend-date-server.test.ts --runInBand
  ```

  Expected: PASS. AI가 cross-step ID를 반환하면 deterministic fallback도 같은 pool에서만 선택하거나 정확히 후보 부족을 반환한다.

- [ ] **Step 5: 커밋한다.**

  ```bash
  git add supabase/functions/_shared/recommendation-prompt.ts supabase/functions/_shared/provider-neutral-course-selection.ts supabase/functions/_shared/recommend-date-handler.ts __tests__/provider-neutral-prompt.test.ts __tests__/provider-neutral-course-selection.test.ts __tests__/recommend-date-phase7-handler.test.ts __tests__/recommend-date-server.test.ts
  git commit -m "feat: enforce step-scoped course selections"
  ```

### Task 5: snapshot·attestation·RPC를 provider-neutral identity로 이행한다

**Files:**
- Modify: `shared/recommendation/schemas.ts`
- Create: `supabase/migrations/20260829000000_provider_neutral_session_mutations.sql`
- Modify: `docs/supabase-schema.sql`
- Modify: `lib/recommendation-session-repository.ts`
- Test: `__tests__/candidatePoolSnapshotMigration.test.ts`
- Test: `__tests__/recommendationSessionRepository.test.ts`
- Test: `__tests__/mutationFloatPrecisionMigration.test.ts`

**Interfaces:**

```ts
type StepScopedCandidatePoolSnapshot = {
  candidateId: string;
  placeIdentity: { provider: 'kakao' | 'naver'; providerPlaceId: string };
  sourceStepId?: string; // absent only for legacy persisted sessions
  qualification?: CandidateQualificationSnapshot;
};

type CandidateQualificationSnapshot = {
  category: 'compatible' | 'unknown';
  intent: 'not_required' | 'matched' | 'unmatched';
  intentEvidence: readonly { source: 'provider_name' | 'provider_category' | 'dictionary'; term: string }[];
};

type LockedCourseStepInput = {
  stepId: string;
  candidateId: string;
  placeIdentity: { provider: 'kakao' | 'naver'; providerPlaceId: string };
  kakaoPlaceId?: string;
  locked: boolean;
};
```

The migration updates `apply_recommendation_session_mutation(text,text,jsonb)` so lock equality, duplicate checks, replace/add/regenerate persistence, and returned JSON compare/store `{current_place_provider,current_provider_place_id}`. `current_kakao_place_id` remains optional link/legacy data.

- [ ] **Step 1: provider-neutral snapshot and Naver mutation RED tests를 작성한다.**

  schema test에 sourceStepId와 qualification이 있는 new snapshot이 parse되는 assertion, sourceStepId 없는 legacy snapshot도 parse되는 assertion을 추가한다.

  repository test fixture에 Naver identity만 있고 `currentKakaoPlaceId`가 없는 locked step을 넣고, mutation payload가 `placeIdentity`를 포함하며 client validation에서 거부되지 않는 test를 작성한다.

  migration inspection test는 new SQL에 `current_place_provider`, `current_provider_place_id`, `placeIdentity`가 있는지와 `current_kakao_place_id`만의 equality 비교가 남지 않는지 assertion한다.

- [ ] **Step 2: RED를 확인한다.**

  Run:

  ```bash
  npx jest __tests__/candidatePoolSnapshotMigration.test.ts __tests__/recommendationSessionRepository.test.ts __tests__/mutationFloatPrecisionMigration.test.ts --runInBand
  ```

  Expected: FAIL. 현재 lock/mutation payload와 SQL equality가 Kakao ID를 필수로 가정한다.

- [ ] **Step 3: Zod schema와 DB migration을 구현한다.**

  `candidatePoolSnapshotSchema`에 optional read fields를 추가하고, 새 response builder는 항상 sourceStepId/qualification을 보낸다. `candidatePoolSnapshotsSchema`의 physical identity unique rule은 `(sourceStepId, provider, providerPlaceId)` unique rule로 바꿔 다른 step pool의 같은 장소를 저장할 수 있게 한다. legacy snapshot은 sourceStepId가 없으므로 기존 global identity uniqueness로 검증한다. `lockedCourseStepInputSchema`와 course-response lock validation은 `placeIdentity` equality를 canonical으로 쓰며 Kakao ID는 provider가 Kakao일 때 또는 link가 있을 때만 비교한다.

  migration은 `docs/supabase-schema.sql`의 최신 `apply_recommendation_session_mutation` 정의를 기반으로 한 번에 교체한다. lock tuple, persisted lock list, duplicate guard, next-course JSON, `recommendation_course_steps` insert/update/return JSON에 provider identity를 넣는다. migration과 schema mirror의 함수 정의는 byte-for-byte 같은 SQL body를 유지한다.

- [ ] **Step 4: migration을 로컬/원격 안전 검증한다.**

  Run:

  ```bash
  npx jest __tests__/candidatePoolSnapshotMigration.test.ts __tests__/recommendationSessionRepository.test.ts __tests__/mutationFloatPrecisionMigration.test.ts --runInBand
  npm run validate
  ```

  Expected: PASS. legacy Kakao fixture와 Naver-only fixture 모두 repository schema를 통과한다.

- [ ] **Step 5: 커밋한다.**

  ```bash
  git add shared/recommendation/schemas.ts supabase/migrations/20260829000000_provider_neutral_session_mutations.sql docs/supabase-schema.sql lib/recommendation-session-repository.ts __tests__/candidatePoolSnapshotMigration.test.ts __tests__/recommendationSessionRepository.test.ts __tests__/mutationFloatPrecisionMigration.test.ts
  git commit -m "feat: persist provider-neutral session identities"
  ```

### Task 6: 교체·잠금·재생성 UI를 provider identity로 통일한다

**Files:**
- Modify: `supabase/functions/provider-neutral-replacements/index.ts`
- Modify: `app/mode-flow/course-result.tsx`
- Modify: `lib/recommendation-session-repository.ts`
- Test: `__tests__/course-result-screen.test.tsx`
- Test: `__tests__/recommend-date-search-server.test.ts`

**Interfaces:**

```ts
type ProviderReplacementCandidate = {
  candidateId: string;
  sourceStepId: string;
  placeIdentity: { provider: 'naver' | 'kakao'; providerPlaceId: string };
  name: string;
  address: string;
  roadAddress: string;
  latitude: number;
  longitude: number;
};
```

`toLockedStep()` returns `placeIdentity` for every step and no longer throws because `currentKakaoPlaceId` is absent. `excludedPlaceIds` remains legacy-compatible, while provider-neutral discovery exclusion uses a provider identity list derived from current steps.

- [ ] **Step 1: Naver-only editing RED test를 작성한다.**

  `course-result-screen.test.tsx` fixture의 Meal step에서 `currentKakaoPlaceId`를 제거하고 `currentPlaceIdentity: { provider: 'naver', providerPlaceId: 'n-meal' }`를 넣는다. reorder, lock, regenerate, replacement buttons/actions가 early return 하지 않고 repository/function invoke payload에 Naver identity를 포함하는 assertion을 작성한다.

  replacement endpoint test는 target step의 selectable 후보가 1개일 때 Kakao fallback을 호출해 2개가 된 candidate list를 attestation에 `sourceStepId`와 `placeIdentity`로 저장하는 assertion을 추가한다.

- [ ] **Step 2: RED를 확인한다.**

  Run:

  ```bash
  npx jest __tests__/course-result-screen.test.tsx __tests__/recommend-date-search-server.test.ts --runInBand
  ```

  Expected: FAIL. 현재 client has `currentKakaoPlaceId` guards and replacement attestation stores only Naver providerPlaceId.

- [ ] **Step 3: client guards와 replacement attestation을 구현한다.**

  `course-result.tsx`에서 `snapshot.steps.some(step => !step.currentKakaoPlaceId)` early return을 identity-missing guard로 바꾼다. lock/regenerate/add/replace payload는 `placeIdentity`를 보낸다. manual Kakao picker result는 `{ provider: 'kakao', providerPlaceId: kakaoPlaceId }`로 변환한다.

  `provider-neutral-replacements`는 Task 1의 pool discovery를 사용하고 target pool의 selectable 후보만 15개까지 attest한다. apply는 attested candidate의 provider identity를 그대로 `recommendation_course_steps`와 course/cards에 기록하고 optional Kakao link를 임의로 만들지 않는다.

- [ ] **Step 4: Naver 편집과 Kakao 기존 경로를 함께 통과시킨다.**

  Run:

  ```bash
  npx jest __tests__/course-result-screen.test.tsx __tests__/recommend-date-search-server.test.ts __tests__/recommendationSessionRepository.test.ts --runInBand
  npm run validate
  ```

  Expected: PASS. Naver-only session의 편집 요청이 전송되고 legacy Kakao fixture는 동일한 action payload 의미를 유지한다.

- [ ] **Step 5: 커밋한다.**

  ```bash
  git add supabase/functions/provider-neutral-replacements/index.ts app/mode-flow/course-result.tsx lib/recommendation-session-repository.ts __tests__/course-result-screen.test.tsx __tests__/recommend-date-search-server.test.ts
  git commit -m "feat: enable provider-neutral course editing"
  ```

### Task 7: 단계별 telemetry, 통합 회귀, migration/Edge 배포를 검증한다

**Files:**
- Modify: `supabase/functions/recommend-date/index.ts`
- Modify: `supabase/functions/_shared/recommend-date-handler.ts`
- Test: `__tests__/recommend-date-server.test.ts`
- Test: `__tests__/recommend-date-phase7-handler.test.ts`

**Interfaces:**

```ts
type StepDiscoveryTelemetry = {
  stepId: string;
  primaryReturnedCount: number;
  fallbackReturnedCount: number;
  dedupedCount: number;
  rejectedByReason: Record<string, number>;
  selectableCount: number;
  sufficient: boolean;
};
```

`recommend_date_provider_discovery` log includes `steps: StepDiscoveryTelemetry[]`, while retaining aggregate fields during the dashboard-query transition.

- [ ] **Step 1: telemetry와 full-path RED test를 작성한다.**

  server test에서 Meal 2/Cafe 1 primary + Cafe 1 fallback input의 log payload가 `steps` 배열에 정확한 per-step counts를 가지는지 assertion한다. handler integration test에서는 provider-neutral Naver selected course가 sourceStepId snapshot을 포함하고 Kakao link resolution failure에도 200 success가 유지되는 assertion을 추가한다.

- [ ] **Step 2: RED를 확인한다.**

  Run:

  ```bash
  npx jest __tests__/recommend-date-server.test.ts __tests__/recommend-date-phase7-handler.test.ts --runInBand
  ```

  Expected: FAIL. 현재 telemetry는 aggregate category/provider counts만 기록한다.

- [ ] **Step 3: telemetry와 insufficiency error를 구현한다.**

  `recommend-date/index.ts`는 discovery diagnostics의 step records를 그대로 structured log에 포함한다. handler의 `INSUFFICIENT_CANDIDATES` response metadata에는 `{ stepId, selectableCount }[]`를 내부 진단/attestation에 넣되 사용자 키워드 원문은 넣지 않는다. link resolver 실패는 기존처럼 non-fatal로 둔다.

- [ ] **Step 4: 전체 관련 회귀를 실행한다.**

  Run:

  ```bash
  npx jest __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/provider-neutral-course-selection.test.ts __tests__/provider-neutral-prompt.test.ts __tests__/recommendation-discovery-strategy.test.ts __tests__/recommend-date-search-server.test.ts __tests__/recommend-date-server.test.ts __tests__/recommend-date-phase7-handler.test.ts __tests__/candidatePoolSnapshotMigration.test.ts __tests__/recommendationSessionRepository.test.ts __tests__/course-result-screen.test.tsx --runInBand
  npm run validate
  git diff --check
  ```

  Expected: PASS with no TypeScript errors or whitespace errors.

- [ ] **Step 5: migration과 Edge를 배포하고 live smoke test를 수행한다.**

  Apply `supabase/migrations/20260829000000_provider_neutral_session_mutations.sql` through the repository’s approved Supabase migration workflow, then deploy:

  ```bash
  supabase functions deploy recommend-date --project-ref wqjguifsmtblgrhdfnji
  supabase functions deploy provider-neutral-replacements --project-ref wqjguifsmtblgrhdfnji
  ```

  Run four live requests: 무키워드 Meal→Cafe, `삼겹살` Meal→Cafe, Meal→Drinks, `와인바` Meal→Drinks. For each request, confirm every step has at least 2 selectable candidates in telemetry; trigger a Naver-only replacement and lock/regenerate once; confirm no `currentKakaoPlaceId` early-return behavior and no cross-step candidate selection.

- [ ] **Step 6: 커밋한다.**

  ```bash
  git add supabase/functions/recommend-date/index.ts supabase/functions/_shared/recommend-date-handler.ts __tests__/recommend-date-server.test.ts __tests__/recommend-date-phase7-handler.test.ts
  git commit -m "feat: log step-scoped discovery outcomes"
  ```
