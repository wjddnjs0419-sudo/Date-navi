# Provider-Neutral Replacement Candidate IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure every newly generated provider-neutral replacement candidate has a step-scoped and per-generation unique `candidateId`, without changing the initial course-generation request or repairing existing sessions.

**Architecture:** Keep the existing recommendation input and initial candidate-pool IDs unchanged. Add one shared ID factory for provider-neutral replacement candidates; the factory embeds a sanitized target step identifier and a fresh UUID, and the Edge Function stores that ID in the attestation response and current session projection. Existing course-level uniqueness validation remains enabled.

**Tech Stack:** TypeScript, Deno Edge Functions, Jest, Supabase recommendation session contracts.

**Spec:** The user requirement in this task: new provider-neutral replacement IDs must not collide with candidates from other initial course steps or with candidates produced by repeated replacement lists for the same step; existing duplicated sessions are out of scope.

## Global Constraints

- Do not change the initial course-generation request, candidate-pool selection, locked-step input, Kakao candidate ID generation, or existing session data.
- Do not weaken course-level `candidateId` uniqueness validation.
- Only change provider-neutral replacement candidate ID generation and its focused regression coverage.
- Preserve the existing 120-character candidate ID contract.
- Run the focused test first, then `npm run validate` and the focused recommendation tests.

---

### Task 1: Define the replacement candidate ID invariant

**Files:**
- Create: `shared/recommendation/provider-neutral-candidate-id.ts`
- Create: `__tests__/provider-neutral-candidate-id.test.ts`

**Interfaces:**
- Produces `createProviderNeutralReplacementCandidateId(stepId: string): string`.
- The returned ID contains a normalized target step token and a fresh UUID, and is at most 120 characters.

- [ ] **Step 1: Write the failing test**

  Cover two behaviors:
  - IDs for two different steps are different and retain distinct step tokens.
  - Two calls for the same step are different, proving repeated replacement lists cannot reuse the ID.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `npx jest __tests__/provider-neutral-candidate-id.test.ts --runInBand`

  Expected: FAIL because the ID factory does not exist.

- [ ] **Step 3: Implement the minimal ID factory**

  Normalize the step ID to a bounded `[A-Za-z0-9_-]` token, append `crypto.randomUUID()`, and keep the resulting value within 120 characters. Do not derive the ID from the candidate index alone.

- [ ] **Step 4: Run the focused test and verify it passes**

  Run: `npx jest __tests__/provider-neutral-candidate-id.test.ts --runInBand`

  Expected: PASS.

### Task 2: Use the invariant only for provider-neutral replacement output

**Files:**
- Modify: `supabase/functions/provider-neutral-replacements/index.ts:99-110`

**Interfaces:**
- Consumes the ID factory from Task 1.
- Continues to return the same candidate fields and keeps `providerPlaceId` as the actual place identity.

- [ ] **Step 1: Write the failing integration-shaped assertion**

  Extend focused source/handler coverage so the provider-neutral replacement path uses the factory and no longer constructs `candidateId` solely from `index + 1`.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `npx jest __tests__/provider-neutral-candidate-id.test.ts __tests__/candidatePoolSnapshotMigration.test.ts --runInBand`

  Expected: FAIL on the source-use assertion while the factory tests pass.

- [ ] **Step 3: Make the minimal Edge Function change**

  Replace only the provider-neutral replacement `candidateId` expression with the Task 1 factory. Leave initial provider-neutral discovery IDs, Kakao IDs, request payloads, exclusions, and attestation semantics unchanged.

- [ ] **Step 4: Run focused tests**

  Run: `npx jest __tests__/provider-neutral-candidate-id.test.ts __tests__/candidatePoolSnapshotMigration.test.ts --runInBand`

  Expected: PASS.

### Task 3: Verify no generation dependency regression

**Files:**
- Test: `__tests__/provider-neutral-candidate-id.test.ts`
- Test: existing provider-neutral and recommendation session tests selected by the implementation

- [ ] **Step 1: Assert the initial generation path is untouched**

  Confirm the new factory is imported only by `provider-neutral-replacements/index.ts`; initial discovery still emits `provider_candidate_<stepId>_<rank>` and no recommendation request fields are altered.

- [ ] **Step 2: Run validation**

  Run: `npm run validate`

  Expected: exit code 0.

- [ ] **Step 3: Run focused regression tests**

  Run: `npx jest __tests__/provider-neutral-candidate-id.test.ts __tests__/candidatePoolSnapshotMigration.test.ts __tests__/recommendationSessionRepository.test.ts --runInBand`

  Expected: all selected suites pass.

