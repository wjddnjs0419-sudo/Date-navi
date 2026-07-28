# Step Intent Required and Exclusion Enforcement Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** 후행 required 표현을 정확히 파싱하고, 음식·세부 장소 intent의 명시적 제외를 랭킹 페널티가 아닌 후보 hard filter로 집행한다.

**Architecture:** `step-intent.ts`는 음식명 주변의 제한된 앞·뒤 문맥에서 required를 판정하되 다음 음식으로 마커가 번지지 않게 한다. `recommendation-ranking.ts`는 resolved excluded intent와 일치하는 후보를 점수화 전에 제거하며, `recommendation-course-selection.ts`는 어떤 AI/fallback 경로도 제거된 후보를 선택할 수 없게 재검증한다. 기존 `excludedCategories` 파싱·rank filter·selection validation은 유지한다.

**Tech Stack:** Deno Edge Functions TypeScript, Jest, existing recommendation request contracts.

## Global Constraints

- P0-3 rule/AI positive merge는 변경하지 않는다.
- `required`는 명시적 마커(`무조건`, `반드시`, `꼭`, `only`, `must`, `has to be`, `고정`)가 같은 음식/intent에만 결합할 때만 승격한다.
- `삼겹살 말고 무조건 파스타`에서 `무조건`은 삼겹살을 required로 만들면 안 된다.
- excluded step intent는 후보 pool에서 제거한다. 점수 감점만으로 남겨 두지 않는다.
- 기존 `excludedCategories`는 이미 후보 filter·선택 검증에 적용된다. course step category와 충돌하면 현재의 `INVALID_INPUT` 정책을 유지하며, 단계 자동 치환이나 UI 변경은 이 범위에 포함하지 않는다.
- locked/pinned 장소의 의미와 공개 요청 schema를 변경하지 않는다.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `supabase/functions/_shared/step-intent.ts` | 후행 required 문맥 및 excluded-intent candidate matcher | Modify |
| `supabase/functions/_shared/recommendation-ranking.ts` | excluded intent 후보의 score 전 hard filter | Modify |
| `supabase/functions/_shared/recommendation-course-selection.ts` | AI/fallback 결과의 excluded intent 재검증 | Modify |
| `__tests__/stepIntent.test.ts` | required 문맥 및 excluded matcher 단위 테스트 | Modify |
| `__tests__/recommend-date-ranking-server.test.ts` | ranking hard-filter 회귀 | Modify |
| `__tests__/recommend-date-course-selection.test.ts` | selection bypass 방지 회귀 | Modify |
| `__tests__/recommend-date-phase7-handler.test.ts` | category exclusion conflict/집행 wiring 회귀 | Modify |

### Task 1: Make required parsing local to the matched intent

**Files:**
- Modify: `supabase/functions/_shared/step-intent.ts:32-57`
- Test: `__tests__/stepIntent.test.ts`

**Interfaces:**
- Produces: `isRequiredAt(text, matchIndex, canonicalLen): boolean` with a preceding and following local window.

- [ ] **Step 1: Add failing required-context tests**

```ts
it.each([
  ['삼겹살은 꼭 먹고 싶어', '삼겹살'],
  ['떡볶이는 반드시 먹어야 해', '떡볶이'],
  ['닭갈비로 고정하고 카페 가자', '닭갈비'],
  ['pasta is a must', '파스타'],
])('%s makes %s required', (text, term) => {
  expect(parseStepIntents(request(text)).stepIntents.find((i) => i.canonicalTerm === term)?.strength).toBe('required');
});

it('does not let a later marker upgrade a different excluded dish', () => {
  const parsed = parseStepIntents(request('삼겹살 말고 무조건 파스타'));
  expect(parsed.excludedIntents.find((i) => i.canonicalTerm === '삼겹살')?.strength).toBe('preferred');
  expect(parsed.stepIntents.find((i) => i.canonicalTerm === '파스타')?.strength).toBe('required');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts -t "required"`

Expected: FAIL for trailing Korean markers and `고정`; current parser only reads the prefix window.

- [ ] **Step 3: Implement bounded suffix matching**

Add `REQUIRED_SUFFIX_WINDOW = 16`. Preserve the current prefix check. For suffix text beginning immediately after the matched canonical, accept only these local forms:

```ts
const REQUIRED_SUFFIX_KO = /^(?:은|는|이|가|을|를|로|도)?\s*(?:(?:꼭|반드시|무조건)\s*(?:먹|해야|할|포함)|(?:먹어야|먹을|포함되어야)\s*(?:해|함)|고정)/;
const REQUIRED_SUFFIX_EN = /^\s*(?:is\s+)?(?:a\s+)?must\b|^\s*(?:only|must|has\s+to\s+be)\b/i;
```

`isRequiredAt` receives `canonicalLen`, derives prefix and suffix, and returns true if either valid local expression matches. Do not inspect beyond the suffix window or allow a standalone marker after another dish’s conjunction.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts -t "required"`

Expected: PASS.

### Task 2: Define exact excluded-intent candidate matching

**Files:**
- Modify: `supabase/functions/_shared/step-intent.ts:141-165`
- Test: `__tests__/stepIntent.test.ts`

**Interfaces:**
- Produces: `placeMatchesExcludedStepIntent(place, intent): boolean`.

- [ ] **Step 1: Add failing candidate-matcher tests**

```ts
const excludedPork = parseStepIntents(request('삼겹살 말고 파스타')).excludedIntents[0]!;
expect(placeMatchesExcludedStepIntent(place({ name: '왕십리 삼겹살집' }), excludedPork)).toBe(true);
expect(placeMatchesExcludedStepIntent(place({
  matchedSearchEvidence: [{ phase: 'step_intent', canonicalTerm: '삼겹살' }],
}), excludedPork)).toBe(true);
expect(placeMatchesExcludedStepIntent(place({ categoryName: '음식점 > 한식 > 육류,고기' }), excludedPork)).toBe(true);
expect(placeMatchesExcludedStepIntent(place({ name: '파스타 전문점', categoryName: '음식점 > 양식' }), excludedPork)).toBe(false);
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts -t "excluded"`

Expected: FAIL because no candidate matcher exists; current behavior is only a name-based ranking penalty.

- [ ] **Step 3: Implement matcher by reusing positive evidence semantics**

Implement `placeMatchesExcludedStepIntent` as `placeMatchesStepIntent(place, intent)`. The existing predicate already covers exact step-intent evidence, canonical name inclusion, and curated compatible category keywords; reuse guarantees include/exclude interpretation cannot diverge.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts -t "excluded"`

Expected: PASS.

### Task 3: Enforce excluded intents before ranking and after selection

**Files:**
- Modify: `supabase/functions/_shared/recommendation-ranking.ts:205-245`
- Modify: `supabase/functions/_shared/recommendation-course-selection.ts:108-116`
- Test: `__tests__/recommend-date-ranking-server.test.ts`
- Test: `__tests__/recommend-date-course-selection.test.ts`

**Interfaces:**
- Consumes: `effectiveExcludedIntents(request)` and `placeMatchesExcludedStepIntent`.
- Produces: a candidate pool containing no excluded-intent candidate; selection validation throws `COURSE_VALIDATION_FAILED` if an excluded candidate is injected.

- [ ] **Step 1: Add failing ranking hard-filter test**

Create a request with `additionalRequest: '삼겹살 말고 파스타'`, one pork candidate with exact 삼겹살 evidence, and one pasta candidate. Assert only pasta remains even if pork had the highest base score.

```ts
expect(ranked.candidates.map((candidate) => candidate.kakaoPlaceId)).toEqual(['pasta-id']);
```

- [ ] **Step 2: Add failing selection-bypass test**

Pass a preassembled pool containing the same excluded pork candidate into `buildCandidateOnlyCourse`, with selection choosing it. Assert `CourseSelectionError`.

```ts
expect(() => buildCandidateOnlyCourse({ request, candidates, selection, generatedAt }))
  .toThrow(CourseSelectionError);
```

- [ ] **Step 3: Verify RED**

Run: `npm test -- --runInBand __tests__/recommend-date-ranking-server.test.ts __tests__/recommend-date-course-selection.test.ts`

Expected: FAIL. The ranking path retains pork with a penalty, and selection validation does not inspect excluded intents.

- [ ] **Step 4: Filter and revalidate**

In `rankPlaceCandidates`, obtain `excludedIntents` before `eligiblePlaces`, then add this predicate to the existing eligibility filter:

```ts
&& !excludedIntents.some((intent) => placeMatchesExcludedStepIntent(place, intent))
```

Remove `negatedPenaltyFor` and its score contribution, because a hard-excluded candidate must not reach scoring. In `validateCandidatePool`, obtain `effectiveExcludedIntents(request)` and throw `CourseSelectionError('COURSE_VALIDATION_FAILED')` when any candidate matches an excluded intent. This protects AI candidate selection, deterministic fallback, replacement, and future call sites that supply a pool directly.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --runInBand __tests__/recommend-date-ranking-server.test.ts __tests__/recommend-date-course-selection.test.ts`

Expected: PASS.

### Task 4: Preserve the existing category-exclusion contract

**Files:**
- Test: `__tests__/recommend-date-phase7-handler.test.ts`
- Test: `__tests__/recommend-date-ranking-server.test.ts`

**Interfaces:**
- Consumes: free-text category exclusion parsed by `mergeServerPreferences`.
- Produces: no cafe candidate when cafe is excluded without a cafe step; `INVALID_INPUT` when it conflicts with a requested cafe step.

- [ ] **Step 1: Add handler contract tests**

```ts
it('filters a free-text cafe exclusion before candidate selection when cafe is not a course step', async () => {
  const body = { ...request(), courseSteps: [mealStep, cultureStep], additionalRequest: '카페는 말고 전시로 가자' };
  const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body }, deps);
  expect(result.status).toBe(200);
  expect(searchCandidates.mock.calls[0][0].excludedCategories).toContain('cafe');
});

it('rejects a cafe step that conflicts with 카페는 말고', async () => {
  const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: { ...request(), additionalRequest: '카페는 말고' } }, dependencies());
  expect(result.status).toBe(400);
});
```

- [ ] **Step 2: Run category tests**

Run: `npm test -- --runInBand __tests__/recommend-date-phase7-handler.test.ts __tests__/recommend-date-ranking-server.test.ts`

Expected: PASS. These tests document existing hard-filter and conflict behavior; no production category-exclusion change is expected in this task.

### Task 5: Full regression verification

**Files:**
- Verify only.

- [ ] **Step 1: Run intent and recommendation regression suites**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts __tests__/stepIntentResolve.test.ts __tests__/stepIntentResolvedThreading.test.ts __tests__/recommend-date-ranking-server.test.ts __tests__/recommend-date-search-server.test.ts __tests__/recommend-date-course-selection.test.ts __tests__/recommend-date-phase7-handler.test.ts`

Expected: PASS.

- [ ] **Step 2: Run type and diff validation**

Run: `npm run validate && git diff --check`

Expected: exit code 0 and no whitespace errors.

## Plan Self-Review

- **Coverage:** Tasks 1–3 implement the two requested improvements: postpositive required parsing and hard enforcement of excluded food/subtype intents. Task 4 verifies the existing category exclusion behavior instead of duplicating it.
- **Deliberate boundary:** A request that demands and excludes the same course category remains invalid; resolving it by changing course steps is a future structured-keyword UI concern.
- **Safety:** The same candidate matching predicate is used for positive required validation and negative hard exclusion, avoiding contradictory category/name/evidence semantics.
