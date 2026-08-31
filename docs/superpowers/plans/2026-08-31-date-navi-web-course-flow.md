# Date Navi Web Five-Step Course Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the standalone homepage into a loginless, responsive five-step Date Navi course builder with the mobile keyword behavior and branded loading experience.

**Architecture:** A reducer owns the typed five-step draft; focused React components render the fixed left panel while a map placeholder occupies the right. A same-origin Route Handler owns the anonymous cookie, hashes the visitor/network identifiers, calls `recommend-demo`, and returns only the public contract.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, CSS Modules, Vitest, Testing Library, Web Crypto, Supabase Edge Function

**Spec:** `docs/superpowers/specs/2026-08-31-date-navi-web-separation-and-walking-routes-design.md`

## Global Constraints

- Implement exactly five steps: course, location, date/time, mood, review.
- Course length is 2–4 and order is preserved; each category uses the approved mobile keywords and personal input limits.
- Keep routes `/invite`, `/course/[shareToken]`, `/support`, `/privacy`, `/api/og`, and AASA working.
- Desktop uses a fixed left panel plus map; at narrow widths, inputs/results precede the map; 320px must not overflow.
- Use Inter and the exact brand tokens from the spec; ordinary cards have 22px radius and no shadow.
- Browser code receives no Supabase service key, provider key, ORS key, HMAC secret, internal token, candidate ID, or mobile session ID.

---

### Task 1: Install the web test harness and brand tokens

**Files:**
- Create: `styles/tokens.css`
- Create: `vitest.config.ts`
- Create: `test/setup.ts`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: semantic CSS variables and `npm test` using jsdom.

- [ ] **Step 1: Install test dependencies**

```powershell
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Add `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 2: Define exact semantic tokens**

```css
:root {
  --canvas: #fff9fc; --loading-bg: #fff1f6; --surface: #fff;
  --brand: #f26b7a; --brand-deep: #c24b57; --brand-subtle: #ffeef0;
  --text: #3b2e2e; --text-secondary: #8a7f76; --border: #f2e0dc;
  --radius-card: 22px; --radius-input: 16px; --radius-cta: 18px;
}
```

Load Inter through `next/font/google`; set box sizing and body canvas globally; add no component-specific colors here.

- [ ] **Step 3: Configure Vitest and verify setup**

Create one smoke test rendering a button and asserting it is accessible by role. Run `npm test`; expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts test/setup.ts styles/tokens.css app/globals.css app/layout.tsx
git commit -m "test: establish web UI harness and tokens"
```

### Task 2: Implement the typed five-step reducer and catalog

**Files:**
- Create: `features/course-builder/course-types.ts`
- Create: `features/course-builder/course-catalog.ts`
- Create: `features/course-builder/course-reducer.ts`
- Create: `features/course-builder/course-reducer.test.ts`

**Interfaces:**
- Produces: `CourseDraft`, `CourseAction`, `courseReducer`, `validateStep(draft, step): string[]`, and `buildWebDemoRequest(draft)`.

- [ ] **Step 1: Write reducer tests**

Test adding/removing/reordering 2–4 steps, one selected keyword per step, personal keyword normalization, `ai_decide`, `kakao | current` location source and coordinates, meeting time, six moods plus recommendation opt-out, max walking `5 | 10 | 20`, and request serialization without UI-only fields.

```ts
expect(courseReducer(initialDraft, { type: 'addStep', category: 'cafe' }).courseSteps).toHaveLength(3);
expect(validateStep(validDraft, 'review')).toEqual([]);
expect(buildWebDemoRequest(validDraft).courseSteps[0]).toEqual({ id: 'step-1', category: 'meal', intentTags: ['한식'] });
```

- [ ] **Step 2: Confirm tests fail, then implement the catalog**

```powershell
npm test -- features/course-builder/course-reducer.test.ts
```

Use the exact Korean/English values from `shared/recommendation/step-intent-tag-catalog.ts`: meal, cafe, drinks, activity, culture, walk, and `ai_decide`. Keep custom input at 40 characters after NFKC normalization.

- [ ] **Step 3: Implement reducer validation and serialization**

Use discriminated actions and immutable updates. `buildWebDemoRequest` must throw when `validateStep(draft, 'review')` is non-empty and must output the approved request contract.

- [ ] **Step 4: Verify and commit**

```powershell
npm test -- features/course-builder/course-reducer.test.ts
git add features/course-builder/course-types.ts features/course-builder/course-catalog.ts features/course-builder/course-reducer.ts features/course-builder/course-reducer.test.ts
git commit -m "feat: model the five-step course builder"
```

### Task 3: Build the responsive five-step interface

**Files:**
- Create: `features/course-builder/course-builder.tsx`
- Create: `features/course-builder/course-builder.module.css`
- Create: `features/course-builder/steps/course-step.tsx`
- Create: `features/course-builder/steps/location-step.tsx`
- Create: `features/course-builder/steps/datetime-step.tsx`
- Create: `features/course-builder/steps/mood-step.tsx`
- Create: `features/course-builder/steps/review-step.tsx`
- Create: `features/course-builder/course-builder.test.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: Task 2 reducer and `onRecommend(request)`.
- Produces: keyboard-accessible homepage flow and a right-side `data-testid="map-region"` placeholder.

- [ ] **Step 1: Write interaction tests**

Test that Next is disabled until each step is valid; category changes update keyword chips; reorder buttons change review order; Back retains data; submit calls `onRecommend` once; pressing Enter does not bypass validation; 5-step progress exposes `aria-current="step"`.

- [ ] **Step 2: Run and confirm tests fail**

```powershell
npm test -- features/course-builder/course-builder.test.tsx
```

- [ ] **Step 3: Implement focused step components**

Use native buttons, labels, date/time inputs, fieldsets, and visible focus rings. Provide Korean copy by default and English labels from the same catalog. Use text `최대 도보 시간은 우선 반영 기준이에요` rather than a guarantee.

- [ ] **Step 4: Implement layout and homepage integration**

At `min-width: 900px`, use `grid-template-columns: minmax(360px, 460px) 1fr` and `min-height: 100dvh`; below 900px stack the panel before a `min-height: 360px` map region. Preserve header links to support and privacy.

- [ ] **Step 5: Verify and commit**

```powershell
npm test -- features/course-builder
npm run typecheck
git add app/page.tsx features/course-builder
git commit -m "feat: add desktop five-step recommendation flow"
```

### Task 4: Port the branded loading experience

**Files:**
- Copy: `assets/illustrations/mascot-heart-loading-preference.png` to `public/illustrations/mascot-heart-loading-preference.png`
- Copy: `assets/illustrations/mascot-heart-loading-places.png` to `public/illustrations/mascot-heart-loading-places.png`
- Copy: `assets/illustrations/mascot-heart-loading-route.png` to `public/illustrations/mascot-heart-loading-route.png`
- Copy: `assets/illustrations/mascot-heart-loading-finish.png` to `public/illustrations/mascot-heart-loading-finish.png`
- Create: `features/course-builder/recommendation-loading.tsx`
- Create: `features/course-builder/recommendation-loading.test.tsx`

**Interfaces:**
- Produces: `getLoadingStage(progress)` and `RecommendationLoading({ progress, draft })`.

- [ ] **Step 1: Copy the four source-controlled images and their attribution/license note**

Copy only the four named PNG files from `Date-navi/assets/illustrations`. Add their existing attribution/license text to `public/illustrations/README.md`; do not invent new provenance.

- [ ] **Step 2: Write stage-boundary tests**

```ts
expect([0, 24].map(getLoadingStage)).toEqual([0, 0]);
expect([25, 52].map(getLoadingStage)).toEqual([1, 1]);
expect([53, 76].map(getLoadingStage)).toEqual([2, 2]);
expect([77, 100].map(getLoadingStage)).toEqual([3, 3]);
```

Also assert the live region contains region, meeting time, and mood and that reduced motion disables transition classes.

- [ ] **Step 3: Implement loading progress**

Show `둘에게 맞는 코스를 찾고 있어요` and `취향 분석 → 장소 탐색 → 동선 정리 → 코스 완성`. Advance displayed progress by 1 every 80ms up to 90 while awaiting the request, then by 4 every 80ms to 100 after success. Never draw a placeholder route during loading.

- [ ] **Step 4: Verify and commit**

```powershell
npm test -- features/course-builder/recommendation-loading.test.tsx
git add public/illustrations features/course-builder/recommendation-loading.tsx features/course-builder/recommendation-loading.test.tsx
git commit -m "feat: port Date Navi recommendation loading"
```

### Task 5: Add the same-origin recommendation boundary

**Files:**
- Create: `lib/server/env.ts`
- Create: `lib/server/anonymous-identity.ts`
- Create: `lib/server/recommend-demo-client.ts`
- Create: `lib/server/location-demo-client.ts`
- Create: `app/api/demo/recommend/route.ts`
- Create: `app/api/demo/recommend/route.test.ts`
- Create: `app/api/demo/locations/route.ts`
- Create: `app/api/demo/locations/route.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: public request from Task 2.
- Produces: `POST /api/demo/recommend`; HttpOnly cookie `dn_demo_id`; public course response only.

- [ ] **Step 1: Extend `.env.example`**

```dotenv
SUPABASE_URL=
SUPABASE_ANON_KEY=
WEB_DEMO_INTERNAL_TOKEN=
WEB_DEMO_HMAC_SECRET=
WEB_DEMO_GLOBAL_DAILY_LIMIT=500
WEB_DEMO_LOCATION_GLOBAL_DAILY_LIMIT=3000
NEXT_PUBLIC_MAP_STYLE_URL=
NEXT_PUBLIC_SITE_ORIGIN=http://localhost:3000
NEXT_PUBLIC_APP_STORE_URL=
```

- [ ] **Step 2: Write Route Handler tests**

Test strict JSON/content-length validation, new secure HttpOnly SameSite=Lax cookie, stable visitor HMAC, network-prefix HMAC, Edge token forwarding, `429` retry metadata, timeout mapping, and recursive stripping of `retryContext`, `candidateId`, and `sessionId`.

For `/api/demo/locations`, test a two-character minimum, 80-character maximum, eight-result cap, shared anonymous identity headers, timeout mapping, and `429` response. The public result contains only `source`, `kakaoPlaceId`, `label`, optional `address`, `latitude`, `longitude`, and `kind`.

- [ ] **Step 3: Implement identity hashing**

Generate a random 128-bit cookie identifier. HMAC the cookie and normalized network prefix using `WEB_DEMO_HMAC_SECRET`; for IPv4 retain `/24`, for IPv6 retain `/56`; never log or return the original address. Read Vercel forwarding headers only inside the Route Handler.

- [ ] **Step 4: Implement the server client and handler**

Abort the Edge request after 25 seconds, forward the two 64-hex hashes and internal token, pass `attempt: 0`, and return sanitized JSON. Map limit codes to `429`, malformed input to `400`, upstream timeout to `504`, and other upstream failure to `502`.

Implement `/api/demo/locations` with a 5-second timeout and the same identity hashes. In `location-step.tsx`, search at two characters with a 300ms debounce, discard stale responses, show at most eight suggestions, and support `navigator.geolocation` as the explicit `현재 위치` action; do not persist recent locations in the loginless web MVP.

- [ ] **Step 5: Connect UI, verify, and commit**

```powershell
npm test -- app/api/demo/recommend/route.test.ts app/api/demo/locations/route.test.ts features/course-builder
npm run check
git add .env.example lib/server app/api/demo features/course-builder app/page.tsx
git commit -m "feat: connect loginless web recommendations"
```

Expected: one browser submission shows loading then course data; secrets and internal fields are absent from response bodies and client bundles.
