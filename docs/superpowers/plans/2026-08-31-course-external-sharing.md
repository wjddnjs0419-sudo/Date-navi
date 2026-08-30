# Course External Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add revocable, cryptographically random course share links that resolve to a minimal public DTO without weakening `date_cards` RLS.

**Architecture:** A new RLS-protected `date_card_shares` table stores one active token per card. An authenticated, member-only RPC creates/reuses tokens; a separate `SECURITY DEFINER` RPC validates a token and projects only public course fields. Expo Router handles `/course/:shareToken`, while the existing Next.js `web/` app provides the browser fallback and keeps the same AASA domain.

**Tech Stack:** Expo Router 6, React Native, Next.js 15, Supabase Postgres/RPC/RLS, Jest.

**Spec:** User request in the conversation; existing invite implementation in `lib/couple-invite.ts`, `app/_layout.tsx`, `web/app/invite`, and `web/app/.well-known/apple-app-site-association`.

## Global Constraints

- Never add a public SELECT policy to `date_cards`.
- Never expose `service_role` to the app or web browser.
- Public access is only through `get_public_shared_course(text)` and returns no internal IDs or metadata.
- Share creation is authenticated and limited to a current `date_planner_couples` member.
- Invalid and revoked tokens produce the same not-found behavior.
- Security-definer functions use `set search_path = ''` and schema-qualified references.
- Use existing Expo design tokens/components and avoid new dependencies.
- Run `npm run validate`, relevant Jest tests, and `cd web && npm run typecheck` before completion.

### Task 1: Database share table and RPC contracts

**Files:**
- Create: `supabase/migrations/20260830180250_date_card_shares.sql` (created with `supabase migration new`)
- Test: `__tests__/date-card-sharing-migration.test.ts`
- Test: `supabase/tests/20260830180250_date_card_shares.sql`

**Interfaces:**
- `public.create_date_card_share(p_card_id text) returns text` — authenticated member-only token create/reuse.
- `public.get_public_shared_course(p_share_token text) returns jsonb` — anon/authenticated token resolver.
- Public DTO keys: `title`, `summary`, `estimated_time`, `estimated_budget`, `steps`; each step only has `label`, optional `desc`, optional `place_name`.

- [x] Add failing Jest assertions for table/RLS/grants/function security, token entropy, public DTO field allowlist, and unchanged `date_cards` policy surface.
- [x] Add failing pgTAP-style SQL cases for member creation, non-member denial, anonymous valid resolver, invalid/revoked not-found, and DTO redaction.
- [x] Run the focused tests and observe the expected missing migration/function failures.
- [x] Implement the table with a unique token, one active share per card, `revoked_at`, member-only RLS, explicit grants, and `encode(extensions.gen_random_bytes(32), 'hex')` token generation.
- [x] Implement the authenticated create/reuse RPC with explicit membership checks and conflict-safe reuse.
- [x] Implement the public resolver RPC with token/revocation checks and an explicit JSON projection of sanitized step fields.
- [x] Run the focused tests. Local `supabase test db` was attempted but the local Postgres container was not running.

### Task 2: Shared app/web contract and route parsing

**Files:**
- Create: `lib/course-share.ts`
- Test: `__tests__/course-share-contract.test.ts`

**Interfaces:**
- `COURSE_SHARE_WEB_BASE` and `buildCourseShareUrl(token)`.
- `parseCourseShareTokenFromUrl(url)` with strict `/course/<token>` matching and no query-string fallback.
- `CourseShareDto` and `CourseShareStep` allowlist types.
- `buildCourseShareMessage(dto, token)` for the native share payload.

- [x] Test valid/invalid URL parsing, URL construction, message ordering, and rejection of internal DTO keys.
- [x] Implement the pure contract helpers with a 64-hex-token validation boundary.
- [x] Run the focused contract tests.

### Task 3: Expo public course screen and Universal Link routing

**Files:**
- Create: `app/course/_layout.tsx`
- Create: `app/course/[shareToken].tsx`
- Modify: `app/_layout.tsx`
- Test: `__tests__/course-share-screen.test.tsx`
- Test: `__tests__/course-share-routing.test.ts`
- Modify: `web/app/.well-known/apple-app-site-association/route.ts`

- [x] Add failing route/screen tests for parameter extraction, resolver-only loading, no auth requirement, and invalid/revoked not-found state.
- [x] Implement the screen using `supabase.rpc('get_public_shared_course', { p_share_token: shareToken })`, `CourseStepList`, and token-only public data.
- [x] Update root initial URL and URL-event handling so `/course/<token>` is routed before session onboarding redirects; preserve the invite flow unchanged.
- [x] Add `/course/*` to AASA alongside `/invite` and preserve the existing appID.
- [x] Run the focused screen/routing tests.

### Task 4: Authenticated native share flow

**Files:**
- Modify: `app/share/send.tsx`
- Test: `__tests__/share-send-screen.test.tsx`

- [x] Add failing assertions that native share calls `create_date_card_share`, includes `/course/<token>`, lists places in order, and calls `logEvent('native_share_opened')` without identifying parameters.
- [x] Implement token issuance through the member-only RPC and build the share message from the already-fetched card DTO.
- [x] Keep token issuance separate from `soft_messages` and preserve existing proposal analytics.
- [x] Run the focused share screen test.

### Task 5: Next.js web fallback

**Files:**
- Create: `web/lib/course-share.ts`
- Create: `web/app/course/[shareToken]/page.tsx`
- Test: `__tests__/web-course-share-contract.test.ts`

- [x] Add failing tests for anon RPC request shape, allowlisted DTO mapping, and identical not-found handling for invalid/revoked responses.
- [x] Implement a server-rendered page that calls the RPC with the publishable/anon key only, renders title/summary/steps, and does not expose internal fields.
- [x] Add metadata using the public title without token/card identifiers beyond the route URL.
- [x] Run the web typecheck and focused contract tests.

### Task 6: Full verification and security review

- [x] Run `npm test -- --runInBand` and `npm run validate`.
- [x] Run `cd web && npm run typecheck && npm run build`.
- [x] Run linked `supabase db lint` and `supabase db push --linked --dry-run`; local pgTAP could not run because local Postgres was unavailable.
- [x] Inspect the final diff for `date_cards` RLS changes, service-role exposure, token logging/analytics, and accidental DTO expansion.
- [x] Record deployment steps for Supabase migration, Vercel web deployment/env vars, AASA hosting, and an iOS build/release.
