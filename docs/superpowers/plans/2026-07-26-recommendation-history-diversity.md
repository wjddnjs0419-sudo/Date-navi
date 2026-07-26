# 추천 이력·다양성 기반 품질 보정 Implementation Plan

> **For agentic workers:** 이 계획은 `superpowers:subagent-driven-development`의 일반적인 task-per-agent 방식 대신, **큰 Phase 하나를 하나의 구현 서브에이전트가 끝까지 수행하고 그 Phase가 끝날 때만 독립 코드리뷰를 수행**한다. 작은 task별 서브에이전트는 사용하지 않는다. 각 Phase의 리뷰가 승인되기 전 다음 Phase를 시작하지 않는다.

**Goal:** 기존 DB 데이터만 사용해 최근 동일 지역의 장소 반복을 줄이고, 교체 후보의 동선·이력 판단 근거를 정확히 알리며, 기존 방식(Control)과 개선 방식(Treatment)을 동시 A/B 검증 가능하게 만든다.

**Architecture:** Edge가 인증된 사용자 또는 현재 커플 범위의 이력을 `RecommendationHistoryContext`라는 순수 계약으로 정규화한다. 순수 랭커는 hard constraint를 먼저 지키고, Treatment에서만 최근 2개 세션 장소를 우선 제외한 뒤 후보가 부족할 때 오래된 노출부터 감점 재도입한다. 실험 arm은 서버가 안정적으로 배정하고 세션 `metadata`에 보존하여, 교체 후보도 최초 생성 arm을 그대로 사용한다.

**Tech Stack:** TypeScript, Zod, Jest, Supabase Edge Functions (Deno), Supabase Postgres/RLS, Expo/React Native i18n.

**Design source:** [2026-07-26-recommendation-history-diversity-design.md](../specs/2026-07-26-recommendation-history-diversity-design.md)

## Global Constraints

- 신규 외부 API와 신규 DB 테이블을 추가하지 않는다.
- 이력은 Edge가 인증 정보로 직접 읽는다. 클라이언트는 과거 장소 ID, 행동 점수, arm을 보낼 수 없다.
- 연결된 사용자는 현재 `couple_id` 세션만 공동 이력으로, 미연결/조회 실패 시에는 현재 `owner_user_id` 세션만 읽는다. 다른 커플·사용자는 절대 읽지 않는다.
- 동일 지역은 과거 `original_request.location`과 현재 좌표의 직선거리 2km 이하이며, 파싱 실패 row는 무시하고 요청 전체를 실패시키지 않는다.
- 현재 코스 ID, 명시적 제외, 직접 지정(pin), 카테고리, required step intent, 도보 제약은 history보다 항상 우선한다.
- 최근 2개 세션은 우선 제외한다. 충족 가능한 코스를 만들 수 없을 때에만 오래된 노출부터 재도입하고 `diversity: -30`, 선택 시 정확히 한 번의 `recentPlaceCooldown`을 반환한다.
- 교체/삭제의 최근 90일 신호는 `-30`, 행동 총합은 `-40...+10`으로 clamp한다. 피드백·pair 가점은 설계 문서의 의미/공개 임계치에 맞을 때만 적용한다.
- `place_pair_stats`는 `unique_couple_count >= 10` 및 `confirmed_selection_count >= 15`일 때만 쓴다.
- history 조회 또는 일부 보조 조회 실패는 요청 실패가 아니라 빈 history/0점의 기존 랭킹 폴백이다. 로그에는 ID·원본 자연어를 남기지 않는다.
- 기존 `recommendation_sessions.metadata` JSONB에는 optional 필드만 추가해 구 세션을 읽을 수 있게 한다.
- DB 인덱스는 먼저 운영 쿼리의 `EXPLAIN (ANALYZE, BUFFERS)`로 병목이 입증될 때만 별도 승인 계획으로 제안한다.
- 모든 구현 task는 TDD로 RED → GREEN을 확인한다. Phase 종료 때 대상 Jest, 전체 Jest, `npm run validate`, `git diff --check`, Deno import/type check를 실행한다.
- `docs/app-store-review-pack.md`의 이미 staged 된 변경은 이 작업과 무관하므로 건드리거나 stage/commit하지 않는다.

## File Structure and Responsibilities

| Path | Change | Responsibility |
|---|---|---|
| `shared/recommendation/recommendation-history.ts` | Create | History context, empty context, pure diversity/behavior/pair helpers, and cooldown-policy types. |
| `shared/recommendation/history-experiment.ts` | Create in Phase 4 | Stable Control/Treatment assignment and effective-variant fallback without client authority. |
| `shared/recommendation/schemas.ts` | Modify | Strict but backward-compatible response metadata schema for history experiment fields. |
| `supabase/functions/_shared/recommendation-history.ts` | Create | Service-role ownership-scoped history loader; malformed-row isolation; query status counters. |
| `supabase/functions/_shared/recommendation-ranking.ts` | Modify | History-aware candidate scores and cooldown reintroduction ordering. |
| `supabase/functions/_shared/recommendation-search-pipeline.ts` | Modify | Inject history policy into search/ranking without changing Kakao retrieval/caching. |
| `supabase/functions/_shared/recommendation-course-selection.ts` | Modify | Candidate-pool feasibility and deterministic route pair bonus; append cooldown relaxation only when selected. |
| `supabase/functions/_shared/recommend-date-handler.ts` | Modify | Load/use effective arm, keep existing fallback/error contracts, emit response metadata. |
| `supabase/functions/recommend-date/index.ts` | Modify | Authenticate, construct service-role history dependency, emit de-identified terminal structured logs. |
| `shared/recommendation/replacement-candidates.ts` | Modify | Apply history score after existing replacement hard filters; return stable display ranks. |
| `supabase/functions/replacement-candidates/index.ts` | Modify | Reuse persisted arm, load same scoped context, log aggregate replacement outcomes. |
| `app/mode-flow/course-result.tsx` | Modify | Render Top 3 as an explicit route-fit group, show cooldown notice through existing relaxations. |
| `locales/ko/modeFlow.json`, `locales/en/modeFlow.json` | Modify | `동선 추천`/`Route fit` and approved explanatory copy. |
| `supabase/migrations/20260726100000_recommendation_history_ab_metrics.sql` | Create only in Phase 4 | Preserve a server-attested replacement display rank in the existing event path; no table creation. |
| `docs/supabase-schema.sql` | Modify only if Phase 4 migration is approved | Keep canonical schema aligned with the applied event-metadata migration. |
| `scripts/eval-recommendation-history-ab.ts` | Create | Reproducible arm-level A/B report from existing sessions/steps/events/metadata plus exported terminal logs. |
| `__tests__/recommendation-history*.test.ts`, existing recommendation/replacement tests | Create/Modify | Pure policy, loader, handler, schema, UI, migration and experiment regressions. |

## Execution Model and Review Gates

1. Before a Phase, controller prepares a brief containing only that Phase’s tasks and its accepted interfaces. One implementation subagent owns all listed small tasks sequentially, commits atomically, and writes a Phase report.
2. After implementation, a fresh reviewer subagent checks the Phase diff against this plan and independently looks for correctness, security, privacy, compatibility, and test gaps. It returns explicit **spec-compliance** and **code-quality** verdicts.
3. Findings are fixed in the same Phase, then re-reviewed. Only a clean Phase review unlocks the next one. No small task receives its own agent or review cycle.
4. The final Phase includes one broad end-to-end review across all Phases and a release/rollback readiness review.

---

## Phase 1: Pure History Policy and New-plan Ranking Core

**Outcome:** A DB-free, deterministic policy can score known candidate/history fixtures, preserve all existing hard rules, and describe a real cooldown relaxation without any Edge wiring yet.

**Files:**
- Create: `shared/recommendation/recommendation-history.ts`
- Modify: `supabase/functions/_shared/recommendation-ranking.ts`, `supabase/functions/_shared/recommendation-search-pipeline.ts`, `supabase/functions/_shared/recommendation-course-selection.ts`
- Create: `__tests__/recommendation-history.test.ts`
- Modify: `__tests__/recommend-date-ranking-server.test.ts`, `__tests__/recommend-date-course-selection.test.ts`

**Produces:**

```ts
export type RecommendationHistoryContext = {
  recentHardPlaceIds: string[];
  recentExposure: Record<string, { lastSeenAt: string; sessionDistance: number }>;
  negativeActions: Record<string, { replacedCount: number; deletedCount: number; lastNegativeAt: string }>;
  feedback: Record<string, { revisit: boolean; quiet: number; noisy: number; photos: number; crowded: number }>;
  qualifiedPairs: Array<{ sourceKakaoPlaceId: string; targetKakaoPlaceId: string }>;
};

export const EMPTY_RECOMMENDATION_HISTORY: RecommendationHistoryContext;
export type HistoryPolicyResult = {
  candidates: PlaceCandidate[];
  recentHistoryExcludedCount: number;
  reintroducedPlaceIds: string[];
};
```

### Task 1.1: Lock the policy tables in failing pure tests

- [ ] Add fixtures that contain: two recent same-area IDs, a 3rd–5th session ID, an older-in-90-days ID, one replaced ID, feedback tags, and one qualified pair.
- [ ] First assert the exact diversity rows: hard candidates absent in the primary pool; distance 3–5 is `-15`; distance 6+ / 90-day exposure is `-5`; an unexposed candidate is `0`.
- [ ] Assert behavior independently: replace/delete is `-30`; matching quiet/revisit/photos and mismatching noisy/crowded produce the specified values; total is never below `-40` or above `10`.
- [ ] Assert pair helper returns `+3` per matching neighbour and at most `+6`, with no score from an unqualified pair.
- [ ] Run: `npx jest __tests__/recommendation-history.test.ts --runInBand`
- [ ] Expected RED: the history module and policy exports do not exist.

### Task 1.2: Implement the pure contract and score helpers

- [ ] Create `shared/recommendation/recommendation-history.ts` with the exact context above, an immutable empty context, `diversityScoreFor`, `behaviorScoreFor`, `pairBonusForAdjacentPlaces`, and a stable comparator.
- [ ] Make score helpers consume only normalized IDs, timestamps/session distances, structured preferences, and qualified pairs. They must not receive DB rows or raw free text.
- [ ] Keep history semantics explicit: `recentHardPlaceIds` marks only recent sessions 1–2; `sessionDistance` starts at 1; a negative action only counts if its latest event is within 90 days.
- [ ] Run the focused test and make it GREEN.

### Task 1.3: Apply primary exclusion and feasibility-gated cooldown

- [ ] Extend `rankPlaceCandidates` with an optional history policy argument. Its default must be `EMPTY_RECOMMENDATION_HISTORY`, so Control/current callers return byte-for-byte equivalent candidate ordering and score breakdowns.
- [ ] Build the first pool after all existing hard filters and pin preservation, excluding only `recentHardPlaceIds` for unpinned candidates.
- [ ] Add a pure feasibility check that finds a distinct candidate assignment for every request step while retaining category, required-intent, pin, and requested walking constraints. It must not use soft history score to decide feasibility.
- [ ] If the primary pool is infeasible, reintroduce hard-excluded IDs by oldest exposure first (`sessionDistance` descending); attach `diversity: -30` only to each reintroduced candidate. Stop as soon as the pool is feasible.
- [ ] Do not reuse the existing `diversityRecall: 5` as a history signal. Keep category recall as a separately named score adjustment or remove it from the diversity component so exact history assertions remain meaningful.
- [ ] Run the ranking/course-selection focus tests and make them GREEN.

### Task 1.4: Make selection and relaxation reflect actual use

- [ ] Pass the policy result through the search pipeline to both AI prompt candidates and deterministic fallback; AI receives final candidate scores/exclusions, never the raw history context.
- [ ] Add qualified-pair bonus only when evaluating adjacent candidates in deterministic route selection. It must not bypass walking, category, required intent, uniqueness, or pin validation.
- [ ] Append exactly one of these `recentPlaceCooldown` values to `course.relaxedConstraints` only when the final selected course contains an actual reintroduced, non-pin place: Korean `새 장소 후보가 부족해 최근 추천 장소를 일부 다시 포함했어요.`; English `There were not enough new place options, so we included some recently recommended places.` Add it once even if multiple steps reuse cooldown.
- [ ] Assert: direct pin in recent history remains selected without a cooldown; a feasible fresh pool produces none; an infeasible fixture produces exactly one cooldown and a `-30` selected candidate.

### Phase 1 validation and review gate

- [ ] Run focused policy/ranking/course tests, `npx jest --runInBand`, `npm run validate`, `git diff --check`.
- [ ] Run the Deno import/type check used by this repository for `_shared` modules.
- [ ] Dispatch one independent **Phase 1 reviewer**. It verifies the score table, oldest-first relaxation, all hard-constraint regressions, exact cooldown semantics, and Control compatibility. Resolve all load-bearing findings and re-review.

---

## Phase 2: Server-owned History Loader, Response Contract, and New-plan Integration

**Outcome:** `recommend-date` securely loads only permitted history, applies Treatment without leaking it to clients, and records non-sensitive observability metadata while preserving no-history behavior on all loader failures.

**Depends on:** Phase 1 review approval.

**Files:**
- Create: `supabase/functions/_shared/recommendation-history.ts`, `__tests__/recommendation-history-loader.test.ts`, `__tests__/recommendation-history-handler.test.ts`
- Modify: `shared/recommendation/schemas.ts`, `supabase/functions/_shared/recommend-date-handler.ts`, `supabase/functions/recommend-date/index.ts`, `supabase/functions/_shared/recommendation-search-pipeline.ts`
- Modify as needed: `__tests__/recommend-date-server.test.ts`, `__tests__/recommend-date-*-server.test.ts`, `__tests__/recommendationContracts.test.ts`

**Consumes:** Phase 1’s `RecommendationHistoryContext` and history policy result.

**Produces:**

```ts
type RecommendationHistoryLoad = {
  context: RecommendationHistoryContext;
  status: 'loaded' | 'failed';
  recentHistoryExcludedCount: number;
};

type HistoryExperimentMetadata = {
  name: 'history-diversity-v1';
  assignedVariant: 'control' | 'treatment';
  effectiveVariant: 'control' | 'treatment';
  assignmentUnit: 'couple' | 'user';
  historyLoad: 'not_attempted' | 'loaded' | 'failed';
  fallbackReason?: 'history_load_failed';
  recentHistoryExcludedCount: number;
  recentCooldownRelaxed: boolean;
};
```

### Task 2.1: Add backward-compatible strict metadata tests and schema

- [ ] Write failing schema tests for a valid response carrying optional `metadata.historyExperiment`, and a legacy response without it.
- [ ] Reject invalid variants, raw IDs, unknown keys, negative counts, or a `history_load_failed` fallback paired with effective Treatment.
- [ ] Extend `recommendDateMetadataSchema` with an optional strict `historyExperiment` object only; do not add request fields or client-controlled arm fields.
- [ ] Run: `npx jest __tests__/recommendationContracts.test.ts --runInBand`; make it GREEN.

### Task 2.2: Write ownership, same-area, and malformed-row loader tests first

- [ ] Mock a service-role query adapter and verify a connected user reads sessions whose `couple_id` equals the current couple, including the partner-owned rows; no other couple is queried.
- [ ] Verify unlinked profile/couple lookup failure falls back to `owner_user_id = authenticatedUserId` rather than broadening access.
- [ ] Verify session ordering uses `created_at`, location source is `original_request.location`, only 2km-or-closer rows generate exposure, and the active `sessionId` is excluded during regeneration.
- [ ] Verify malformed JSON location, malformed step/event/feedback row, and one failed auxiliary query omit only that evidence. A top-level history loader error returns `EMPTY_RECOMMENDATION_HISTORY` with `status: 'failed'`.
- [ ] Verify feedback is scoped to the authenticated owner and pair stats require both public thresholds.
- [ ] Run the loader test to RED before creating the loader.

### Task 2.3: Implement batched, scoped history normalization

- [ ] Query profile/couple ownership first, then scoped `recommendation_sessions`, scoped `recommendation_course_steps`, `recommendation_step_events`, authenticated-owner `place_feedback`, and threshold-qualified `place_pair_stats` for candidate-relevant IDs.
- [ ] Normalize session exposures from original course step IDs; derive replace/delete from `previous_kakao_place_id`, feedback tags from valid rows, and de-duplicate qualified pairs deterministically.
- [ ] Catch auxiliary failures independently so feedback/pairs yield zero contribution without discarding valid exposure/action data. Emit only aggregate loader outcome/counter logs.
- [ ] Document and run the exact production `EXPLAIN (ANALYZE, BUFFERS)` statements for owner/couple session, step/event, feedback, and pair queries. If plans use existing indexes accept them; if not, stop and request separate migration approval.
- [ ] Make loader tests GREEN.

### Task 2.4: Wire Treatment into `recommend-date` without altering current semantics

- [ ] Add a handler dependency that receives the authenticated user and current request after validation; use it only after auth succeeds.
- [ ] With effective Control, pass the empty context and assert the candidate array, selected course, and legacy metadata remain equivalent to the pre-change fixture.
- [ ] With effective Treatment, pass loader context into the Phase 1 pipeline, include only aggregate history metadata in the response, and preserve existing AI timeout/invalid/attestation error contracts.
- [ ] On loader failure, use empty context, mark `historyLoad: 'failed'`, set effective Control, and return a successful recommendation whenever the old path would succeed.
- [ ] In Edge index, create a service-role loader after authentication and emit one terminal `recommend_date_history_outcome` structured log for every terminal result with variant, outcome/error code, latency, excluded count, cooldown flag, and no IDs/text.
- [ ] Run handler/integration tests GREEN.

### Phase 2 validation and review gate

- [ ] Run loader, handler, contract, and all recommend-date test suites; run `npx jest --runInBand`, `npm run validate`, `git diff --check`, and Deno checks for both changed Edge import graphs.
- [ ] Dispatch one independent **Phase 2 reviewer**. It must review RLS/service-role scope, no client authority over history, failed-loader fallback, no raw-data logs, schema compatibility, query bounds, and current-path regression. Resolve and re-review before Phase 3.

---

## Phase 3: Replacement Parity and User-facing Route-fit Copy

**Outcome:** Replacement candidates receive the same history policy after their existing hard filters, Top 3 are accurately labelled, and the result screen clearly announces any forced recent-place reuse from new-plan generation.

**Depends on:** Phase 2 review approval.

**Files:**
- Modify: `shared/recommendation/replacement-candidates.ts`, `supabase/functions/replacement-candidates/index.ts`, `app/mode-flow/course-result.tsx`, `locales/ko/modeFlow.json`, `locales/en/modeFlow.json`
- Modify/Create tests: `__tests__/replacementCandidates.test.ts`, `__tests__/replacementCandidatesWiring.test.ts`, `__tests__/course-result-screen.test.tsx`, `__tests__/recommendation-card-i18n.test.ts`

**Consumes:** persisted optional `metadata.historyExperiment`, Phase 1 scoring helpers, Phase 2 loader.

### Task 3.1: Establish replacement history-ranking regressions

- [ ] Add failing tests showing current-course IDs are still absolutely excluded before history calculation; category mismatch and walking-limit failures remain absent from the pool.
- [ ] Add fixtures where two candidates have the same route context score but one has a recent delete/replace and ranks lower; matching feedback/pair evidence changes order only within the allowed behavior bounds.
- [ ] Assert stable order uses `contextScore` then Kakao ID and the returned candidates contain deterministic `displayRank` 1–15.
- [ ] Assert existing fixtures with empty history produce exactly the current `top`, `additional`, and 30-item curation pool.

### Task 3.2: Implement parity after hard filters

- [ ] Extend `rankReplacementCandidates` input with history context and structured current preferences; retain defaults for callers/tests without history.
- [ ] Keep this sequence fixed: category-compatible input → current course absolute exclusion → walking filter → candidate base/context score → diversity/behavior/pair score → deterministic sort → Top 3 / additional 4–15.
- [ ] Never turn recent history into a replacement absolute exclusion: it is a score policy here, because the replacement list must remain available in sparse areas.
- [ ] Make all selected history scores inspectable in test-only candidate breakdowns, but do not expose feedback details or history identities in the HTTP response.
- [ ] Run the focused replacement suite GREEN.

### Task 3.3: Reuse initial arm and add replacement observability

- [ ] Load the session `metadata` along with request data. If a valid stored experiment arm exists, reuse it; never rehash in `replacement-candidates`.
- [ ] For legacy sessions or experiment-off mode, use effective Control/empty history. For stored Treatment, load scoped context with the current session excluded; loader failure becomes effective Control and is logged.
- [ ] Return only `targetStepId`, `top`, `additional`, and safe display ranks. Emit `replacement_candidates_served` structured fields: variant/effective variant, pool size, top-three repeat count, empty flag, latency, loader status—never IDs or request text.
- [ ] Add wiring tests for arm inheritance, no client-provided variant, and loader-failure response availability.

### Task 3.4: Correct the UI grouping and copy

- [ ] Change the screen to render `top` and `additional` as two explicit groups rather than deriving Top 3 solely from flattened `index < 3`; keep the 15-item limit and selection flow unchanged.
- [ ] Set Korean strings exactly:

```json
"topPick": "동선 추천",
"replacementNotice": "현재 코스 동선과 최근 추천 이력을 반영한 상위 3개예요. 외부 후기·지도는 직접 확인해주세요."
```

- [ ] Set English strings exactly:

```json
"topPick": "Route fit",
"replacementNotice": "These top three consider the current route and your recent recommendations. Check external reviews and maps directly."
```

- [ ] Add the approved bilingual `recentPlaceCooldown` reason to the course-selection builder and assert the existing result-screen relaxed-constraint rendering displays it without a new special-case component.
- [ ] Add ko/en render tests including long English text and assert no rating/review-quality claim is introduced.

### Phase 3 validation and review gate

- [ ] Run focused replacement/UI/i18n tests, then `npx jest --runInBand`, `npm run validate`, `git diff --check`, and changed Edge Deno checks.
- [ ] Dispatch one independent **Phase 3 reviewer**. It verifies replacement hard-filter order, stable Top 3 semantics, stored-arm inheritance, privacy of responses/logs, exact locale copy, and React Native rendering behaviour. Fix and re-review before Phase 4.

---

## Phase 4: Concurrent A/B Experiment, Server-attested Metrics, QA, and Rollback

**Outcome:** Control and Treatment run concurrently with a reproducible, privacy-safe evaluation. Results can compare all approved metrics without new data tables, and the experiment can be disabled immediately.

**Depends on:** Phase 3 review approval.

**Files:**
- Create: `shared/recommendation/history-experiment.ts`, `scripts/eval-recommendation-history-ab.ts`, `__tests__/recommendation-history-experiment.test.ts`, `__tests__/eval-recommendation-history-ab.test.ts`
- Modify: `shared/recommendation/schemas.ts`, `supabase/functions/recommend-date/index.ts`, `supabase/functions/_shared/recommend-date-handler.ts`, `supabase/functions/replacement-candidates/index.ts`, `supabase/functions/_shared/recommendation-history.ts`
- Create: `supabase/migrations/20260726100000_recommendation_history_ab_metrics.sql`
- Modify: `docs/supabase-schema.sql`, `__tests__/recommendationLearningMigration.test.ts`, and relevant session/mutation tests

### Task 4.1: Make server-side assignment stable and reversible

- [ ] Write failing tests for a stable pure assignment function:

```ts
type HistoryExperimentMode = 'off' | 'ab50' | 'treatment';
resolveHistoryExperiment({
  mode: 'ab50',
  coupleId: 'couple-id',
  userId: 'user-id',
  historyLoadStatus: 'loaded',
});
```

- [ ] Assert connected pairs hash `history-diversity-v1:${coupleId}`, unlinked users hash `history-diversity-v1:${userId}`, and no user identifier is returned in metadata/log payload.
- [ ] Implement deterministic stable hashing with `RECOMMENDATION_HISTORY_EXPERIMENT=off|ab50|treatment`. `off` means Control and no loader attempt; `treatment` means all eligible requests use Treatment; `ab50` is 50/50.
- [ ] Persist assigned/effective arm, assignment unit, loader state, excluded count, and cooldown flag using optional `metadata.historyExperiment`. A Treatment loader failure must become effective Control with `fallbackReason: 'history_load_failed'`.
- [ ] Ensure a regenerated session retains its original stored arm. Replacement must use the stored arm rather than assignment recalculation.

### Task 4.2: Close the server-attested replacement-pick measurement gap

- [ ] Write a failing migration/RPC test proving a `place_replaced` event receives `candidate_rank` only from server-attested replacement data, never a client-provided rank.
- [ ] Extend the replacement candidate response/attestation data to carry server-computed `displayRank`; when a user chooses one, `recommend-date` validates the candidate against the same server search/ranking result and attaches only the verified rank to the staged response.
- [ ] Add the minimal migration that propagates this attested value through `apply_recommendation_session_mutation`’s transaction-local event data to `recommendation_step_events.candidate_rank`. Do not create tables or permit arbitrary event metadata writes.
- [ ] Update canonical `docs/supabase-schema.sql` in the same commit and assert migration tests protect the no-client-rank rule.

### Task 4.3: Produce reproducible analysis and pre-register guardrails

- [ ] Write deterministic fixture tests for `scripts/eval-recommendation-history-ab.ts`: same-area repeat uses `original_kakao_place_id`, current session is compared with the two most recent scoped ≤2km historical sessions, and output is aggregated by assignment unit before any overall average.
- [ ] Report these metrics separately for assigned arm (ITT) and effective arm, while reporting loader fallback rate:

| Metric | Source |
|---|---|
| `same_area_repeat_rate` | tagged sessions + original step IDs |
| `course_generation_failure_rate` | terminal recommend-date structured logs |
| `recent_history_excluded_count` | session metadata |
| `recent_cooldown_relaxed_rate` | session metadata |
| `replacement_top3_repeat_rate` | replacement structured logs |
| `replacement_pick_rate` | server-attested `place_replaced.candidate_rank` |
| `replacement_empty_rate` | replacement structured logs |

- [ ] Include fixture baseline output and a documented QA matrix: same-area repeat, other-area control, sparse-area cooldown, direct pin, couple partner history, replacement Top 3, empty replacement, loader failure.
- [ ] Before enabling `ab50`, record the agreed minimum sample/observation window, Treatment failure-rate non-inferiority threshold, 95% confidence-interval method (cluster bootstrap by assignment unit), and automatic pause triggers. These require user approval because they define release risk; do not invent numeric thresholds.

### Task 4.4: Deploy, verify, evaluate, and preserve rollback

- [ ] Deploy `recommend-date`, verify deployed source equals disk source, then deploy and verify `replacement-candidates`.
- [ ] Apply the approved minimal migration only after its SQL test and canonical schema update pass. Verify `candidate_rank` is stored from an actual server-attested replacement selection.
- [ ] Ship the app build carrying the copy update; perform the QA matrix on device.
- [ ] Start `ab50` only after the pre-registered guardrails are approved. Run the analysis script at the agreed window; report estimate, confidence interval, denominators, fallback rate, and guardrails—never a conclusion from raw request counts alone.
- [ ] Roll back by setting `RECOMMENDATION_HISTORY_EXPERIMENT=off` first. If an Edge defect remains, redeploy the previous verified two functions. No data rollback is required because the schema adds no table and metadata is additive.

### Phase 4 validation and final review gate

- [ ] Run experiment, migration, evaluation-script, session/mutation, full Jest, `npm run validate`, `git diff --check`, Deno checks, and the documented QA fixture run.
- [ ] Dispatch one independent **Phase 4 reviewer** for experiment integrity, privacy, arm persistence, event attestation, migration safety, analysis correctness, deployment order, and rollback.
- [ ] Dispatch one final whole-change reviewer after Phase 4 is clean. Resolve material findings, re-run all validation, then update `RESULT.md` and reduce this `PLAN.md` entry to one `[Done]` line.

## Spec Coverage Self-review

| Design requirement | Planned phase/task |
|---|---|
| Same-area recent repeat reduction and controlled cooldown | 1.3–1.4, 2.4 |
| Scoped couple/user ownership and malformed-query fallback | 2.2–2.3 |
| Diversity/behavior/pair score table and clamps | 1.1–1.4 |
| Hard constraints and pin-wins preservation | 1.3–1.4, Phase 2 review |
| Replacement score parity and precise Top 3 claim | 3.1–3.4 |
| ko/en copy and cooldown notice | 3.4 |
| No new table/API and safe observability | Global constraints, 2.3–2.4, 4.1 |
| All seven success metrics and old-vs-new comparison | 4.1–4.4 |
| Candidate-rank measurement integrity | 4.2 |
| Deployment and rollback | 4.4 |

No `TBD`/placeholder implementation step remains. Numeric A/B guardrails are intentionally a release approval input rather than a fabricated implementation value.
