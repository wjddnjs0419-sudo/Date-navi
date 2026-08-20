# Date Navi GA4 Analytics Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track production Date Navi screen views and the eight agreed core events with one canonical event name and one privacy-safe parameter contract, using Firebase for all traffic and Supabase for authenticated traffic only.

**Architecture:** Keep `lib/analytics.ts` as the single transport boundary. Firebase receives every approved event; `analytics_events` receives the same canonical name and params only when an authenticated session exists. Use React Native Firebase `logScreenView` for every approved `screen_view`, and write its matching Supabase record only for authenticated users. Add a root-mounted Expo Router segment tracker which maps only approved production routes to stable logical `screen_name` values and deduplicates consecutive identical names.

**Tech Stack:** Expo Router `~6.0.24`, React Native Firebase Analytics `^26.2.0`, Supabase JS `^2.106.1`, TypeScript, Jest.

**Spec:** `docs/03-analysis/date-planner.analysis.md` and the user-approved Analytics design discussion dated 2026-08-20.

## Global Constraints

- Do not emit analytics for legacy routes: `/mode-flow/feeling`, `/mode-flow/result`, `/mode-flow/bucketlist`.
- Do not emit analytics for development-only `/shot`.
- Firebase is the source of truth and records anonymous and authenticated events.
- Supabase records non-anonymous authenticated events only; where it records, its canonical event name and params must exactly match Firebase's.
- Never attempt an anonymous Supabase analytics insert and do not add an anonymous analytics Edge Function in this scope.
- Do not send IDs, invite codes, free text, titles, messages, search queries, addresses, coordinates, dates, or place names to either analytics destination.
- Track exactly these new core events in this change: `onboarding_completed`, `recommendation_request_started`, `recommendation_request_succeeded`, `recommendation_request_failed`, `place_selected`, `course_regenerate_requested`, `course_saved`, `proposal_sent`.
- Disable automatic native screen reporting before enabling manual `screen_view` reporting to prevent duplicate measurements.
- Preserve the existing behavior that Firebase/Supabase failures do not block the user flow.

---

## Final Event Contract

| Canonical event | Emission point | Params |
| --- | --- | --- |
| `onboarding_completed` | preferences upsert succeeds | `skipped: boolean` |
| `recommendation_request_started` | validated course Generate tap, immediately before route replace | `mode: 'make_course'`, `step_count: 2 | 3 | 4`, `has_pinned_place: boolean`, `has_walking_limit: boolean`, `has_budget: boolean`, `has_duration: boolean`, `has_mood: boolean`, `has_additional_request: boolean` |
| `recommendation_request_succeeded` | structured recommendation response succeeds and session persists, immediately before result route replace | `mode: 'make_course'`, `card_count: number`, `step_count: number` |
| `recommendation_request_failed` | structured request catch block, once per failed request attempt | `mode: 'make_course'`, `error_code: 'prepared_request_expired' | 'course_validation_failed' | 'ai_request_already_running' | 'ai_rate_limited' | 'ai_daily_limit_reached' | 'step_intent_unsatisfied' | 'unknown'`, `failure_stage?: 'course_build' | 'response_schema' | 'request_response_validation' | 'stage_attestation'` |
| `place_selected` | user taps a returned place-search result, before `router.back()` | `selection_context: 'course_pin' | 'course_replace'` |
| `course_regenerate_requested` | user taps course-result regenerate, before its new request begins | `scope: 'unlocked_steps'`, `locked_step_count: number`, `step_count: number` |
| `course_saved` | `commitTitle` succeeds for the explicit save action, after card status becomes `active` | `mode: 'make_course'`, `step_count: number`, `title_customized: boolean` |
| `proposal_sent` | `soft_messages` insert succeeds, before success modal opens | `send_method: 'in_app'`, `source_screen: 'course_recommendation_result'` |

`failure_stage` must be checked against the finite application error-stage union before sending. It must never be an arbitrary server error message.

## Production Screen Contract

```text
auth_login
onboarding_nickname
onboarding_photo
onboarding_anniversary
onboarding_date_style
onboarding_couple_choice
couple_connect
couple_connected
onboarding_preferences
home
date_mode_picker
candidates
memories
course_builder
place_search
recommendation_generating
course_recommendation_result
date_plans
date_card_detail
date_card_edit
date_confirm
date_review
memory_create
memory_detail
memory_edit
proposal_send
proposal_reaction
mutual_candidates
settings
profile_edit
notifications
account_delete
legal_terms
legal_privacy
```

Excluded: root JS splash (`app/index.tsx`), all legacy recommendation routes, `/shot`, and React Native `Modal` overlays. Modals are not screen views in this phase.

## Existing Event Disposition

| Current name | Decision | Required change |
| --- | --- | --- |
| `login` | Keep | Firebase currently rewrites it to `user_login`; remove that rewrite so Firebase and Supabase both receive GA4's supported suggested event name `login` with `{ method }`. |
| `couple_connected` | Keep unchanged | Existing success call and no params remain. It is outside the eight-event scope. |
| `onboarding_completed` | Keep unchanged | Reuse existing success call and `{ skipped }`. |
| `ai_card_created` | Rename | Replace structured-course success call with `recommendation_request_succeeded`; do not retain the old name. |
| `mode_selected` | Remove | Its only call is in legacy generation, which this plan excludes. |
| `recommendation_generated` | Remove | It belongs to legacy `lib/ai.ts` flow; remove its instrumentation/import. |
| `recommendation_regenerated` | Remove | It belongs to legacy `lib/ai.ts`; the current structured course action becomes `course_regenerate_requested` at the user intent point. |
| `recommendation_fallback` | Remove | It belongs to legacy `lib/ai.ts`, excluded by scope. |
| `signup` | Remove from type only | No call site exists. |
| `date_completed` | Remove from type only | No call site exists. |

### Task 0: Create authenticated Supabase analytics store

**Files:**
- Create: `supabase/migrations/20260820090000_analytics_events.sql`
- Create: `supabase/migrations/20260820090100_analytics_events_reject_anonymous_auth.sql`
- Modify: `docs/supabase-schema.sql`

**Interfaces:**
- `public.analytics_events.user_id` is nullable and defaults to `auth.uid()`.
- Only a non-anonymous `authenticated` role may insert, and its row must have `user_id = auth.uid()`.
- `anon` receives no table privileges and has no insert policy.

- [x] **Step 1: Add the migration**

  Create the table with `event_name text not null`, nullable `user_id uuid references auth.users(id) on delete set null default auth.uid()`, `params jsonb not null default '{}'::jsonb`, and `created_at timestamptz not null default now()`. Enable RLS, revoke all privileges from `anon`, grant `insert` only to `authenticated`, and create an `INSERT` policy that requires `auth.uid() is not null`, `user_id = auth.uid()`, and JWT `is_anonymous` not equal to `true`. Add individual indexes for `event_name`, `user_id`, and descending `created_at`.

- [x] **Step 2: Apply the migration to the linked project**

  Run: `supabase db push --linked`

  Expected: migrations `20260820090000_analytics_events.sql` and `20260820090100_analytics_events_reject_anonymous_auth.sql` are applied to `wqjguifsmtblgrhdfnji`.

- [x] **Step 3: Verify remote permissions through PostgREST**

  - With the configured anon key and no bearer session, a `POST /rest/v1/analytics_events` must return `401` or `403` and create no row.
  - With an authenticated test session and omitted `user_id`, an insert must succeed and store `user_id = auth.uid()`.
  - With that same session and a different explicit `user_id`, an insert must return `401` or `403`.
  - With an Anonymous Auth JWT, an insert must return `401` or `403`.
  - Delete only the test user's three probe rows after verification.

- [x] **Step 4: Update the canonical schema document**

  Add the table, indexes, grants, and RLS policy to `docs/supabase-schema.sql` so the checked-in schema matches the migration.

### Task 1: Canonical analytics transport and tests

**Files:**
- Modify: `lib/analytics.ts`
- Modify: `__tests__/analytics-ga4.test.ts`

**Interfaces:**
- Produces `AnalyticsEventName`, `logEvent(name, params)`, and `logScreenView(screenName)`.
- `logEvent` sends the unchanged `name` and `params` to Firebase, then writes those same values to Supabase only when `supabase.auth.getSession()` returns a non-anonymous session.
- `logScreenView` sends Firebase's manual screen view and writes its matching `event_name: 'screen_view'` only when a session exists.

- [x] **Step 1: Add failing transport tests**

  Extend `__tests__/analytics-ga4.test.ts` to assert all of the following:

  ```ts
  await logEvent('login', { method: 'apple' });
  expect(mockFirebaseLogEvent).toHaveBeenCalledWith('firebase-analytics', 'login', { method: 'apple' });
  expect(insert).toHaveBeenCalledWith({ event_name: 'login', params: { method: 'apple' } });

  await logScreenView('home');
  expect(mockFirebaseLogScreenView).toHaveBeenCalledWith('firebase-analytics', {
    screen_name: 'home', screen_class: 'DateNavi',
  });
  expect(insert).toHaveBeenCalledWith({
    event_name: 'screen_view',
    params: { screen_name: 'home', screen_class: 'DateNavi' },
  });
  ```

- [x] **Step 2: Run the focused test and confirm failure**

  Run: `npx jest __tests__/analytics-ga4.test.ts`

  Add a separate no-session test that asserts Firebase is called but `supabase.from` is not called. Expected: the login assertion fails because Firebase currently receives `user_login`; screen-view imports/functions do not exist.

- [x] **Step 3: Refactor `lib/analytics.ts`**

  - Replace the old event union with retained events, `screen_view`, and only the eight agreed core events.
  - Delete the `login → user_login` translation.
  - Extract the existing Supabase insert into a private helper used by both public functions. Obtain the session before calling `supabase.from`; return early from that helper when no session exists or `session.user.is_anonymous` is true.
  - Import RNFirebase's modular `logScreenView` under an unambiguous alias and implement the explicit screen-view function.
  - Preserve separate `try/catch` handling around Firebase and Supabase so a Firebase error does not prevent an authenticated database write, and a Supabase error never blocks the user flow.

- [x] **Step 4: Run transport tests and typecheck**

  Run: `npx jest __tests__/analytics-ga4.test.ts && npm run validate`

  Expected: both pass with zero TypeScript errors.

### Task 2: Route-to-screen resolver and manual screen tracker

**Files:**
- Create: `lib/analytics-screen.ts`
- Create: `components/analytics/screen-tracker.tsx`
- Modify: `app/_layout.tsx`
- Create: `firebase.json`
- Create: `__tests__/analytics-screen.test.ts`

**Interfaces:**
- `resolveScreenName(segments: readonly string[]): ScreenName | null` maps Expo Router segments to the production screen contract above.
- `AnalyticsScreenTracker` reads `useSegments()`, resolves the screen name, skips `null`, and invokes `logScreenView` only when the resolved name differs from the previous one.

- [x] **Step 1: Add failing resolver tests**

  Create table-driven tests including:

  ```ts
  expect(resolveScreenName(['(tabs)', 'index'])).toBe('home');
  expect(resolveScreenName(['mode-flow', 'course-result'])).toBe('course_recommendation_result');
  expect(resolveScreenName(['card', '[id]'])).toBe('date_card_detail');
  expect(resolveScreenName(['mode-flow', 'feeling'])).toBeNull();
  expect(resolveScreenName(['shot'])).toBeNull();
  ```

- [x] **Step 2: Run the focused test and confirm failure**

  Run: `npx jest __tests__/analytics-screen.test.ts`

  Expected: FAIL because `lib/analytics-screen.ts` does not exist.

- [x] **Step 3: Implement the resolver and tracker**

  - Define the complete finite `ScreenName` union in `lib/analytics-screen.ts`.
  - Map grouping segments explicitly, including `['(auth)', 'index']` and `['(tabs)', 'index']`, so the group collision at public path `/` cannot misclassify auth as home.
  - Map dynamic segments by their route template (`[id]`), never their actual parameter value.
  - Return `null` for splash, legacy routes, `shot`, unknown routes, and initially unresolved segments.
  - In `components/analytics/screen-tracker.tsx`, use a `useRef<ScreenName | null>` dedupe guard. Update it when the resolved screen changes; do not use route params in the effect dependency.
  - Mount `<AnalyticsScreenTracker />` once inside `app/_layout.tsx`, under existing providers and before the root `<Stack>`.

- [x] **Step 4: Disable automatic native screen views**

  Create root `firebase.json`:

  ```json
  {
    "react-native": {
      "google_analytics_automatic_screen_reporting_enabled": false
    }
  }
  ```

  This avoids duplicate automatic Activity/ViewController events when manual views start. A native rebuild/prebuild is required for the config change to reach iOS/Android.

- [x] **Step 5: Run tests and typecheck**

  Run: `npx jest __tests__/analytics-screen.test.ts __tests__/analytics-ga4.test.ts && npm run validate`

  Expected: all tests pass; legacy and `/shot` produce no screen view.

### Task 3: Instrument initial course recommendation request lifecycle

**Files:**
- Modify: `app/mode-flow/course.tsx`
- Modify: `app/mode-flow/generating.tsx`
- Test: `__tests__/analytics-course-lifecycle.test.ts`

**Interfaces:**
- `course.tsx` emits `recommendation_request_started` only after validation has passed and before navigation.
- `generating.tsx` emits one success or one failure event for a structured `requestId` request; legacy branches emit neither.

- [x] **Step 1: Add failing event payload tests**

  Extract a pure local helper if needed, then test that a draft with optional fields produces only the boolean/count contract and never raw location, tags, text, request ID, or coordinates. Test error normalization maps arbitrary thrown errors to `unknown`.

- [x] **Step 2: Run focused test and confirm failure**

  Run: `npx jest __tests__/analytics-course-lifecycle.test.ts`

  Expected: FAIL because the analytics payload helper/event calls do not exist.

- [x] **Step 3: Implement lifecycle emissions**

  - In `CourseScreen.handleGenerate`, log `recommendation_request_started` after `validation.valid` and `courseDraft` guards pass, immediately before `prepareRecommendationRequest`/`router.replace`.
  - In structured `GeneratingScreen` success, replace `ai_card_created` with `recommendation_request_succeeded` after `persistRecommendationSession` succeeds and before the route replacement.
  - In the structured request `catch`, emit `recommendation_request_failed` once after abort/cancellation guards and before UI error state is set.
  - Use a finite `normalizeRecommendationError` helper; it may expose only the approved enum and optional fixed `failure_stage`.
  - Do not add these events to the legacy `mode`/`input` branch.

- [x] **Step 4: Run tests and typecheck**

  Run: `npx jest __tests__/analytics-course-lifecycle.test.ts && npm run validate`

  Expected: all pass.

### Task 4: Instrument place selection and structured course actions

**Files:**
- Modify: `app/mode-flow/course.tsx`
- Modify: `app/mode-flow/course-result.tsx`
- Modify: `app/mode-flow/place-search.tsx`
- Test: `__tests__/analytics-course-actions.test.ts`

**Interfaces:**
- Add a route-only `selectionContext` parameter with values `course_pin` or `course_replace` whenever navigating to `/mode-flow/place-search`.
- Place search logs only `selection_context`, not the selected place data.

- [x] **Step 1: Add failing tests**

  Verify that both location-search entry points provide their expected context and that the emitted `place_selected` payload is exactly `{ selection_context: ... }`. Verify `course_regenerate_requested` payload has only the three count/scope fields.

- [x] **Step 2: Run focused test and confirm failure**

  Run: `npx jest __tests__/analytics-course-actions.test.ts`

  Expected: FAIL because context params and tracking calls do not exist.

- [x] **Step 3: Implement action instrumentation**

  - In `course.tsx` `requestPick`, add `selectionContext: 'course_pin'` to the existing place-search route params.
  - In `course-result.tsx` direct-search CTA, add `selectionContext: 'course_replace'`.
  - In `place-search.tsx`, read only that finite param and log `place_selected` in `onPick` before publishing the selected place and calling `router.back()`.
  - In `course-result.tsx` `regenerateUnlocked`, emit `course_regenerate_requested` after eligibility guards and immediately before `requestRecommendationResponse` begins.

- [x] **Step 4: Run tests and typecheck**

  Run: `npx jest __tests__/analytics-course-actions.test.ts && npm run validate`

  Expected: all pass.

### Task 5: Instrument saved course and in-app proposal send

**Files:**
- Modify: `app/mode-flow/course-result.tsx`
- Modify: `app/share/send.tsx`
- Test: `__tests__/analytics-save-send.test.ts`

**Interfaces:**
- `course_saved` occurs only for `pendingAction === 'save'` after the active-card update and title update succeed.
- `proposal_sent` occurs only after the `soft_messages` insert succeeds.

- [x] **Step 1: Add failing tests**

  Assert saving emits `course_saved` once with `{ mode: 'make_course', step_count, title_customized }`; sending from the result does not emit it. Assert an insert error does not emit `proposal_sent` and a success emits exactly `{ send_method: 'in_app', source_screen: 'course_recommendation_result' }`.

- [x] **Step 2: Run focused test and confirm failure**

  Run: `npx jest __tests__/analytics-save-send.test.ts`

  Expected: FAIL because the event calls do not exist.

- [x] **Step 3: Implement success-only emissions**

  - In `CourseResultScreen.commitTitle`, calculate `title_customized` from the final resolved title and log `course_saved` only in the successful `action === 'save'` branch before opening the success modal.
  - In `SendScreen.handleSend`, check the Supabase insert result and throw/handle its error before showing success. Log `proposal_sent` only after a successful insert.
  - Pass the finite route-only value `sourceScreen: 'course_recommendation_result'` into `/share/send` from the current course result. `SendScreen` emits `proposal_sent` only for that explicit value; legacy result routes remain functional but uninstrumented.

- [x] **Step 4: Run tests and typecheck**

  Run: `npx jest __tests__/analytics-save-send.test.ts && npm run validate`

  Expected: all pass.

### Task 6: Remove excluded legacy instrumentation and verify end-to-end contract

**Files:**
- Modify: `lib/ai.ts`
- Modify: `app/mode-flow/generating.tsx`
- Modify: `__tests__/analytics-ga4.test.ts`
- Modify: `docs/03-analysis/date-planner.analysis.md` only if it is maintained as the current analytics source of truth.

- [x] **Step 1: Remove excluded event calls**

  Delete the `logEvent` import and calls for `recommendation_generated`, `recommendation_regenerated`, and `recommendation_fallback` in `lib/ai.ts`. Delete the legacy `mode_selected` and legacy `ai_card_created` calls in the non-structured branch of `generating.tsx`.

- [x] **Step 2: Lock the event union with a test**

  Add a compile-time or runtime fixture asserting that the transport accepts the retained existing events plus the agreed eight-event set and rejects removed names at TypeScript compile time. Do not preserve aliases for removed analytics names, because aliases create duplicate reporting paths.

- [x] **Step 3: Run complete automated validation**

  Run: `npx jest __tests__/analytics-ga4.test.ts __tests__/analytics-screen.test.ts __tests__/analytics-course-lifecycle.test.ts __tests__/analytics-course-actions.test.ts __tests__/analytics-save-send.test.ts && npm run validate`

  Expected: all tests and typecheck pass.

- [ ] **Step 4: Run manual device verification**

  On a development build with Firebase DebugView enabled, execute:

  1. Complete onboarding once and confirm one `onboarding_completed` in Firebase and one same-named Supabase row.
  2. Open Home → Course Builder → Generate; confirm one `recommendation_request_started`, then exactly one success or failure event.
  3. Select a place from each place-search context and confirm `place_selected` contains only `selection_context`.
  4. Regenerate, save, and send a course; confirm the three corresponding events appear only after their successful operations.
  5. Navigate to a legacy route and `/shot`; confirm neither produces `screen_view` nor one of the eight events.
  6. Navigate course-result through replacement/regeneration updates; confirm it does not duplicate a consecutive `course_recommendation_result` screen view.

## Planned File List

| File | Change |
| --- | --- |
| `lib/analytics.ts` | Canonical dual-destination transport, manual screen-view transport, finite event union. |
| `supabase/migrations/20260820090000_analytics_events.sql` | Authenticated-only `analytics_events` table, indexes, grants, and RLS. |
| `supabase/migrations/20260820090100_analytics_events_reject_anonymous_auth.sql` | Reject Anonymous Auth JWTs at the RLS boundary. |
| `lib/analytics-screen.ts` | New pure Expo Router segment-to-screen resolver. |
| `components/analytics/screen-tracker.tsx` | New root-mounted deduplicating tracker. |
| `app/_layout.tsx` | Mount tracker once. |
| `firebase.json` | Disable automatic native screen reporting. |
| `app/mode-flow/course.tsx` | Request-start event and place-search context. |
| `app/mode-flow/generating.tsx` | Structured success/failure events; remove legacy calls. |
| `app/mode-flow/place-search.tsx` | Privacy-safe place-selected event. |
| `app/mode-flow/course-result.tsx` | Regenerate/save event, replacement search context, share source. |
| `app/share/send.tsx` | Proposal-sent event after successful insert. |
| `lib/ai.ts` | Remove legacy recommendation event instrumentation. |
| `__tests__/analytics-ga4.test.ts` | Firebase-to-authenticated-Supabase canonical-name/params parity tests. |
| `__tests__/analytics-screen.test.ts` | Resolver/exclusion tests. |
| `__tests__/analytics-course-lifecycle.test.ts` | Request lifecycle payload tests. |
| `__tests__/analytics-course-actions.test.ts` | Place selection/regeneration tests. |
| `__tests__/analytics-save-send.test.ts` | Save/send success-only tests. |

## Design Review Checklist

- All requested eight events are covered by Tasks 3–5; `onboarding_completed` is retained and verified in Task 6.
- Firebase is always emitted first; Task 1 enforces canonical-name/params parity for authenticated Supabase records, while anonymous events remain Firebase-only.
- Manual screen tracking, route mapping, duplicate prevention, and automatic native screen tracking disablement are all in Task 2.
- Legacy and development routes are excluded by resolver tests and legacy call removal.
- Every approved parameter is boolean, small bounded count, or finite enum; no personally identifying or high-cardinality value is in the contract.
