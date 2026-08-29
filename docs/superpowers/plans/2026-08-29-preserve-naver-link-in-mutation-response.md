# Naver Kakao Link Mutation Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the verified Kakao map/review link for Naver-owned places when an existing recommendation session is edited, so generation, hydration, and every course edit continue to share one valid response contract.

**Architecture:** Keep the input-generation and client identity model unchanged. Patch the already-deployed `apply_recommendation_session_mutation` in two server-side boundaries: first copy an attested response’s optional Naver Kakao link into `current_kakao_link_place_id`, then serialize that column into `current_course.steps` and `cards[*].steps`. The stable identity remains `(current_place_provider, current_provider_place_id)`; `current_kakao_link_place_id` remains display/link metadata for Naver; `current_kakao_place_id` remains populated only for Kakao-owned places.

**Tech Stack:** Supabase Postgres migrations, dynamic `pg_get_functiondef` patching with guarded `CREATE OR REPLACE FUNCTION`, Supabase CLI linked project, Jest, TypeScript, Expo React Native client.

**Spec:** The existing mapper in `lib/recommendation-session-repository.ts` already distinguishes the two meanings of Kakao ID: it compares a Kakao-owned row to `current_kakao_place_id`, and a Naver-owned row to `current_kakao_link_place_id`. The initial persist path in `20260818030000_kakao_link_metadata.sql` satisfies this contract. The mutation path had two separate gaps: its serializer reconstructed `kakaoPlaceId` from `current_kakao_place_id` for every provider, and its attested state sync updated only the provider tuple, not the optional Naver link column. The first gap broke hydration after non-attested edits; the second would still lose a newly returned Naver link during regenerate/add/replace. Both boundaries must be fixed without changing generation input or stable identity.

## Global Constraints

- Do not modify the AI prompt, candidate search/ranking, `recommendationRequestSchema`, `recommendDateResponseSchema`, `requestRecommendationResponse`, or any request construction in `app/mode-flow/course-result.tsx`.
- Do not modify `lib/recommendation-session-repository.ts`; the existing provider-aware mapper is the contract that makes initial Naver generation valid.
- Do not change `placeIdentity`, `current_place_provider`, `current_provider_place_id`, `current_kakao_place_id`, or the provider-neutral candidate attestation rules.
- Do not edit applied migrations. Add one migration after the current `20260829020000` repair migration.
- Do not patch `provider-neutral-replacements/index.ts`; its Naver apply path intentionally clears the old Kakao link because the newly selected Naver candidate has not been verified to have that old link.
- Do not infer or send `current_kakao_link_place_id` as a stable identity in `lockedSteps`, replacement payloads, exclusion lists, duplicate checks, or attestation input.
- Keep the migration fail-closed: if the deployed function source does not contain the expected post-`20260829020000` shape, abort instead of applying a partial string replacement.
- Preserve all existing user/session data. Verification that mutates a live session must use a new draft session or a transaction that ends with `ROLLBACK`; no cleanup delete is part of this plan.

---

## Dependency contract to preserve

| Stage | Canonical fields | Required invariant |
|---|---|---|
| Input generation | `courseSteps`, `lockedSteps`, `replacement`, `excludedPlaceIds`, `baseRequestId`, `sessionId` | Provider identity is `placeIdentity.provider/providerPlaceId`; Naver link is never used as the place identity. |
| Attested response | `course.steps[*].placeIdentity`, optional `course.steps[*].kakaoPlaceId` | For Naver, `kakaoPlaceId` is only a verified Kakao link; it may be absent. |
| Initial persist | `current_place_provider`, `current_provider_place_id`, `current_kakao_place_id`, `current_kakao_link_place_id` | Kakao: stable ID in `current_kakao_place_id`; Naver: stable ID in provider columns and optional link in `current_kakao_link_place_id`. |
| Mutation state | `recommendation_course_steps` | State changes use provider tuple and candidate attestation, not the optional link; an attested response may update the optional link column for the current Naver place. |
| Mutation response | `current_course.steps` and `cards[*].steps` | Serialize Naver `current_kakao_link_place_id` back to the legacy optional `kakaoPlaceId` field; serialize Kakao `current_kakao_place_id` as before. |
| Client hydration | `mapRecommendationSessionPayload` | The course JSON and step rows must agree on provider identity, link field, place facts, order, and lock state. |

The response expression to introduce in the mutation serializer is:

```sql
case when current_place_provider = 'naver'
  then current_kakao_link_place_id
  else current_kakao_place_id
end
```

This expression is deliberately limited to the response builders for `v_steps` and `v_card_steps`. It must not replace the provider identity used by the mutation validation or the input/request state.

## Files and ownership

### Create

- `supabase/migrations/20260829030000_preserve_naver_kakao_link_in_mutation_response.sql`
- `supabase/migrations/20260829040000_sync_naver_kakao_link_on_attested_mutation.sql`
- `__tests__/recommendationSessionMutationLinkMetadataMigration.test.ts`
- `__tests__/recommendationSessionMutationLinkStateMigration.test.ts`

### Read and verify, but do not modify

- `lib/recommendation-session-repository.ts`
- `app/mode-flow/course-result.tsx`
- `components/recommendation/recommendation-session-provider.tsx`
- `supabase/functions/provider-neutral-replacements/index.ts`
- `supabase/migrations/20260818030000_kakao_link_metadata.sql`
- `supabase/migrations/20260829000000_provider_neutral_session_mutations.sql`
- `supabase/migrations/20260829010000_fix_provider_neutral_mutation_state.sql`
- `supabase/migrations/20260829020000_repair_recommendation_session_mutation.sql`

## Implementation tasks

### 1. Capture the deployed baseline before writing the patch

- [ ] Query `pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure)` on the linked Supabase project and save the relevant source text in the investigation notes.
- [ ] Confirm the deployed definition contains the provider-identity helper, the `v_response #>> ARRAY[...]` JSONB path repair, the null-safe duplicate check, and the `latest_request`/non-attested provider-state repair.
- [ ] Confirm there are two response serializers to patch: the `v_steps` builder used by `current_course.steps` and the `v_card_steps` builder used by `cards[*].steps`.
- [ ] Stop before implementation if any marker is missing; the new migration must not guess at a different function version.

### 2. Add a failing migration-contract regression test

- [ ] Create `__tests__/recommendationSessionMutationLinkMetadataMigration.test.ts` using `readFileSync` and `resolve`, matching the repository’s existing migration-source test style.
- [ ] Assert the new migration contains the Naver conditional expression for `current_kakao_link_place_id` and `current_kakao_place_id`.
- [ ] Assert the migration targets both the course-step and card-step output shapes, including `v_steps` and `v_card_steps` markers.
- [ ] Assert it contains `pg_get_functiondef`, an idempotency guard, `execute v_definition`, and a fail-closed exception marker.
- [ ] Assert it does not contain a replacement that changes `placeIdentity.providerPlaceId`, validation comparisons, or request input fields.
- [ ] Run the targeted Jest test and confirm it fails because the migration file does not exist yet.

### 3. Add the guarded response-only migration

- [ ] Create `supabase/migrations/20260829030000_preserve_naver_kakao_link_in_mutation_response.sql` with `begin; ... commit;` and one guarded `do $patch$` block.
- [ ] Read the current function with `pg_get_functiondef` and keep `v_before` for the no-op/failure check.
- [ ] Add an idempotency marker based on the full conditional serialization expression. A second `supabase db push` must return without changing the function again.
- [ ] Replace the exact `v_steps` serializer fragment so `kakaoPlaceId` is provider-aware while leaving its `placeIdentity` object and all other place facts unchanged.
- [ ] Replace the exact `v_card_steps` serializer fragment with the same provider-aware value. Cards must not retain a stale link from a previous place; they must reflect the current row.
- [ ] Ensure replacements are scoped to the two output builders. Do not globally replace every occurrence of `current_kakao_place_id`, because the function also contains mutation validation and internal locked-step/request state.
- [ ] Verify the final source contains both output markers, the Naver conditional, the prior provider identity helper, and the prior JSONB array-path repair. Raise a clear exception if any expected replacement did not occur.
- [ ] Execute the patched function definition only after all guards pass.

The migration must implement this semantic mapping in both response builders:

```text
current_place_provider = kakao  -> kakaoPlaceId = current_kakao_place_id
current_place_provider = naver  -> kakaoPlaceId = current_kakao_link_place_id (nullable)
```

It must not make this mapping:

```text
Naver providerPlaceId -> kakaoPlaceId
```

That would reintroduce the exact identity/link collision that caused the previous generation conflict.

### 4. Add the guarded attested-state link migration

- [ ] Create `supabase/migrations/20260829040000_sync_naver_kakao_link_on_attested_mutation.sql`; do not edit the already-applied `20260829030000` file.
- [ ] Read the deployed function with `pg_get_functiondef` and require the provider-aware response expression from `20260829030000` before patching. This makes the migration order explicit and fail-closed.
- [ ] Replace only the existing attested provider-state `update public.recommendation_course_steps current_step` block. Keep its provider tuple extraction unchanged.
- [ ] Add `current_kakao_link_place_id = case ... end` to that same update: for an attested Naver response, copy its optional response `kakaoPlaceId`; for an attested Kakao response, clear the link column; for non-attested actions, preserve the existing row link.
- [ ] Extract the response field with the repaired `ARRAY[...]` JSONB path and the response step’s `stepId` lookup, not with a dynamic text path.
- [ ] Guard the patch with exact old/new markers, require one successful replacement, and raise before `execute v_definition` if the deployed function shape is unexpected.
- [ ] Do not alter `placeIdentity`, `current_place_provider`, `current_provider_place_id`, candidate validation, duplicate checks, or request serialization.
- [ ] Add `__tests__/recommendationSessionMutationLinkStateMigration.test.ts` to assert the new migration contains the provider-aware link sync, the attested-only condition, the array-path extraction, and fail-closed markers.
- [ ] Run this targeted test before and after creating the migration so the new test has a verified red-to-green transition.

### 5. Run local static and type verification before deployment

- [ ] Run the new targeted migration test and the existing `recommendationSessionMutationRepairMigration.test.ts`.
- [ ] Run `npm run validate` using the repository’s Node stack-size workaround if the environment requires it.
- [ ] Run the full Jest suite with `npx jest --runInBand` after the targeted checks pass.
- [ ] Confirm the only new source files are the migration and its regression test; do not stage or alter unrelated pre-existing worktree changes.

### 6. Deploy the migration through the linked Supabase CLI

- [ ] Run `supabase db push --linked` from the repository root.
- [ ] Run `supabase db push --linked --dry-run` and confirm the new migration is applied and no pending duplicate patch remains.
- [ ] Re-query `pg_get_functiondef` and verify the deployed function has exactly the provider-aware `kakaoPlaceId` expression in both response builders.
- [ ] Verify the migration is idempotent by running the dry-run/definition check a second time; the function source and migration result must be unchanged.

### 7. Verify the input-generation dependency chain with a Naver link

- [ ] Generate a fresh Naver-containing recommendation through the existing app/API flow; do not alter the request builder.
- [ ] Before any edit, record the attested response tuple for one linked Naver step: `placeIdentity.provider = naver`, `placeIdentity.providerPlaceId = Naver ID`, optional `kakaoPlaceId = Kakao link`.
- [ ] Persist and hydrate it. Assert the row has `current_place_provider = naver`, `current_provider_place_id = Naver ID`, `current_kakao_place_id IS NULL`, and `current_kakao_link_place_id = response.kakaoPlaceId`.
- [ ] Confirm the existing mapper accepts the initial session. If initial hydration fails, stop: that is an input/persist contract regression and this response-only patch must not be used to mask it.
- [ ] Build a regenerate/add/replace request from the current snapshot and verify its `lockedSteps`, `replacement`, and `excludedPlaceIds` contain provider identity fields, not the Naver link as a stable identity.
- [ ] Confirm the attested response still supplies the candidate ID used by the mutation RPC. Do not reuse a candidate number from a separate replacement-candidate list.

### 8. Verify every affected edit path and the untouched provider paths

- [ ] In a transaction using a linked Naver session, call `lock`, `unlock`, and `reorder`; inspect the RPC payload before rollback and assert the returned course step keeps the Naver link in `course.steps[*].kakaoPlaceId` and the row link column remains equal.
- [ ] In a fresh draft session, exercise Naver replacement through `provider-neutral-replacements` and reload. Assert a newly selected Naver place has its own provider identity and a null link unless a new verified link was explicitly produced; the old place’s link must not carry over.
- [ ] Exercise attested regenerate and add with a Naver-containing course. Assert a newly returned Naver link is first written to `current_kakao_link_place_id`, then appears in both course/card response payloads; locked steps remain matched by provider identity and the returned session hydrates without `course step row ... does not match current course`.
- [ ] Exercise Kakao replacement and Kakao lock/reorder. Assert `kakaoPlaceId` remains the Kakao stable ID and no Naver-link branch changes Kakao behavior.
- [ ] Inspect Supabase function/Postgres logs for the test window. Expected result: no JSONB `#>> text` error, no false duplicate from null Kakao IDs, no `constraint_violation` caused by link-vs-identity comparison, and no client malformed-payload error after a successful mutation.
- [ ] Confirm each successful edit has matching persisted state: step order, candidate ID, provider tuple, optional link, place facts, and lock flag all agree between `recommendation_sessions.current_course`, `recommendation_course_steps`, and the hydrated client snapshot.

### 9. Completion gate and rollback procedure

- [ ] Re-run `npm run validate`, the migration tests, and the full Jest suite after deployment verification.
- [ ] Capture the before/after function-definition diff and the exact test session IDs/request IDs in the result notes; do not record user access tokens.
- [ ] If the patch fails its guard, leave the existing function untouched and report the source-shape mismatch.
- [ ] If runtime verification finds an unintended change, stop using the edit UI, preserve the logs, and create a follow-up migration that restores the previous function definition after inspecting the deployed definition. Do not use destructive table deletes or modify the initial generation path as a rollback shortcut.

## Expected final behavior

- Initial generation remains unchanged and continues to use `placeIdentity` for provider identity.
- Naver-owned places retain an optional verified Kakao link through lock, unlock, reorder, delete, confirm, regenerate, replace, and add response hydration when that link belongs to the current place.
- Attested mutations update the optional Naver link column from the new response and clear it when the new provider is Kakao or the Naver response has no link.
- A Naver place without a verified link continues to serialize `kakaoPlaceId` as absent/null without being treated as a duplicate.
- Kakao-owned places continue to use `current_kakao_place_id` as both stable identity and legacy `kakaoPlaceId`.
- The client mapper, request generation, provider-neutral replacement flow, and attestation model remain unchanged.
