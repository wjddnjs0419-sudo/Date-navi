# Account-Scoped Recent History and Selection State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 같은 기기에서 계정을 바꿔도 최근 장소·최근 검색어가 섞이지 않게 하고, 장소를 선택하지 않았을 때 최근 장소 카드가 선택 색상으로 표시되지 않게 한다.

**Architecture:** 최근 장소와 최근 검색어는 기존 AsyncStorage 구조를 유지하되, 저장 키를 인증된 `userId`별로 분리한다. 로그인 사용자가 확인되기 전에는 최근 데이터를 읽거나 쓰지 않으며, 기존 계정 미분류 전역 키는 어떤 계정에도 자동 이관하지 않는다. 최근 카드의 선택 판정은 `kakaoPlaceId`가 없을 때 `undefined === undefined`가 성립하지 않도록 실제 장소 식별자 비교 함수로 통일한다. 개인 키워드 카탈로그는 이미 Supabase `user_id` + RLS로 계정 분리되어 있으므로 서버·스키마 변경 없이 회귀 검증만 추가한다.

**Tech Stack:** Expo React Native, TypeScript, React Native AsyncStorage, Supabase Auth/Postgres/RLS, Jest + jest-expo.

**Spec:** 현재 사용자 요청과 조사 근거 — [AGENTS.md](/Users/jeongwonkim/Desktop/Date-navi/AGENTS.md), [personal-step-tag-catalog-design.md](/Users/jeongwonkim/Desktop/Date-navi/docs/superpowers/specs/2026-07-29-personal-step-tag-catalog-design.md)

## Global Constraints

- 추천 검증 중인 `supabase/functions/recommend-date/**`, `supabase/functions/provider-neutral-replacements/**`, 추천 랭킹·검색 로직은 수정하지 않는다.
- `personal_step_intent_tags`와 `personal_hidden_step_intent_defaults`의 서버 스키마·RLS는 변경하지 않는다.
- 기존 전역 AsyncStorage 기록은 어느 계정의 기록인지 판별할 수 없으므로 자동으로 특정 계정에 복사하지 않는다.
- 현재 작업 트리의 다른 세션 변경은 되돌리거나 정리하지 않고, 필요한 파일의 관련 줄만 수정한다.
- UI 변경 후 `npm run validate`, 관련 Jest 테스트, iPhone 17 Pro 390×844 수동 확인을 수행한다.
- 실제 구현 전까지는 코드·데이터를 변경하지 않는다.

---

### Task 1: 최근 장소를 사용자별 AsyncStorage로 분리

**Files:**
- Modify: `lib/recentLocations.ts`
- Modify: `components/recommendation/location-selector.tsx`
- Test: `__tests__/recentLocations.test.ts`
- Test: `__tests__/location-selector.test.tsx`
- Test: `__tests__/locationSelector.test.tsx`

**Interfaces:**
- Produces `loadRecentLocations(userId: string | null)` and `saveRecentLocation(userId: string | null, location)`.
- A non-null `userId` uses `datenavi.recentLocations:<userId>`; a null user returns an empty list and never touches storage.
- The selector resolves the authenticated user before loading recent locations and clears the rendered list when no user is available or the user changes.

- [ ] **Step 1: Add failing account-isolation tests**

  Extend `__tests__/recentLocations.test.ts` with two UUID-like users. Save `서울숲` as user A and `한강공원` as user B, then assert each user loads only its own list. Also assert `loadRecentLocations(null)` returns `[]` and does not read the legacy global key.

  Extend the selector tests with a mocked authenticated session and assert that the selector passes the authenticated user ID to `loadRecentLocations`.

- [ ] **Step 2: Run the focused tests and verify the expected API failures**

  Run:

  ```bash
  npm test -- --runInBand __tests__/recentLocations.test.ts __tests__/location-selector.test.tsx __tests__/locationSelector.test.tsx
  ```

  Expected: FAIL because the current functions have no `userId` parameter and the current selector reads the unscoped key.

- [ ] **Step 3: Implement scoped keys without legacy-data attribution**

  In `lib/recentLocations.ts`, change the exported API to accept `string | null`, add a deterministic key builder using `datenavi.recentLocations:${userId}`, and return `[]` for null/blank IDs. Use that scoped key for both reads and writes. Do not read or copy `datenavi.recentLocations`.

  In `LocationSelector`, obtain the current session user ID with `supabase.auth.getSession()`. Load recent locations only after the ID is known, reset the local recent state when it is absent, and pass the same ID to `saveRecentLocation`. Keep the selection callback working even if optional history storage fails.

- [ ] **Step 4: Run the focused tests and verify account isolation**

  Run the same focused Jest command. Expected: PASS, including separate storage for user A and user B and no reads for a null user.

- [ ] **Step 5: Commit the isolated storage change**

  ```bash
  git add lib/recentLocations.ts components/recommendation/location-selector.tsx __tests__/recentLocations.test.ts __tests__/location-selector.test.tsx __tests__/locationSelector.test.tsx
  git commit -m "fix: scope recent locations to signed-in users"
  ```

### Task 2: 최근 장소 검색어도 사용자별로 분리

**Files:**
- Modify: `lib/recentPlaceSearches.ts`
- Modify: `app/mode-flow/place-search.tsx`
- Test: `__tests__/recentPlaceSearches.test.ts`
- Test: `__tests__/place-search-screen-suggestions.test.tsx`

**Interfaces:**
- Produces `loadRecentPlaceSearches(userId: string | null)` and `saveRecentPlaceSearch(userId: string | null, term)`.
- A non-null `userId` uses `datenavi.recentPlaceSearches:<userId>`; null never reads or writes recent search terms.

- [ ] **Step 1: Add failing cross-account search-term tests**

  Update `__tests__/recentPlaceSearches.test.ts` so user A and user B save different terms and load only their own terms. Add the null-user no-read/no-write case while preserving ordering, deduplication, limit, and blank-input coverage.

- [ ] **Step 2: Run the focused search-term tests and verify failure**

  Run:

  ```bash
  npm test -- --runInBand __tests__/recentPlaceSearches.test.ts __tests__/place-search-screen-suggestions.test.tsx
  ```

  Expected: FAIL because the current API is unscoped and the screen does not resolve a user ID.

- [ ] **Step 3: Implement scoped recent search-term storage**

  Apply the same scoped-key and null-user rules in `lib/recentPlaceSearches.ts`. In `app/mode-flow/place-search.tsx`, resolve the current session before loading suggestions and pass the resolved user ID to every save call. When the session is absent or changes, clear the local recent-search state before loading the new account’s data.

- [ ] **Step 4: Run the focused tests and verify the UI wiring**

  Run the focused command again. Expected: PASS, with no unscoped key access and no cross-account terms.

- [ ] **Step 5: Commit the search-term isolation change**

  ```bash
  git add lib/recentPlaceSearches.ts app/mode-flow/place-search.tsx __tests__/recentPlaceSearches.test.ts __tests__/place-search-screen-suggestions.test.tsx
  git commit -m "fix: scope recent search terms to signed-in users"
  ```

### Task 3: 선택하지 않은 최근 장소의 선택 색상 제거

**Files:**
- Modify: `lib/recentLocations.ts`
- Modify: `components/recommendation/location-selector.tsx`
- Test: `__tests__/location-selector.test.tsx`

**Interfaces:**
- Produces a shared `isSameRecommendationLocation(a, b)` predicate (or an equivalent exported identity helper) that returns false when either value is null and compares Kakao IDs only when both are present; otherwise it compares source and coordinates using the existing deduplication identity rules.

- [ ] **Step 1: Add failing regression tests**

  Add a no-ID fixture and these assertions to the selector test:

  ```ts
  const noIdLocation: RecommendationLocation = {
    source: 'kakao',
    label: '성수동1가',
    address: '서울 성동구 성수동1가',
    latitude: 37.5417253860375,
    longitude: 127.043351028535,
    kind: 'neighborhood',
  };

  loadRecentLocations.mockResolvedValue([noIdLocation]);
  const renderer = create(<LocationSelector value={null} onChange={jest.fn()} search={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  const recentRow = renderer.root.findByProps({ testID: `location-recent-${noIdLocation.latitude}:${noIdLocation.longitude}` });

  // No current selection: a recent item without kakaoPlaceId is not selected.
  expect(recentRow.props.accessibilityState.selected).toBe(false);

  // The same no-ID location is selected only when it is the current value.
  renderer.update(<LocationSelector value={noIdLocation} onChange={jest.fn()} search={jest.fn()} />);
  expect(renderer.root.findByProps({ testID: `location-recent-${noIdLocation.latitude}:${noIdLocation.longitude}` }).props.accessibilityState.selected).toBe(true);
  ```

  Add a second no-ID fixture with different coordinates and assert that it remains unselected when `value` is `noIdLocation`.

- [ ] **Step 2: Run the focused regression test and verify the current failure**

  ```bash
  npm test -- --runInBand __tests__/location-selector.test.tsx
  ```

  Expected: FAIL for the no-ID recent item because the current expression compares two `undefined` Kakao IDs as equal.

- [ ] **Step 3: Implement the identity-based selected predicate**

  Add the null guard and identity comparison. Replace the recent-card expression at `components/recommendation/location-selector.tsx` with the shared predicate. Keep the existing search-result predicate behavior and preserve accessibility state, card style, and touch behavior.

- [ ] **Step 4: Run the regression test and verify the exact screenshot case**

  Run the focused test again. Expected: PASS; with `value === null` and the observed `성수동1가` record lacking `kakaoPlaceId`, no recent card receives `selected: true`.

- [ ] **Step 5: Commit the selection-state fix**

  ```bash
  git add lib/recentLocations.ts components/recommendation/location-selector.tsx __tests__/location-selector.test.tsx
  git commit -m "fix: avoid false selected state for recent locations"
  ```

### Task 4: 개인 키워드 계정 분리 회귀 검증 및 통합 확인

**Files:**
- No source changes
- Test: existing `__tests__/personal-step-tag-catalog.test.ts`
- Test: existing `__tests__/personal-step-tag-schema.test.ts`
- No changes: `lib/personal-step-tag-catalog.ts`, `components/recommendation/use-personal-step-tag-catalog.ts`, `supabase/migrations/20260729000000_personal_step_intent_tags.sql`

**Interfaces:**
- Confirms the existing keyword catalog remains user-scoped through the current `userId` query, `user_id` write payload, and RLS owner policies.
- Does not alter recommendation request payloads or recommendation validation work.

- [ ] **Step 1: Reconfirm the existing account-scope contract**

  Review the existing tests and implementation together: `loadPersonalStepTagCatalog(userId)` must issue `.eq('user_id', userId)` for both tables, writes must include the same `user_id`, and the migration must keep `using (user_id = auth.uid())` plus `with check (user_id = auth.uid())`. Do not add a misleading pure-merge test because `mergePersonalStepTagCatalog` intentionally receives already-filtered rows and has no user identity of its own.

- [ ] **Step 2: Run keyword and schema tests**

  ```bash
  npm test -- --runInBand __tests__/personal-step-tag-catalog.test.ts __tests__/personal-step-tag-schema.test.ts
  ```

  Expected: PASS without any server/schema modification or test-source change.

### Task 5: 전체 검증 및 두 계정 수동 확인

**Files:**
- No source changes unless a focused test exposes a previously undocumented contract mismatch.

- [ ] **Step 1: Run all affected tests**

  ```bash
  npm test -- --runInBand \
    __tests__/recentLocations.test.ts \
    __tests__/recentPlaceSearches.test.ts \
    __tests__/location-selector.test.tsx \
    __tests__/locationSelector.test.tsx \
    __tests__/place-search-screen-suggestions.test.tsx \
    __tests__/personal-step-tag-catalog.test.ts \
    __tests__/personal-step-tag-schema.test.ts
  ```

- [ ] **Step 2: Run repository type validation**

  ```bash
  npm run validate
  ```

  Expected: exit code 0.

- [ ] **Step 3: Verify the real iPhone 17 Pro flow with two accounts**

  On account A, select a location and save a custom keyword. Sign out, sign in as account B, and confirm the recent location/search-term lists do not contain account A’s entries. Add and remove a keyword on account B, then return to account A and confirm account A’s catalog is unchanged. This validates the user-scoped AsyncStorage keys and the existing Supabase `user_id`/RLS path together.

- [ ] **Step 4: Verify the screenshot regression**

  Open the location selector before selecting a location. Confirm every recent card has neutral styling. Select one card and confirm only that card becomes selected. Include a stored location without `kakaoPlaceId` to cover the observed `성수동1가` data shape.

- [ ] **Step 5: Inspect the final diff for scope safety**

  ```bash
  git diff --check
  git diff --stat
  git diff -- supabase/functions/recommend-date supabase/functions/provider-neutral-replacements
  ```

  Expected: no recommendation Edge-function changes, no schema migration, and no unrelated formatting churn.
