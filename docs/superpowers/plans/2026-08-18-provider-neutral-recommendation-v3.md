# Provider-neutral Recommendation V3 Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** Introduce a provider-neutral recommendation boundary that supports Naver-first discovery, Kakao fallback, a non-relaxable Quality Gate, and safe staged rollout without breaking existing Kakao-backed sessions.

**Architecture:** A discovery/sufficiency controller owns bounded attempts and only passes fully qualified candidates to context ranking. Provider adapters normalize their own wire formats into a shared request-scoped place model; `provider + providerPlaceId` remains the stable identity, while cross-provider matching is temporary deduplication only.

**Tech Stack:** Expo React Native, TypeScript, Supabase Edge Functions/Deno, Supabase Postgres, Kakao Local API, NAVER Local Search API, Anthropic Claude Haiku, Jest.

## Global Constraints

- Preserve existing Kakao-only behavior behind a runtime strategy until its regression suite passes.
- Naver is primary discovery; Kakao is only a bounded geographic fallback, never an unconditional parallel request.
- Hard eligibility and Quality Gate thresholds never relax to fill a result count.
- If all attempts remain insufficient, return fewer qualified candidates with explicit metadata.
- Keep provider-scoped identity: `{ provider: 'naver' | 'kakao', providerPlaceId }`; do not create an internal canonical entity in this plan.
- Cross-provider name/coordinate/address matching is request-scoped duplicate control only; it must not write permanent merges.
- Keep existing `kakaoPlaceId` persistence/session/history/ledger contracts operational throughout early phases.
- Do not expose provider credentials to the client; do not log free-form user text unnecessarily.
- No commit or deployment is part of this plan.

---

## Target File Structure

| File | Responsibility |
|---|---|
| `supabase/functions/_shared/place-provider.ts` | Provider-scoped identity, raw provider facts, normalized place, search plan contracts. |
| `supabase/functions/_shared/place-quality.ts` | Hard PASS/FAIL Quality Gate and structured rejection reasons. |
| `supabase/functions/_shared/place-dedup.ts` | Request-scoped same-provider and cross-provider duplicate guard. |
| `supabase/functions/_shared/recommendation-discovery.ts` | Bounded Naver-first attempts, sufficiency evaluation, Kakao fallback orchestration. |
| `supabase/functions/_shared/providers/kakao-place-provider.ts` | Existing Kakao request translation, cache, response normalization. |
| `supabase/functions/_shared/providers/naver-place-provider.ts` | NAVER request translation, `sort=comment`, response normalization, provider-local cache. |
| `supabase/functions/_shared/recommendation-ranking.ts` | Context-only ranking of Quality Gate pass candidates. |
| `supabase/functions/_shared/recommendation-search-pipeline.ts` | Compatibility facade while discovery replaces the current direct Kakao flow. |
| `shared/recommendation/contracts.ts` / `schemas.ts` | Provider-scoped selected-place contract, rollout metadata, backwards-compatible Kakao fields. |
| `supabase/migrations/*` | Additive provider identity columns/indexes and compatibility views/RPC updates only after shadow validation. |

### Task 1: Establish provider-neutral contracts and compatibility fixtures

**Files:**
- Create: `supabase/functions/_shared/place-provider.ts`
- Modify: `supabase/functions/_shared/recommendation-search.ts`
- Test: `__tests__/place-provider.test.ts`

**Consumes:** Existing `EvidencedKakaoPlace` and `RecommendationLocation`.

**Produces:** `PlaceProvider`, `ProviderPlaceIdentity`, `NormalizedPlace`, `SemanticSearchPlan`, `SearchAttempt`, and `normalizeKakaoPlace()`.

- [ ] Write failing fixtures proving a Kakao place becomes a normalized place with `identity = { provider: 'kakao', providerPlaceId: kakaoPlaceId }`, preserved category/address/coordinates/map URL, and `legacy.kakaoPlaceId`.
- [ ] Run `npx jest __tests__/place-provider.test.ts --runInBand`; expect missing-module failure.
- [ ] Implement only the contracts and Kakao normalizer; do not change the live search path.
- [ ] Re-run the focused test and `npm run validate`.

### Task 2: Add request-scoped duplicate guard

**Files:**
- Create: `supabase/functions/_shared/place-dedup.ts`
- Test: `__tests__/place-dedup.test.ts`

**Consumes:** `NormalizedPlace` from Task 1.

**Produces:** `dedupeNormalizedPlaces(places): { places, suppressed }` with a structured suppression reason.

- [ ] Write failing tests for same-provider ID dedupe, high-confidence cross-provider name+road-address+coordinate proximity suppression, and no suppression when address/coordinates are ambiguous.
- [ ] Run `npx jest __tests__/place-dedup.test.ts --runInBand`; expect failure.
- [ ] Implement normalized text comparison, a documented bounded coordinate threshold, and deterministic representative selection preferring stronger provider evidence.
- [ ] Re-run the focused test and `npm run validate`.

### Task 3: Separate hard eligibility from Quality Gate

**Files:**
- Create: `supabase/functions/_shared/place-quality.ts`
- Modify: `supabase/functions/_shared/recommendation-category.ts`
- Test: `__tests__/place-quality.test.ts`

**Consumes:** Normalized category, exclusion context, step intent matching, provider evidence.

**Produces:** `evaluateHardEligibility()` and `evaluateQualityGate()` returning explicit PASS/FAIL reasons and confidence.

- [ ] Write failing cases for hospital/motel/category exclusion/required tag rejection, insufficient provider/category evidence rejection, date-cafe generic chain failure, and study-cafe chain pass under a context policy.
- [ ] Run `npx jest __tests__/place-quality.test.ts --runInBand`; expect failure.
- [ ] Implement a versioned policy input where hard criteria are immutable per request and popularity has separate eligibility tier versus ranking bonus semantics.
- [ ] Verify focused tests plus existing `recommend-date-ranking-server` tests.

### Task 4: Refactor ranking to consume only qualified candidates

**Files:**
- Modify: `supabase/functions/_shared/recommendation-ranking.ts`
- Test: `__tests__/recommend-date-ranking-server.test.ts`, `__tests__/place-quality.test.ts`

**Consumes:** Quality-passed `NormalizedPlace` records and existing budget/history context.

**Produces:** Provider-neutral `PlaceCandidate`, score breakdown including separate `popularity`, and deterministic sort.

- [ ] Add failing regression tests: a qualified 700m independent cafe outranks a rejected 300m franchise; two passed cafes may be ordered by distance/popularity; no rejected candidate reaches ranking.
- [ ] Run the focused Jest files; expect the new assertions to fail.
- [ ] Move only relative signals (intent, distance, route fit, popularity, budget, history) into ranking; retain provider rank as evidence, not a hard decision.
- [ ] Re-run focused tests and all existing recommendation ranking tests.

### Task 5: Introduce Kakao adapter behind the new boundary with parity mode

**Files:**
- Create: `supabase/functions/_shared/providers/kakao-place-provider.ts`
- Modify: `supabase/functions/_shared/kakao-search-cache.ts`, `supabase/functions/_shared/recommendation-search-pipeline.ts`
- Test: `__tests__/kakao-place-provider.test.ts`, `__tests__/kakaoSearchCache.test.ts`

**Consumes:** `SemanticSearchPlan`, existing Kakao cache store, existing Kakao fetch adapter.

**Produces:** `KakaoPlaceProvider.search(plan, attempt)` and a `kakao_only` discovery strategy that preserves current results.

- [ ] Write parity fixtures for category, keyword, radius, page size, step-tag accuracy sort, cached documents, and normalized output.
- [ ] Run the focused tests; expect adapter-not-found failures.
- [ ] Extract existing Kakao behavior without changing endpoint parameters or cache TTL/key semantics.
- [ ] Run all Kakao search/cache/recommend-date search server tests and `npm run validate`.

### Task 6: Implement discovery/sufficiency controller in Kakao-only compatibility mode

**Files:**
- Create: `supabase/functions/_shared/recommendation-discovery.ts`
- Modify: `supabase/functions/_shared/recommendation-search-pipeline.ts`, `supabase/functions/_shared/recommend-date-handler.ts`
- Test: `__tests__/recommendation-discovery.test.ts`, `__tests__/recommend-date-phase7-handler.test.ts`

**Consumes:** Semantic plans, provider adapters, duplicate guard, hard eligibility, Quality Gate, requested course steps.

**Produces:** `discoverQualifiedCandidates()` with attempt metadata and `fewerQualifiedResults` outcome.

- [ ] Write failing tests proving every attempt re-runs normalize/dedupe/eligibility/quality, bounded expansion order, no quality threshold relaxation, and insufficient results remain fewer rather than generic fillers.
- [ ] Run focused tests; expect missing-controller failures.
- [ ] Implement the controller with `kakao_only` strategy first and keep existing handler error behavior until the explicit fewer-results response contract is introduced.
- [ ] Verify existing pin/replacement/required-intent tests still pass.

### Task 7: Add NAVER provider in shadow mode

**Files:**
- Create: `supabase/functions/_shared/providers/naver-place-provider.ts`
- Create: `supabase/functions/_shared/naver-search-cache.ts`
- Modify: `supabase/functions/recommend-date/index.ts`, `supabase/config.toml`
- Test: `__tests__/naver-place-provider.test.ts`, `__tests__/recommendation-discovery.test.ts`

**Consumes:** Semantic plans and Edge-only `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`.

**Produces:** A `naver_shadow` strategy that records provider/quality/latency metadata but never changes selected candidates.

- [ ] Write provider mocks for `sort=comment`, text query construction from locality hint, malformed/empty API responses, and no secret leakage.
- [ ] Run focused tests; expect missing-provider failures.
- [ ] Implement Naver request translation and provider-local cache; constrain query/result budgets in configuration.
- [ ] Run focused tests, existing recommendation tests, and `npm run validate`.

### Task 8: Enable Naver-first bounded discovery by feature flag

**Files:**
- Modify: `supabase/functions/_shared/recommendation-discovery.ts`, `supabase/functions/recommend-date/index.ts`, `supabase/functions/_shared/recommend-date-handler.ts`
- Test: `__tests__/recommendation-discovery.test.ts`, `__tests__/recommend-date-server.test.ts`

**Consumes:** Naver and Kakao providers from Tasks 5 and 7.

**Produces:** `naver_primary_with_kakao_fallback` strategy with attempt metadata.

- [ ] Write failing sequence tests: sufficient Naver result means zero Kakao calls; Naver query/radius expansion precedes Kakao; Kakao results re-enter the complete qualification pipeline; final insufficiency returns only passed candidates.
- [ ] Run focused tests; expect strategy failures.
- [ ] Implement flag-controlled attempt sequencing and bounded retry budgets; do not run providers in parallel by default.
- [ ] Run the relevant Jest suites and `npm run validate`.

### Task 9: Additive persistence compatibility and observability

**Files:**
- Modify: `shared/recommendation/contracts.ts`, `shared/recommendation/schemas.ts`, `supabase/functions/_shared/recommendation-prompt.ts`, `supabase/functions/_shared/candidate-pool-snapshot.ts`
- Create: `supabase/migrations/<timestamp>_provider_scoped_recommendation_places.sql`
- Test: `__tests__/recommendationContracts.test.ts`, `__tests__/candidate-pool-snapshot.test.ts`, migration contract tests

**Consumes:** Provider-scoped identities and selection output.

**Produces:** Backwards-compatible persisted `{ provider, providerPlaceId, legacyKakaoPlaceId? }` fields, policy/strategy/attempt metadata, and no permanent cross-provider merge.

- [ ] Write failing schema and migration tests for legacy Kakao rows, Naver provider identities, and attestation/session hydration without an internal canonical place ID.
- [ ] Run focused tests; expect schema/migration failures.
- [ ] Add fields without removing/renaming `kakaoPlaceId`; update prompt and candidate snapshot serialization to preserve provider identity.
- [ ] Apply only to local Supabase, run migration tests, Jest suite, and `npm run validate`; do not deploy.

### Task 10: End-to-end quality policy regression and controlled rollout readiness

**Files:**
- Modify: relevant fixtures under `__tests__/`
- Test: `__tests__/recommendation-discovery.test.ts`, `__tests__/recommend-date-*`, `__tests__/replacementCandidates*`, `__tests__/place-quality.test.ts`

**Consumes:** All preceding modules and runtime strategy/policy configuration.

**Produces:** Regression evidence for strategy switches, quality policy versions, fewer-results behavior, replacement safety, and rollback telemetry.

- [ ] Add full-path fixtures for Compose Coffee, Starbucks, Kimbap Cheonguk, generic neighborhood hof, independent cafe, popular independent restaurant, wine bar, and exhibition.
- [ ] Assert: romantic-cafe prefers passed independent cafe; study cafe permits a qualified franchise; date dinner suppresses generic Kimbap Cheonguk; no quality failure becomes a Claude candidate.
- [ ] Run `npm test -- --runInBand` and `npm run validate`.
- [ ] Perform device QA with Kakao-only, Naver-shadow, and Naver-primary flags; record latency, qualified count, fallback rate, fewer-results rate, replacement rate, and selection source without logging free text.

## Plan Self-Review

- Spec coverage: provider boundary, Naver-first sequence, request-scoped dedupe, non-relaxable Quality Gate, ranking separation, cache separation, provider identity compatibility, Claude constraints, observability, tests, rollout, and rollback each map to Tasks 1–10.
- Placeholder scan: no deferred implementation steps are required for a task to be accepted; phase 7 intentionally remains outside this plan because internal canonical identity was explicitly rejected for MVP.
- Type consistency: Task 1 creates `NormalizedPlace`/`SemanticSearchPlan`; Tasks 2–8 consume them; Task 9 serializes provider-scoped identity additively.
