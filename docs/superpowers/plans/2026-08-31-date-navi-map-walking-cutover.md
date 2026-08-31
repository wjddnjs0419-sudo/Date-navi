# Date Navi Map, Walking Route, and Production Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render recommendation places and clusters on MapLibre, add real openrouteservice walking legs with one bounded replacement, and move the existing Vercel Production project to the new repository.

**Architecture:** Browser MapLibre consumes sanitized GeoJSON and synchronizes selection through `stepId`; all ORS calls remain in the Vercel Route Handler. The handler validates/caches route responses, performs at most one server-only replacement, and degrades to place-only results before the Git and Root Directory cutover.

**Tech Stack:** MapLibre GL JS, GeoJSON, openrouteservice Directions `foot-walking`, Next.js server cache, Vitest, Playwright, Vercel Preview/Production

**Spec:** `docs/superpowers/specs/2026-08-31-date-navi-web-separation-and-walking-routes-design.md`

## Global Constraints

- Use an OSM-based operational tile provider through `NEXT_PUBLIC_MAP_STYLE_URL`; never treat `tile.openstreetmap.org` as an unlimited Production CDN.
- Keep OSM attribution visible.
- Show real photo/rating only when provided; otherwise show a category illustration and `Date Navi 추천`, never fabricated data.
- A public request performs at most 2 recommendation selections and 2 ORS Directions calls.
- Never draw a straight connector as a walking route; route failure returns places with `status: unavailable`.
- Cache identical ordered waypoints plus `foot-walking` for at least 24 hours without user text, cookies, or IP in the key.
- Do not delete `Date-navi/web` until Production verification passes and an explicit cleanup PR is opened.

---

### Task 1: Normalize and test ORS walking routes

**Files:**
- Create: `lib/server/walking-route.ts`
- Create: `lib/server/walking-route.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `WalkingRoute`, `normalizeOrsRoute(response, stepIds, maxWalkingMinutes)`, and `getWalkingRoute(places, maximum)`.

- [ ] **Step 1: Add the secret variable**

Add `ORS_API_KEY=` to `.env.example`; never prefix it with `NEXT_PUBLIC_`.

- [ ] **Step 2: Write normalization tests**

Test a valid LineString and `n - 1` segments; meters/seconds preservation; maximum comparison by duration; malformed geometry; segment-count mismatch; missing coordinates; timeout; 429; and 5xx. Invalid/upstream cases must return `{ status: 'unavailable', provider: 'openrouteservice', profile: 'foot-walking' }` without geometry.

- [ ] **Step 3: Run and confirm failure**

```powershell
npm test -- lib/server/walking-route.test.ts
```

- [ ] **Step 4: Implement server-only ORS client and cache**

POST ordered `[longitude, latitude]` coordinates to `/v2/directions/foot-walking/geojson`, abort at 8 seconds, validate `features[0].geometry` and `segments`. Cache by SHA-256 of rounded coordinates and profile for `86400` seconds; do not cache unavailable responses longer than 60 seconds.

- [ ] **Step 5: Verify and commit**

```powershell
npm test -- lib/server/walking-route.test.ts
git add .env.example lib/server/walking-route.ts lib/server/walking-route.test.ts
git commit -m "feat: normalize cached walking directions"
```

### Task 2: Enforce one bounded walking replacement

**Files:**
- Create: `lib/server/recommendation-orchestrator.ts`
- Create: `lib/server/recommendation-orchestrator.test.ts`
- Modify: `app/api/demo/recommend/route.ts`

**Interfaces:**
- Consumes: internal Edge course plus server-only retry context from the initial selection.
- Produces: `{ course, walkingRoute }` with no internal fields and at most one replacement.

- [ ] **Step 1: Write orchestration tests**

Cover: route within maximum uses 1 selection/1 ORS call; no maximum uses 1/1; largest exceeded leg triggers exactly 1 retry and 1 more ORS call; retry still exceeded returns the second course with exceeded flags; no replacement candidate retains the first course; ORS failure returns places and no retry; every public response omits retry context and internal IDs.

- [ ] **Step 2: Run and confirm failure**

```powershell
npm test -- lib/server/recommendation-orchestrator.test.ts
```

- [ ] **Step 3: Implement bounded orchestration**

Call Edge attempt `0`, call ORS once, find the leg with maximum positive `durationSeconds - maxWalkingMinutes * 60`, and call Edge attempt `1` with the destination step and original candidate excluded while all other steps are locked. Call ORS once for the replacement. No loop or recursive retry is permitted.

- [ ] **Step 4: Sanitize and expose truthful status**

Return exceeded leg flags and `relaxedConstraints` after retry. On unavailable route, omit total/legs/geometry and include the Korean message `도보 경로를 잠시 불러오지 못했어요`; never synthesize distance or duration.

- [ ] **Step 5: Verify and commit**

```powershell
npm test -- lib/server/recommendation-orchestrator.test.ts app/api/demo/recommend/route.test.ts
git add lib/server/recommendation-orchestrator.ts lib/server/recommendation-orchestrator.test.ts app/api/demo/recommend/route.ts
git commit -m "feat: validate walking limits with one replacement"
```

### Task 3: Build the MapLibre map and synchronized results

**Files:**
- Create: `features/map/course-map.tsx`
- Create: `features/map/course-map.module.css`
- Create: `features/map/course-geojson.ts`
- Create: `features/map/course-geojson.test.ts`
- Create: `features/results/course-results.tsx`
- Create: `features/results/course-results.test.tsx`
- Modify: `features/course-builder/course-builder.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: public `course`, `WalkingRoute`, and shared `activeStepId` state.
- Produces: clustered exploration source, numbered final markers, route line, leg rows, and synchronized card/marker selection.

- [ ] **Step 1: Install MapLibre and write GeoJSON tests**

```powershell
npm install maplibre-gl
```

Test that place features contain `stepId`, order, category, label, and coordinates; route source appears only for `status: available`; missing photo/rating remains absent; cluster source uses `cluster: true` and displays `point_count_abbreviated`.

- [ ] **Step 2: Implement MapLibre lifecycle**

Create one map per mount, load `NEXT_PUBLIC_MAP_STYLE_URL`, keep attribution enabled, add/update sources after `load`, remove listeners/map on unmount, and fit final course bounds with padding. Use custom numbered DOM markers for the 2–4 final places and clustered circle/count layers for exploration data.

- [ ] **Step 3: Implement honest marker and result content**

Render order, category icon/color, place name, category label, optional verified `photoUrl`/`rating`, and otherwise category illustration plus `Date Navi 추천`. Render each available leg as `도보 {roundedMinutes}분 · {roundedMeters}m`; mark exceeded legs with text, not color alone.

- [ ] **Step 4: Synchronize selection**

Cards, markers, and leg controls read/write the same `activeStepId`. Selection updates `aria-selected`, scrolls the card into view, and calls `map.easeTo` unless Reduce Motion requests an immediate camera jump.

- [ ] **Step 5: Verify and commit**

```powershell
npm test -- features/map features/results
npm run typecheck
git add package.json package-lock.json features/map features/results features/course-builder/course-builder.tsx
git commit -m "feat: render synchronized course map and results"
```

### Task 4: Add privacy-safe analytics and browser verification

**Files:**
- Create: `lib/analytics.ts`
- Create: `tests/demo-flow.spec.ts`
- Modify: `features/course-builder/course-builder.tsx`
- Modify: `features/map/course-map.tsx`
- Modify: `features/results/course-results.tsx`

**Interfaces:**
- Produces: aggregate event names only and full browser coverage against mocked provider responses.

- [ ] **Step 1: Implement an allowlisted event function**

Allow only `demo_started`, `step_completed`, `recommend_succeeded`, `recommend_failed`, `recommend_limited`, `route_succeeded`, `route_failed`, `route_exceeded`, `result_selected`, and `app_store_clicked`. Payloads may contain step number, category, provider, error code, and counts; reject keys containing location text, keyword text, IP, cookie, coordinates, place name, or address.

- [ ] **Step 2: Write Playwright flows**

Mock `/api/demo/recommend` and verify Korean/English, 1280px desktop, 390px and 320px mobile, keyboard completion, loading live region, final markers, cluster count, route line, unavailable route message, 429 UI, and Reduce Motion. Keep existing public-route tests in the same run.

- [ ] **Step 3: Run browser verification**

```powershell
npm run check
```

Expected: unit tests, typecheck, production build, existing route tests, and demo flow tests all pass.

- [ ] **Step 4: Commit**

```powershell
git add lib/analytics.ts tests/demo-flow.spec.ts features/course-builder/course-builder.tsx features/map/course-map.tsx features/results/course-results.tsx
git commit -m "test: verify the complete public demo flow"
```

### Task 5: Preview capacity and failure gates

**Files:**
- Modify: Vercel Preview environment only.

**Interfaces:**
- Produces: a release candidate with real MapLibre, Edge recommendation, and ORS behavior.

- [ ] **Step 1: Set Preview environment variables**

```powershell
npx vercel env add SUPABASE_URL preview
npx vercel env add SUPABASE_ANON_KEY preview
npx vercel env add WEB_DEMO_INTERNAL_TOKEN preview
npx vercel env add WEB_DEMO_HMAC_SECRET preview
npx vercel env add WEB_DEMO_GLOBAL_DAILY_LIMIT preview
npx vercel env add WEB_DEMO_LOCATION_GLOBAL_DAILY_LIMIT preview
npx vercel env add ORS_API_KEY preview
npx vercel env add NEXT_PUBLIC_MAP_STYLE_URL preview
npx vercel env add NEXT_PUBLIC_SITE_ORIGIN preview
npx vercel env add NEXT_PUBLIC_APP_STORE_URL preview
npx vercel
```

- [ ] **Step 2: Verify real happy and degraded paths**

Run one complete recommendation and confirm 2–4 places, route attribution, leg count, and no browser-visible secrets. Then use Preview-only invalid ORS credentials, redeploy, and confirm places still render with `unavailable`; restore the valid credential immediately and redeploy.

- [ ] **Step 3: Check capacity settings**

Confirm the global cap is at most 500 initial recommendations/day, so the worst case is at most 1,000 ORS calls/day, below the cited 2,000/day Standard allowance. Confirm monitoring distinguishes ORS timeout, 429, 5xx, and walking-limit exceedance without raw input.

### Task 6: Cut over the existing Vercel project and retain rollback

**Files:**
- Modify: existing Vercel project Git integration and Root Directory.
- Create later: cleanup PR in `wjddnjs0419-sudo/Date-navi` removing `web/`.

**Interfaces:**
- Produces: `date-navi.vercel.app` served from `Date-navi-web`, with the old source retained until stability is confirmed.

- [ ] **Step 1: Record rollback state**

Record the current Production deployment URL, commit SHA, Git repository, Root Directory `web`, and all environment variable names. Do not copy secret values into the PR.

- [ ] **Step 2: Change only the Git source and root**

In the existing Vercel project, connect GitHub repository `wjddnjs0419-sudo/Date-navi-web`, set Root Directory to the repository root, and confirm Framework Preset is Next.js. Preserve the project ID and `date-navi.vercel.app` domain.

- [ ] **Step 3: Verify Production before declaring success**

Run `npm run test:e2e` with `PLAYWRIGHT_BASE_URL=https://date-navi.vercel.app`, then manually verify AASA content type/appID, OG PNG, invite app/store fallback, one real recommendation, ORS route, 429 message, narrow layout, and OSM attribution.

- [ ] **Step 4: Roll back on any release-blocking failure**

Promote the recorded previous deployment or reconnect the recorded old repository/root. Do not delete old `web/`; open an incident note with the failing URL and status only.

- [ ] **Step 5: Open the separate cleanup PR after stability**

After at least one verified Production cycle with no release blocker, open a `Date-navi` PR that removes only `web/` and updates repository docs to link `Date-navi-web`. Merge that PR independently from the Vercel cutover.
