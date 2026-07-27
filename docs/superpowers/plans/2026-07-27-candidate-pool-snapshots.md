# Candidate Pool Snapshots Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** Persist an immutable, analysis-safe snapshot of every ranked recommendation candidate for each newly created session.

**Architecture:** A pure Edge helper serializes ranked candidates, price facts, and request-derived flags after course selection. The validated response carries that private field through the attestation; the session RPC validates and stores it once, while mutations retain it.

**Tech Stack:** TypeScript, Zod, Supabase Edge Functions, PostgreSQL JSONB, Jest.

## Global Constraints

- Preserve the maximum candidate pool size of 40.
- Do not store place names, addresses, coordinates, search evidence, prompts, or free text in the snapshot.
- Existing legacy candidate-pool rows remain valid and are not backfilled.
- Any malformed or missing snapshot rejects new-session persistence.

---

### Task 1: Serialize the immutable candidate snapshot

**Files:**
- Create: `supabase/functions/_shared/candidate-pool-snapshot.ts`
- Modify: `shared/recommendation/schemas.ts`, `supabase/functions/_shared/recommend-date-handler.ts`
- Test: `__tests__/candidate-pool-snapshot.test.ts`

- [x] Build snapshots from ranked candidates using one-based final order, summed score breakdown, ranking-time price range, and request/history flags.
- [x] Add the storage-only response field and mark only course-selected places as initially selected for AI and deterministic paths.
- [x] Run the focused unit and handler tests.

### Task 2: Persist and freeze the snapshot

**Files:**
- Create: `supabase/migrations/20260727160000_candidate_pool_snapshots.sql`
- Modify: `docs/supabase-schema.sql`
- Test: `__tests__/candidatePoolSnapshotMigration.test.ts`

- [x] Require and validate a bounded, unique snapshot array in initial-session attestation consumption.
- [x] Store the response snapshot instead of course steps, and keep it unchanged during mutations.
- [x] Run static migration contract tests plus type checking.

### Task 3: Verify regression boundaries

**Files:**
- Test: existing recommendation handler and ranking test suites

- [x] Verify price lookup failure serializes `unknown`, while replacement, pins, locks, and history reintroduction retain their existing behavior.
- [x] Run `npm run validate` and the affected Jest suites.
