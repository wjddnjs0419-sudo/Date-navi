# 코스 키워드 필수 조건 Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** 코스에서 선택하거나 직접 입력한 모든 키워드를 해당 스텝의 필수 추천 조건으로 보장한다.

**Architecture:** 태그 기반 intent는 resolver에서 `required`로 만들고, 기존 후보 검증·AI 선택 검증·결정론 폴백의 required 게이트를 그대로 재사용한다. 후보가 없을 때는 이미 구현된 `STEP_INTENT_UNSATISFIED` 응답으로 조건 수정 UI를 유도한다.

**Tech Stack:** TypeScript, Jest, Supabase Edge Functions (Deno).

## Global Constraints

- 기본 제안 칩과 직접 입력 키워드는 동일한 필수 조건이다.
- 적용 범위는 식사·카페·술·액티비티·문화·산책 전체다.
- 한 스텝당 키워드 하나라는 기존 계약과 키워드 검색·카카오 검증 규칙은 유지한다.
- 후보 부족 시 일반 카테고리 장소로 완화하지 않으며, `STEP_INTENT_UNSATISFIED`를 반환한다.
- 공유 Edge 모듈을 바꾸므로 검증 후 `recommend-date`와 `replacement-candidates`를 함께 배포한다.

---

### Task 1: 태그 intent를 필수 제약으로 승격

**Files:**
- Modify: `supabase/functions/_shared/step-intent-resolve.ts:190-218`
- Modify: `__tests__/recommend-date-intent-server.test.ts:190-232`
- Modify: `__tests__/stepIntentResolve.test.ts:1-210`

**Interfaces:**
- Consumes: `CourseStepInput.intentTags?: string[]`.
- Produces: `resolveStepIntents(request).stepIntents` where every tag-derived `ParsedStepIntent.strength` is `'required'`.
- Reuses: `handleRecommendDate` and `buildDeterministicCandidateCourse` existing required-intent gates.

- [ ] **Step 1: Write failing resolver tests.**

```ts
it.each([
  ['meal', '라멘'],
  ['cafe', '루프탑 카페'],
  ['drinks', '와인바'],
  ['activity', '방탈출'],
  ['culture', '전시'],
  ['walk', '한강 산책'],
])('treats a %s tag as required', async (category, tag) => {
  const resolved = await resolveStepIntents({
    ...request(''),
    courseSteps: [{ id: 'tagged', category, label: category, intentTags: [tag] }, { id: 'cafe', category: 'cafe', label: '카페' }],
  });
  expect(resolved.stepIntents[0]).toMatchObject({ stepId: 'tagged', canonicalTerm: tag, strength: 'required' });
});
```

- [ ] **Step 2: Run the resolver test to verify it fails.**

Run: `npx jest __tests__/recommend-date-intent-server.test.ts __tests__/stepIntentResolve.test.ts --runInBand`

Expected: FAIL because a tag-derived intent currently has `strength: 'preferred'`.

- [ ] **Step 3: Write the minimal resolver change.**

```ts
strength: 'required' as StepIntentStrength,
```

Replace only the tag-derived `strength` assignment in `resolveStepIntents`; do not alter natural-language parser behavior.

- [ ] **Step 4: Run the resolver tests to verify they pass.**

Run: `npx jest __tests__/recommend-date-intent-server.test.ts __tests__/stepIntentResolve.test.ts --runInBand`

Expected: PASS, including the existing custom tag assertion updated from preferred to required.

### Task 2: 필수 조건의 실제 선택·실패 경로 고정

**Files:**
- Modify: `__tests__/recommend-date-course-selection.test.ts:581-675`
- Modify: `__tests__/recommend-date-phase7-handler.test.ts:130-190`

**Interfaces:**
- Consumes: required tag-derived intents from Task 1 and the existing candidate-only/fallback/handler gates.
- Produces: no code change; regression coverage proving a tag cannot silently relax.

- [ ] **Step 1: Write failing selection tests for a known and custom tag.**

```ts
const taggedRequest = {
  ...requiredRequest,
  courseSteps: [
    { id: 'step-1', category: 'meal', label: '식사', intentTags: ['라멘'] },
    { id: 'step-2', category: 'cafe', label: '카페' },
  ],
};

expect(() => buildDeterministicCandidateCourse({
  request: taggedRequest,
  candidates: [nonRamenMeal, cafeCandidate('cafe', 'cafe')],
  generatedAt: '2026-07-31T00:00:00.000Z',
})).toThrow(CourseSelectionError);
```

Add an equivalent direct `intentTags: ['샐러드']` handler case that expects 422 `STEP_INTENT_UNSATISFIED` when only non-salad meal candidates are returned.

- [ ] **Step 2: Run the selection and handler tests to verify they fail.**

Run: `npx jest __tests__/recommend-date-course-selection.test.ts __tests__/recommend-date-phase7-handler.test.ts --runInBand`

Expected: FAIL before Task 1 because the tag remains preferred and a nonmatching meal can be selected.

- [ ] **Step 3: Re-run after Task 1 without production changes.**

The existing `required` gates in `recommendation-course-selection.ts` and `recommend-date-handler.ts` should make both tests pass.

- [ ] **Step 4: Run the selection and handler tests to verify they pass.**

Run: `npx jest __tests__/recommend-date-course-selection.test.ts __tests__/recommend-date-phase7-handler.test.ts --runInBand`

Expected: PASS. The deterministic fallback rejects an unverified keyword and the handler returns `STEP_INTENT_UNSATISFIED` before AI selection.

### Task 3: Full verification and deploy

**Files:**
- Modify: `PLAN.md` (replace the active keyword issue with a completed summary after deployment)
- Modify: `RESULT.md` (record test and deployment evidence)

- [ ] **Step 1: Run all affected suites and type checking.**

Run: `npx jest __tests__/stepIntentResolve.test.ts __tests__/recommend-date-intent-server.test.ts __tests__/recommend-date-course-selection.test.ts __tests__/recommend-date-phase7-handler.test.ts __tests__/replacementCandidatesHandler.test.ts --runInBand && npm run validate`

Expected: all tests and TypeScript pass.

- [ ] **Step 2: Deploy both shared-module consumers.**

Run: `supabase functions deploy recommend-date --project-ref wqjguifsmtblgrhdfnji && supabase functions deploy replacement-candidates --project-ref wqjguifsmtblgrhdfnji`

Expected: both deploy commands finish successfully.

- [ ] **Step 3: Perform a production QA request.**

Create one course with `라멘` and one with direct `샐러드`; verify each returned step has matching Kakao evidence, and verify an intentionally impossible keyword produces the condition-edit error instead of a substituted place.
