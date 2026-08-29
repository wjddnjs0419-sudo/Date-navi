# Provider Search Intent Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow explicit Naver and Kakao keyword-search evidence to satisfy provider-neutral required intents while preserving category and quality safeguards.

**Architecture:** Add an opt-in search-evidence policy to the provider-neutral intent matcher. Enable it consistently in provider-neutral discovery, final selection, prompts, and replacement validation; leave legacy Kakao-only callers strict by default. Track evidence source in candidate qualification for auditability.

**Tech Stack:** TypeScript, Supabase Edge Functions on Deno, Jest, Zod.

**Spec:** `docs/superpowers/specs/2026-08-29-provider-search-intent-evidence-design.md`

## Global Constraints

- Known incompatible categories remain excluded; unknown provider categories remain eligible.
- The drinks-step meal-category compatibility rule remains unchanged.
- Category-only search evidence cannot satisfy a required keyword intent.
- Strict metadata evidence remains stronger than provider search evidence.
- Soft adjective intents remain preferences and are not claimed as verified facts.
- Provider-neutral candidate-pool ownership and candidate IDs remain unchanged.
- Do not log full user queries; only evidence-source diagnostics are added.

---

### Task 1: Make provider search evidence an explicit opt-in required-intent signal

**Files:**
- Modify: `supabase/functions/_shared/provider-neutral-intent.ts`
- Modify: `supabase/functions/_shared/step-intent.ts`
- Test: `__tests__/stepIntentResolve.test.ts`

**Interfaces:**
- Add `ProviderNeutralIntentMatchOptions` with `allowProviderSearchEvidence?: boolean`.
- Extend `providerNeutralPlaceMatchesStepIntent(place, intent, options?)` to return the existing boolean result while accepting the option.
- Extend `providerNeutralPlaceMatchesStep(place, step, intent, options?)` with the same option.
- Keep the default strict (`allowProviderSearchEvidence` absent/false) for legacy callers.

- [ ] **Step 1: Write failing tests**

Add tests proving a place with no metadata keyword is rejected by default but accepted when its search evidence contains the canonical intent term, for both Naver and Kakao identities. Add a test proving a category-only search term does not satisfy the intent.

- [ ] **Step 2: Run the focused test to verify failure**

Run: `npx jest __tests__/stepIntentResolve.test.ts --runInBand`

Expected: the new opt-in acceptance test fails because search evidence is currently ignored by the strict matcher.

- [ ] **Step 3: Implement the minimal matcher change**

Keep `placeMatchesStepIntent` as the metadata-only proof. In `provider-neutral-intent.ts`, first check metadata proof; only when the option is enabled and `providerNeutralStepIntentSearchLevel(place, intent) === 0` return true from canonical provider search evidence. Keep category matching separate.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx jest __tests__/stepIntentResolve.test.ts --runInBand`

Expected: PASS, including the existing default-strict regression test.

- [ ] **Step 5: Commit**

Do not create a commit automatically because the working tree contains unrelated user changes; retain the tested edits for the next task.

### Task 2: Apply the opt-in policy to provider-neutral discovery and final course selection

**Files:**
- Modify: `supabase/functions/_shared/provider-neutral-discovery-pipeline.ts`
- Modify: `supabase/functions/_shared/provider-neutral-course-selection.ts`
- Modify: `supabase/functions/_shared/recommend-date-handler.ts`
- Test: `__tests__/provider-neutral-discovery-pipeline.test.ts`
- Test: `__tests__/provider-neutral-course-selection.test.ts`

**Interfaces:**
- Every provider-neutral required-intent check uses `{ allowProviderSearchEvidence: true }`.
- Candidate qualification records `intentEvidence` with `phase: 'provider_search'` for search-evidence matches and `phase: 'provider_metadata'` for strict matches.

- [ ] **Step 1: Write failing tests**

Add pipeline tests where an explicit Naver result and an explicit Kakao result have compatible categories but no metadata keyword; each must become selectable when the search evidence contains the canonical term. Add a final course-selection test using the same candidate to prove the selection boundary accepts it. Keep a category-only query test rejected.

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `npx jest __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/provider-neutral-course-selection.test.ts --runInBand`

Expected: the new provider-search candidates are currently rejected as `intent_unmatched`.

- [ ] **Step 3: Implement the shared policy at all provider-neutral checks**

Pass the opt-in option through `canAssignEveryStep`, step-pool qualification, deterministic selection checks, and `buildProviderNeutralCourse`. Preserve the existing category gate. Set the qualification evidence phase from metadata proof versus canonical search evidence without changing candidate IDs.

- [ ] **Step 4: Run the focused tests to verify it passes**

Run: `npx jest __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/provider-neutral-course-selection.test.ts --runInBand`

Expected: PASS with both provider identities and all existing category/intent safeguards.

- [ ] **Step 5: Commit**

Do not create a commit automatically because the working tree contains unrelated user changes; retain the tested edits for the next task.

### Task 3: Align prompt and replacement validation with the same evidence policy

**Files:**
- Modify: `supabase/functions/_shared/recommendation-prompt.ts`
- Modify: `supabase/functions/provider-neutral-replacements/index.ts`
- Modify: `supabase/functions/_shared/recommend-date-handler.ts`
- Test: `__tests__/provider-neutral-prompt.test.ts`
- Test: `__tests__/replacementCandidatesHandler.test.ts`

**Interfaces:**
- Required-intent candidate IDs in the provider-neutral prompt use the same opt-in matcher.
- Prompt wording distinguishes provider search relevance from verified place facts.
- Replacement candidate filtering accepts the same explicit Naver/Kakao search evidence.

- [ ] **Step 1: Write failing tests**

Add a prompt test asserting a search-evidence candidate appears in required-intent `matchingCandidateIds` and the prompt says search evidence is relevance evidence, not a verified name/category fact. Add replacement coverage for an explicit search-evidence candidate without metadata keyword.

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `npx jest __tests__/provider-neutral-prompt.test.ts __tests__/replacementCandidatesHandler.test.ts --runInBand`

Expected: the candidate is absent from required matching IDs or replacement filtering rejects it.

- [ ] **Step 3: Implement prompt and replacement alignment**

Use `{ allowProviderSearchEvidence: true }` for required-intent prompt filtering and replacement validation. Add concise prompt language that the query supports relevance but does not prove an adjective or factual attribute.

- [ ] **Step 4: Run the focused tests to verify it passes**

Run: `npx jest __tests__/provider-neutral-prompt.test.ts __tests__/replacementCandidatesHandler.test.ts --runInBand`

Expected: PASS with prompt and replacement behavior aligned with discovery and final selection.

- [ ] **Step 5: Commit**

Do not create a commit automatically because the working tree contains unrelated user changes; retain the tested edits for the next task.

### Task 4: Verify, deploy, and inspect production evidence-source telemetry

**Files:**
- Modify: `supabase/functions/_shared/provider-neutral-discovery-pipeline.ts` diagnostics to expose evidence-source counts
- Test: all existing Jest suites

**Interfaces:**
- Production `recommend_date_provider_discovery` logs expose metadata versus provider-search intent evidence counts without raw queries.
- Deploy `recommend-date` and `provider-neutral-replacements` together.

- [ ] **Step 1: Run validation and the full test suite**

Run: `npm run validate`, `npm test -- --runInBand`, and `git diff --check`.

Expected: typecheck and all tests pass; only known test-console warnings may appear.

- [ ] **Step 2: Deploy both Edge Functions**

Run: `supabase functions deploy recommend-date --project-ref wqjguifsmtblgrhdfnji` and `supabase functions deploy provider-neutral-replacements --project-ref wqjguifsmtblgrhdfnji`.

Expected: both deployments report success.

- [ ] **Step 3: Verify deployed versions**

Run: `supabase functions list --project-ref wqjguifsmtblgrhdfnji`.

Expected: both target functions show active versions newer than the previous deployment.

- [ ] **Step 4: Run the production QA scenario**

Use location `홍대입구` with explicit step keywords `삼겹살`, `조용한 카페`, and `칵테일`. Inspect `recommend_date_provider_discovery` for search-evidence matches in both Naver and Kakao pools, preserved category gating, and no unexpected `STEP_INTENT_UNSATISFIED` caused solely by missing metadata text.

- [ ] **Step 5: Report final evidence**

Report deployed versions, test totals, and the observed per-step evidence-source counts. Do not call the change fixed until the production log confirms the new version and the QA request exercises the intended path.
