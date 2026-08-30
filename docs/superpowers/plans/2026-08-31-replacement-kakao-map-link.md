# Replacement Kakao Map Link Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make provider-neutral replacement candidates use the same verified Kakao detail-link enrichment and Naver fallback priority as initial recommendations.

**Architecture:** Keep the provider-scoped identity `(provider, providerPlaceId)` unchanged. Reuse `resolveKakaoPlaceLinkDetailed()` and `searchKakaoPlacesForLinkDetailed()` for Naver replacement candidates, storing a successful Kakao ID and URL as optional link metadata. The screen and apply path choose that Kakao URL when present; a failed match preserves a trusted Naver URL or builds a name-only Naver search URL.

**Tech Stack:** Expo React Native, TypeScript, Jest, Supabase Edge Functions (Deno), existing provider-neutral place contracts.

**Spec:** User request: “Date Navi replacement 후보 리뷰·지도 보기 동작을 최초 추천 장소와 동일한 방식으로 개선”.

## Global Constraints

- Reuse the existing Kakao matching algorithm; do not implement a second name/address/coordinate matcher.
- Keep Naver `providerPlaceId` as the stable provider identity; never construct a Naver detail URL from the local SHA-256 identity.
- For Naver candidates use this order: verified Kakao match → trusted Naver URL → Naver name-only search → address-only fallback.
- Keep Kakao link metadata separate from provider identity and persist it through `current_kakao_link_place_id`.
- Run `npm run validate`, targeted tests, full Jest, and `git diff --check` before completion.

## Files and ownership

### Create

- `supabase/functions/_shared/provider-neutral-replacement-link.ts` — adapter around the existing detailed Kakao resolver.
- `__tests__/provider-neutral-replacement-link.test.ts` — verifies the adapter uses the established matching behavior.
- `__tests__/naver-map-link.test.ts` — verifies name-first Naver search URL construction.

### Modify

- `shared/recommendation/naver-map-link.ts` — change fallback query precedence to name-first.
- `supabase/functions/provider-neutral-replacements/index.ts` — enrich Naver list candidates and persist verified secondary Kakao metadata during apply.
- `app/mode-flow/course-result.tsx` — accept optional Kakao link metadata on provider-neutral candidates and open the enriched URL.
- `__tests__/course-result-screen.test.tsx` — update name-only fallback expectation and add Kakao-enriched Naver replacement coverage.
- `__tests__/replacementCandidatesWiring.test.ts` — assert Edge wiring and provider/link separation.

## Implementation tasks

### Task 1: Lock the URL fallback behavior with a failing test

**Files:** `__tests__/naver-map-link.test.ts`, `shared/recommendation/naver-map-link.ts`

- [ ] Add tests that expect `buildNaverMapSearchUrl('티티티', '부산광역시 수영구 ...')` to encode only `티티티`, and that an empty name falls back to the address.
- [ ] Run the targeted test and verify it fails because the current helper concatenates name and address.
- [ ] Change the helper to use `name?.trim() || address?.trim()`.
- [ ] Re-run the targeted test and the existing `placeBrowser` tests.

### Task 2: Extract the existing Kakao resolver behind a replacement adapter

**Files:** `supabase/functions/_shared/provider-neutral-replacement-link.ts`, `__tests__/provider-neutral-replacement-link.test.ts`

- [ ] Add a test with a Naver `NormalizedPlace` and an equivalent Kakao result, asserting the adapter returns `{ kakaoPlaceId, mapUrl }`.
- [ ] Add a test that an unmatched/ambiguous result returns no link, preserving the resolver's fail-closed behavior.
- [ ] Run the targeted test and verify it fails before the adapter exists.
- [ ] Implement the adapter by calling `resolveKakaoPlaceLinkDetailed()` directly; accept the existing `searchKakao` callback so Edge request-level caching remains outside the matching algorithm.
- [ ] Re-run the targeted test and confirm the existing resolver's address/name/coordinate checks are used.

### Task 3: Enrich and persist provider-neutral replacement candidates

**Files:** `supabase/functions/provider-neutral-replacements/index.ts`, `__tests__/replacementCandidatesWiring.test.ts`

- [ ] Add a failing wiring assertion for the existing resolver adapter, `searchKakaoPlacesForLinkDetailed`, optional `kakaoPlaceId`, and `current_kakao_link_place_id`.
- [ ] Create a per-list-request Kakao search promise cache, matching the initial recommendation implementation.
- [ ] Enrich only Naver candidates after filtering/limiting; on success attach `kakaoPlaceId` and `kakaoMapUrl` while leaving the provider's `mapUrl` intact. Keep the candidate provider and providerPlaceId unchanged. On failure leave the candidate's Naver URL unchanged.
- [ ] Keep Kakao fallback candidates unchanged.
- [ ] On apply, write a linked Naver candidate's Kakao ID to `current_kakao_link_place_id`, keep `current_kakao_place_id` null, emit the optional `kakaoPlaceId` in course/cards, and persist the selected map URL. For an unlinked Naver candidate clear the link; for Kakao candidates keep the normal Kakao identity path.
- [ ] Re-run the wiring and relevant replacement tests.

### Task 4: Make the screen honor enriched replacement metadata

**Files:** `app/mode-flow/course-result.tsx`, `__tests__/course-result-screen.test.tsx`

- [ ] Add a failing screen test where a provider-neutral candidate has a Naver provider identity plus `kakaoPlaceId` and a Kakao `mapUrl`, and assert the browser opens that Kakao URL.
- [ ] Extend `ProviderReplacementCandidate` with optional `kakaoPlaceId`; pass it and its `mapUrl` through `replacementCandidatePlaceRef`.
- [ ] Update the existing no-map-url expectation to the name-only Naver search URL.
- [ ] Re-run the focused screen tests, including Kakao candidate links and provider-neutral fallback links.

### Task 5: Full verification

- [ ] Run targeted link, replacement, and screen tests.
- [ ] Run `npm run validate`.
- [ ] Run `npx jest --runInBand`.
- [ ] Run `git diff --check` and inspect the final diff for accidental identity changes or Naver IDs used as URL IDs.

## Expected final behavior

- Naver replacement candidate with a verified Kakao match opens the Kakao detail URL and retains Naver provider identity.
- Naver replacement candidate without a match opens a trusted Naver URL, otherwise a name-only Naver search, otherwise an address-only search.
- Applying a linked Naver replacement preserves its optional link through session hydration without turning it into a Kakao-owned place.
- Kakao replacement behavior remains unchanged.
