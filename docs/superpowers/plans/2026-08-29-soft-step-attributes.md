# Cross-Category Soft Step Attributes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep category and concrete place-type keywords enforceable while allowing descriptive attributes such as quiet, atmospheric, light, or good-for-conversation to rank candidates without excluding ordinary valid venues.

**Architecture:** Add an explicit soft-attribute classification to the shared intent dictionary. Structured tags classified as soft remain search-aware and are passed to final selection as preferences, while only hard intents participate in the required-intent gate. Provider-neutral pools continue to enforce the requested category and quality gates.

**Tech Stack:** TypeScript, Jest, Zod, Supabase Edge Functions.

**Spec:** Existing intent contracts in `docs/superpowers/specs/2026-07-29-step-tagged-intents-design.md` and the current provider-neutral candidate-pool contract in `docs/superpowers/specs/2026-08-29-step-scoped-provider-candidate-pools-design.md`.

## Global Constraints

- Keep category compatibility as a hard gate.
- Keep concrete dish, cuisine, drink, activity, and culture keywords as hard intents unless explicitly classified otherwise.
- Soft attributes must not trigger `STEP_INTENT_UNSATISFIED` solely because provider metadata lacks the adjective.
- Search terms remain Korean and remain step-scoped.
- Do not claim quietness, atmosphere, view, or conversation quality as verified facts without evidence.
- Preserve unknown-category acceptance and the existing provider-neutral source-step boundary.
- Do not modify generated food-intent data manually.

---

### Task 1: Classify cross-category descriptive attributes and normalize phrase aliases

**Files:**
- Modify: `supabase/functions/_shared/step-intent-dictionary.ts`
- Modify: `supabase/functions/_shared/step-intent-resolve.ts`
- Test: `__tests__/recommend-date-intent-server.test.ts`

**Interfaces:**
- Add optional dictionary metadata identifying `soft` step attributes; omitted metadata remains `hard` for backward compatibility.
- `resolveStepIntents()` continues returning `ParsedStepIntent`, but assigns `strength: 'preferred'` for dictionary entries marked soft and `required` for existing concrete tags.

- [ ] **Step 1: Add failing tests.**

  Add cases proving that `조용한 카페`, `감성 카페`, `뷰 좋은 카페`, `대화하기 좋은 카페`, and `가볍게` resolve to their canonical terms with `strength: 'preferred'`, while `삼겹살`, `칵테일`, and `방탈출` remain `required`.

- [ ] **Step 2: Run the focused tests and verify the expected RED failure.**

  ```bash
  npx jest __tests__/recommend-date-intent-server.test.ts --runInBand
  ```

- [ ] **Step 3: Add the explicit soft classification and phrase aliases.**

  Mark only descriptive dictionary entries soft. Add Korean compound phrase aliases so direct input such as `조용한 카페` resolves to the shared `조용한` intent instead of becoming an unknown custom required keyword. Preserve hard defaults for dishes, cuisines, drinks, activities, and concrete culture/walk tags.

- [ ] **Step 4: Re-run the focused tests and verify GREEN.**

  ```bash
  npx jest __tests__/recommend-date-intent-server.test.ts --runInBand
  ```

### Task 2: Allow soft attributes through provider-neutral pools and prefer them during selection

**Files:**
- Modify: `supabase/functions/_shared/provider-neutral-discovery-pipeline.ts`
- Modify: `supabase/functions/_shared/provider-neutral-course-selection.ts`
- Modify: `supabase/functions/_shared/recommendation-prompt.ts`
- Modify: `supabase/functions/_shared/provider-neutral-ranking.ts`
- Test: `__tests__/provider-neutral-discovery-pipeline.test.ts`
- Test: `__tests__/provider-neutral-course-selection.test.ts`
- Test: `__tests__/provider-neutral-prompt.test.ts`

**Interfaces:**
- Required-intent filtering remains unchanged for hard intents.
- Soft intents do not require provider metadata proof to be selectable.
- Provider-neutral prompt includes soft intents as ranking preferences, not as required matching-ID constraints.

- [ ] **Step 1: Add failing tests.**

  Add a cafe step with a preferred `조용한` intent and ordinary cafe candidates whose names/category metadata do not contain `조용한`; assert the pool remains sufficient and course assembly accepts one. Add prompt assertions that the soft term is present as a preference and is not placed in the required-intent section. Add a concrete hard `삼겹살` case that still rejects a generic meal candidate.

- [ ] **Step 2: Run focused tests and verify RED.**

  ```bash
  npx jest __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/provider-neutral-course-selection.test.ts __tests__/provider-neutral-prompt.test.ts --runInBand
  ```

- [ ] **Step 3: Implement the minimal soft-intent behavior.**

  Use only `strength === 'required'` for the existing strict provider-neutral intent gate. Keep category/quality/history filtering intact. Add a separate soft-preference prompt section. Extend provider-neutral ranking with a bounded boost when a candidate was returned by the step-intent query, without treating that search result as factual proof of the attribute.

- [ ] **Step 4: Run the focused tests and verify GREEN.**

  ```bash
  npx jest __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/provider-neutral-course-selection.test.ts __tests__/provider-neutral-prompt.test.ts --runInBand
  ```

### Task 3: Preserve legacy Kakao path behavior and validate the full change

**Files:**
- Modify: `supabase/functions/_shared/recommendation-ranking.ts` only if shared intent-strength handling requires it.
- Modify: `supabase/functions/_shared/replacement-candidates-handler.ts` only if replacement filtering incorrectly treats soft intents as required.
- Test: existing recommendation, replacement, and intent suites.

- [ ] **Step 1: Run all affected intent, recommendation, replacement, and provider-neutral suites.**

  ```bash
  npx jest __tests__/stepIntent.test.ts __tests__/stepIntentResolve.test.ts __tests__/recommend-date-intent-server.test.ts __tests__/recommend-date-phase7-handler.test.ts __tests__/replacementCandidatesHandler.test.ts __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/provider-neutral-course-selection.test.ts __tests__/provider-neutral-prompt.test.ts --runInBand
  ```

- [ ] **Step 2: Run repository validation.**

  ```bash
  npm run validate
  git diff --check
  ```

- [ ] **Step 3: Run the full Jest suite.**

  ```bash
  npx jest --runInBand
  ```

- [ ] **Step 4: Do not deploy until tests pass and the user approves deployment.**
