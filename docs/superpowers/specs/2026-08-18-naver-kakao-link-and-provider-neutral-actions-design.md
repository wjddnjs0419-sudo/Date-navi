# Naver-to-Kakao link and provider-neutral actions

## Goal

Restore map/review links only when a Naver discovery result has a high-confidence Kakao match. Restore "other places" without requiring a Kakao place ID.

## Identity policy

The recommendation identity remains `{ provider: 'naver', providerPlaceId }`. A matched `kakaoPlaceId` is optional link metadata only; it never replaces identity and is not persisted as a canonical entity merge.

## Link matching

For each Naver candidate, search Kakao with its name and road address. Accept exactly one Kakao result only when normalized names match, normalized road addresses match, and coordinates are within a strict local threshold. Ambiguous, incomplete, or distant results yield no Kakao link. The UI exposes review/map only when the optional link is present.

## Other-place flow

For a Naver-backed session, replacement discovery reuses the Naver-first sufficiency loop, then writes provider-scoped selected places through additive session fields. Existing Kakao sessions retain the existing RPC and Kakao candidate path unchanged.

## Failure and rollback

Kakao matching failure is non-fatal and only hides the map/review action. Naver replacement failure returns fewer quality-qualified candidates; it does not relax the quality gate or fall back to an unverified place. A feature flag can return Naver sessions to the current disabled actions while preserving existing Kakao behavior.

## Verification

Tests cover an accepted exact match, each rejected mismatch, ambiguous results, Naver map-action visibility, Naver replacement discovery, and no regression for legacy Kakao sessions.
