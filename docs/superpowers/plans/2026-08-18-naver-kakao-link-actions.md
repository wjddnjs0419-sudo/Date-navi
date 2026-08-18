# Naver Kakao Link Actions Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** Restore trustworthy Kakao review/map links and Naver-backed "other place" actions without replacing provider-scoped identities.

**Architecture:** Add a request-scoped Kakao link resolver after Naver normalization. It emits optional legacy Kakao link metadata only for one exact name/address/coordinate match. Split the course-result actions by identity provider: legacy Kakao uses its existing mutation RPC; Naver creates a fresh Naver-first attested course and persists the provider-scoped result.

**Tech Stack:** Expo React Native, TypeScript, Supabase Edge Functions/Postgres, Jest.

## Global Constraints

- Stable identity remains `{ provider, providerPlaceId }`; no canonical entity merge.
- Kakao match metadata is optional and only enables review/map links.
- Name, road-address, and coordinate checks must all pass; ambiguity hides links.
- Quality Gate hard criteria are unchanged.
- Existing Kakao sessions and mutations remain unchanged.

---

### Task 1: High-confidence Kakao link resolver

**Files:**
- Create: `supabase/functions/_shared/kakao-place-link.ts`
- Modify: `supabase/functions/recommend-date/index.ts`
- Test: `__tests__/kakao-place-link.test.ts`

**Interfaces:**
- Produces `resolveKakaoPlaceLink(naverPlace, search): Promise<{ kakaoPlaceId: string; mapUrl: string } | undefined>`.
- Consumes a Kakao keyword-search adapter that returns normalized Kakao places.

- [ ] Write failing tests for exact name/address/near-coordinate acceptance, name mismatch, address mismatch, distant coordinate, and multiple matching results.
- [ ] Run `npx jest __tests__/kakao-place-link.test.ts --runInBand` and confirm each new assertion fails because the resolver does not exist.
- [ ] Implement normalization plus a 30-metre Haversine threshold; return one result only when all checks pass.
- [ ] Attach the result as `legacy.kakaoPlaceId` and Kakao `mapUrl`, while retaining Naver identity.
- [ ] Re-run the focused Jest suite.

### Task 2: Contract and session hydration for optional link metadata

**Files:**
- Modify: `shared/recommendation/schemas.ts`
- Modify: `shared/recommendation/contracts.ts`
- Modify: `lib/recommendation-session-repository.ts`
- Test: `__tests__/recommendationContracts.test.ts`
- Test: `__tests__/recommendationSessionRepository.test.ts`

**Interfaces:**
- A Naver `placeIdentity` may carry an optional linked Kakao ID that is explicitly marked as link metadata, not identity.
- Session hydration exposes `currentKakaoPlaceId` only when that metadata is present.

- [ ] Write failing contract and hydration fixtures for a Naver identity with an optional Kakao review/map link.
- [ ] Run the two focused suites and confirm failures at the current Naver-plus-Kakao validation rejection.
- [ ] Permit optional linked Kakao IDs for Naver steps without changing uniqueness or identity checks.
- [ ] Re-run focused suites.

### Task 3: Restore map/review action safely

**Files:**
- Modify: `app/mode-flow/course-result.tsx`
- Test: `__tests__/course-result-screen.test.tsx`

**Interfaces:**
- The review/map button renders only when `currentKakaoPlaceId` is available.

- [ ] Add a failing UI test asserting linked Naver steps render a usable review/map action and unlinked Naver steps do not.
- [ ] Run the focused UI test and confirm it fails.
- [ ] Keep `openPlaceInBrowser` Kakao-only, but enable it from the optional link ID.
- [ ] Re-run the focused UI test.

### Task 4: Provider-neutral other-place action

**Files:**
- Modify: `app/mode-flow/course-result.tsx`
- Modify: `supabase/functions/_shared/recommend-date-handler.ts`
- Modify: `docs/supabase-schema.sql` and an additive migration only if the existing mutation RPC cannot persist an attested Naver replacement.
- Test: `__tests__/course-result-screen.test.tsx`
- Test: `__tests__/recommend-date-server.test.ts`

**Interfaces:**
- Naver sessions use `requestRecommendationResponse` with a fresh request ID and provider-scoped identities; no Kakao-only replacement candidate endpoint is called.
- Kakao sessions retain `replacement-candidates` and current mutation payloads.

- [ ] Write a failing test for a Naver session opening “other places” and yielding a new provider-neutral course without a Kakao ID.
- [ ] Run focused tests and confirm the current Kakao-ID guard blocks it.
- [ ] Implement the Naver branch by regenerating the target step through the Naver-first sufficiency controller, preserving other selected steps as provider-scoped locks.
- [ ] Persist from the server-attested response using the additive provider session fields; retain the legacy Kakao branch unchanged.
- [ ] Run focused tests, `npm run validate`, and `git diff --check`.

### Task 5: Deploy and verify

**Files:**
- Modify: Edge Function deployment only.

- [ ] Deploy `recommend-date` after all focused tests and validation pass.
- [ ] Exercise a Naver recommendation, verify an exact Kakao match exposes the review/map action, and verify a non-match remains hidden.
- [ ] Exercise “other place” on a Naver result and verify Naver-primary discovery telemetry plus persisted session success.
