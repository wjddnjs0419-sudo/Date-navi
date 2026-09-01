# Date Navi Loginless Demo Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-to-server `recommend-demo` endpoint that reuses the mobile recommendation pipeline while enforcing anonymous quotas and exposing no mobile session or internal candidate identifier.

**Architecture:** A new Edge Function authenticates only Vercel with a shared token, validates the web contract, and invokes the existing recommendation handler with a synthetic web principal and a separate service-role rate-limit adapter. The response keeps retry context server-only; the browser-facing Vercel handler strips it in the web UI plan.

**Tech Stack:** Supabase Edge Functions, Deno, TypeScript, Zod-compatible schemas, PostgreSQL RPC, Jest/Deno tests, HMAC-SHA-256

**Spec:** `docs/superpowers/specs/2026-08-31-date-navi-web-separation-and-walking-routes-design.md`

## Global Constraints

- Mobile `recommend-date`, its authenticated quota, history, and attestation behavior must remain unchanged.
- Reuse `_shared` Naver-first/Kakao-fallback search and recommendation selection; do not copy the algorithm.
- Accept only Vercel server requests bearing `WEB_DEMO_INTERNAL_TOKEN`.
- Store visitor and network HMAC hashes only; never store raw IP or free-input text.
- Limit visitor usage to 3 per rolling 24 hours, network usage to 30, concurrency to 1, stale locks to 120 seconds, and retries to 1.
- Limit location autocomplete to 60 requests per visitor, 300 per network hash, and 3,000 globally per rolling 24 hours.
- The global daily cap is `WEB_DEMO_GLOBAL_DAILY_LIMIT` and must be below the ORS worst-case capacity chosen for Production.

---

### Task 1: Define and test the web contract

**Files:**
- Create: `shared/recommendation/web-demo-contracts.ts`
- Create: `shared/recommendation/__tests__/web-demo-contracts.test.ts`

**Interfaces:**
- Produces: `webDemoRecommendationRequestSchema`, `WebDemoRecommendationRequest`, `toRecommendationRequest`, `WebDemoInternalResponse`, and `toPublicWebDemoResponse`.

- [ ] **Step 1: Write failing schema tests**

Test that 2–4 steps, valid categories, one intent tag per step, `kakao | current` location source, coordinate ranges, ISO-like meeting time, language, and `5 | 10 | 20` pass; test that five steps, 41-character tags, unknown categories, out-of-range coordinates, and extra keys fail. Test that `toRecommendationRequest` generates `requestId`, `mode: course`, category labels, `location.source`, and the existing localized meeting-time note without losing a custom `intentTags` value. Test that `toPublicWebDemoResponse` removes `candidateId`, `sessionId`, and `retryContext` recursively.

```ts
expect(webDemoRecommendationRequestSchema.safeParse(validRequest).success).toBe(true);
expect(webDemoRecommendationRequestSchema.safeParse({ ...validRequest, courseSteps: [] }).success).toBe(false);
expect(JSON.stringify(toPublicWebDemoResponse(internal))).not.toMatch(/candidateId|sessionId|retryContext/);
```

- [ ] **Step 2: Run the focused test and confirm failure**

```powershell
npm test -- --runInBand shared/recommendation/__tests__/web-demo-contracts.test.ts
```

Expected: FAIL because `web-demo-contracts.ts` does not exist.

- [ ] **Step 3: Implement the exact public types**

Define `WebDemoRecommendationRequest` exactly as the spec, `WebDemoPlace` with `stepId`, `order`, `name`, `address`, `category`, `latitude`, `longitude`, `provider`, `mapUrl`, optional `rating` and `photoUrl`, and `WebDemoInternalResponse` with `{ course, metadata, retryContext }`. Make schemas strict and preserve only fields required for one bounded server retry. Implement `toRecommendationRequest(input, requestIdFactory)` so only the server generates internal IDs and labels.

- [ ] **Step 4: Verify and commit**

```powershell
npm test -- --runInBand shared/recommendation/__tests__/web-demo-contracts.test.ts
git add shared/recommendation/web-demo-contracts.ts shared/recommendation/__tests__/web-demo-contracts.test.ts
git commit -m "feat: define public web recommendation contract"
```

### Task 2: Add isolated anonymous rate limiting

**Files:**
- Create: `supabase/migrations/20260831190000_web_demo_rate_limits.sql`
- Create: `supabase/functions/_shared/web-demo-rate-limit.ts`
- Create: `supabase/functions/_shared/__tests__/web-demo-rate-limit.test.ts`

**Interfaces:**
- Consumes: `visitorHash`, `networkHash`, `requestId`, and configured global limit.
- Produces: `acquireWebDemoPermit(): Promise<{ permitId: string; ownerToken: string }>` and `finishWebDemoPermit(permitId, ownerToken, outcome): Promise<void>`.

- [ ] **Step 1: Write adapter tests**

Cover allowed acquisition, visitor daily rejection, network daily rejection, global rejection, two simultaneous acquisitions where exactly one wins, active-lock rejection, 119-second rejection, 121-second stale-lock takeover, wrong-owner release rejection, owner compare-and-delete release, success consumption, and failure release. Assert no query is made against the authenticated mobile quota RPC.

- [ ] **Step 2: Run the focused test and confirm failure**

```powershell
npm test -- --runInBand supabase/functions/_shared/__tests__/web-demo-rate-limit.test.ts
```

- [ ] **Step 3: Create service-role-only tables and RPCs**

The migration creates `web_demo_usage` and `web_demo_permits` keyed by opaque hashes, revokes all access from `anon` and `authenticated`, grants only `service_role`, and implements atomic acquire/finish RPCs. Acquisition performs check-and-increment plus owner-token lease creation in one transaction; finish deletes only where `permit_id` and `owner_token` both match. Takeover is allowed only when the stored lease is older than 120 seconds.

- [ ] **Step 4: Implement the adapter and stable error codes**

Map database outcomes to `WEB_DEMO_DAILY_LIMIT`, `WEB_DEMO_NETWORK_LIMIT`, `WEB_DEMO_GLOBAL_LIMIT`, and `WEB_DEMO_ALREADY_RUNNING`; never include either hash in thrown messages.

- [ ] **Step 5: Verify migration and commit**

```powershell
npx supabase db reset
npm test -- --runInBand supabase/functions/_shared/__tests__/web-demo-rate-limit.test.ts
git add supabase/migrations/20260831190000_web_demo_rate_limits.sql supabase/functions/_shared/web-demo-rate-limit.ts supabase/functions/_shared/__tests__/web-demo-rate-limit.test.ts
git commit -m "feat: enforce anonymous web demo quotas"
```

Expected: reset and focused tests pass; catalog inspection shows no grants to `anon` or `authenticated`.

### Task 3: Expose the existing location search to the web server

**Files:**
- Create: `supabase/functions/_shared/location-autocomplete-handler.ts`
- Modify: `supabase/functions/location-autocomplete/index.ts`
- Create: `supabase/functions/location-autocomplete-demo/index.ts`
- Create: `supabase/functions/location-autocomplete-demo/index.test.ts`
- Modify: `supabase/migrations/20260831190000_web_demo_rate_limits.sql`

**Interfaces:**
- Consumes: query of 2–80 characters, internal token, visitor hash, and network hash.
- Produces: at most eight existing `LocationDocument` values without exposing the Kakao key.

- [ ] **Step 1: Write authentication, quota, and ranking tests**

Test query length, token failure, 60th/61st visitor request, 300th/301st network request, 3,000th/3,001st global request, Kakao failure, maximum eight results, and the unchanged station/neighborhood/landmark ordering. Assert the mobile endpoint still requires a user JWT.

- [ ] **Step 2: Run and confirm failure**

```powershell
deno test --allow-env --allow-net supabase/functions/location-autocomplete-demo/index.test.ts
```

- [ ] **Step 3: Extract the provider-neutral handler and add quota counters**

Move Kakao fetch/normalization into `handleLocationAutocomplete(query, fetcher)`. Add atomic `location_search` counters to the same service-role-only migration, keyed only by visitor/network hashes and a 24-hour window.

- [ ] **Step 4: Implement the internal-only wrapper**

Require constant-time-valid `WEB_DEMO_INTERNAL_TOKEN`, exact 64-hex visitor/network headers, JSON under 1KB, and a 2–80 character query. Return only normalized documents. Keep the authenticated mobile wrapper and its output unchanged.

- [ ] **Step 5: Verify and commit**

```powershell
deno test --allow-env --allow-net supabase/functions/location-autocomplete-demo/index.test.ts
npm run validate
git add supabase/functions/_shared/location-autocomplete-handler.ts supabase/functions/location-autocomplete supabase/functions/location-autocomplete-demo supabase/migrations/20260831190000_web_demo_rate_limits.sql
git commit -m "feat: add rate-limited web location search"
```

### Task 4: Reuse the recommendation runtime from a new Edge Function

**Files:**
- Create: `supabase/functions/_shared/recommend-date-runtime.ts`
- Modify: `supabase/functions/recommend-date/index.ts`
- Create: `supabase/functions/recommend-demo/index.ts`
- Create: `supabase/functions/recommend-demo/deno.json`
- Create: `supabase/functions/recommend-demo/index.test.ts`

**Interfaces:**
- Consumes: `createRecommendationRuntime({ principal, rateLimit, persistHistory, requireAttestation })`.
- Produces: an internal-only `POST /recommend-demo` response plus `retryContext`; accepts `attempt: 0 | 1`, default `0`.

- [ ] **Step 1: Write endpoint tests**

Test missing/invalid token `401`, invalid body `400`, initial quota rejection `429`, `attempt: 2` rejection `400`, successful Naver result, Kakao fallback result, and mobile session/candidate ID removal by the public serializer. Assert attempt `1` skips visitor/network consumption but still counts against the global cap. Test that an allowed Production/Preview origin receives CORS headers and an unrelated origin does not.

- [ ] **Step 2: Run and confirm the tests fail**

```powershell
npx supabase functions serve recommend-demo --env-file supabase/.env.test
deno test --allow-env --allow-net supabase/functions/recommend-demo/index.test.ts
```

Expected: FAIL/404 before the new function exists.

- [ ] **Step 3: Extract only dependency construction**

Move the provider and handler dependency wiring from `recommend-date/index.ts` into `createRecommendationRuntime`. Keep the existing authenticated wrapper, response shape, CORS, history, attestation, and mobile rate-limit adapter unchanged.

- [ ] **Step 4: Implement `recommend-demo`**

Use constant-time token comparison; require `x-web-demo-visitor` and `x-web-demo-network` to match `/^[a-f0-9]{64}$/`; validate the body; acquire a permit; call the shared handler with principal `web-demo:<visitorHash>` and persistence disabled; finish the permit in `finally`. Allow one replacement attempt only when Vercel supplies the same hashes and `attempt: 1`. Build CORS headers only for `https://date-navi.vercel.app`, `NEXT_PUBLIC_SITE_ORIGIN`, and Vercel Preview hosts matching the project suffix; server-to-server requests without `Origin` remain accepted when the internal token is valid.

- [ ] **Step 5: Run focused and mobile regression tests**

```powershell
deno test --allow-env --allow-net supabase/functions/recommend-demo/index.test.ts
npm test -- --runInBand supabase/functions/_shared/__tests__/recommend-date-handler.test.ts
npm run validate
```

Expected: all pass and existing `recommend-date` snapshots remain unchanged.

- [ ] **Step 6: Commit**

```powershell
git add supabase/functions/_shared/recommend-date-runtime.ts supabase/functions/recommend-date/index.ts supabase/functions/recommend-demo supabase/functions/recommend-demo/index.test.ts
git commit -m "feat: add loginless recommendation edge endpoint"
```

### Task 5: Permit internal AI selection without a user JWT

**Files:**
- Modify: `supabase/functions/generate-ai/index.ts`
- Modify: `supabase/functions/_shared/recommend-date-downstream.ts`
- Create: `supabase/functions/generate-ai/internal-web-demo.test.ts`

**Interfaces:**
- Consumes: valid `x-internal-ai-token` and `x-ai-principal: web-demo` from `recommend-demo` only.
- Produces: AI selection without an authenticated user row or user-specific prompt log.

- [ ] **Step 1: Write authentication matrix tests**

Cover mobile JWT only, mobile JWT plus internal token, valid internal token plus `web-demo`, invalid token plus `web-demo`, and neither credential. Only the first three permitted cases may reach `recommend_date_select`; the web case must not insert a `user_id` log.

- [ ] **Step 2: Run and confirm the web case fails**

```powershell
deno test --allow-env --allow-net supabase/functions/generate-ai/internal-web-demo.test.ts
```

- [ ] **Step 3: Implement the narrow internal principal path**

Authenticate either the unchanged mobile user path or the conjunction of constant-time-valid internal token and exact principal `web-demo`. Reject every other internal principal and keep non-recommendation AI actions user-authenticated.

- [ ] **Step 4: Verify, scan, and commit**

```powershell
deno test --allow-env --allow-net supabase/functions/generate-ai/internal-web-demo.test.ts
npm run validate
rg -n "candidateId|sessionId|rawIp|x-forwarded-for" supabase/functions/recommend-demo shared/recommendation/web-demo-contracts.ts
git add supabase/functions/generate-ai/index.ts supabase/functions/generate-ai/internal-web-demo.test.ts supabase/functions/_shared/recommend-date-downstream.ts
git commit -m "feat: authorize internal web demo selection"
```

Expected: tests and validation pass; scan matches only explicit stripping assertions or approved server-only retry fields.

### Task 6: Deploy the additive backend safely

**Files:**
- Modify: Supabase secrets and deployed functions; no Production web change.

**Interfaces:**
- Produces: deployed `recommend-demo` callable only by the future Vercel server route.

- [ ] **Step 1: Set secrets without printing their values**

```powershell
npx supabase secrets set WEB_DEMO_INTERNAL_TOKEN
npx supabase secrets set WEB_DEMO_GLOBAL_DAILY_LIMIT=500
npx supabase secrets set WEB_DEMO_LOCATION_GLOBAL_DAILY_LIMIT=3000
```

- [ ] **Step 2: Apply the migration and deploy additive functions**

```powershell
npx supabase db push
npx supabase functions deploy generate-ai
npx supabase functions deploy recommend-date
npx supabase functions deploy recommend-demo --no-verify-jwt
npx supabase functions deploy location-autocomplete-demo --no-verify-jwt
```

- [ ] **Step 3: Run smoke tests**

Verify: direct requests without the internal token return `401`; valid server requests return locations and a course; the 61st location query and fourth initial recommendation for one visitor hash return `429`; authenticated mobile location search and recommendation still succeed. Record only status codes and request IDs, never secrets or hashes.
