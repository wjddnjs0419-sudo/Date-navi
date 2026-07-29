# Step-Tagged Intents Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** Let a user optionally attach per-step intent tags that guide verified Kakao search and ranking, while keeping additional free text as Haiku-only supplementary context.

**Architecture:** The mobile draft owns selected tag strings and serializes them on each `CourseStepInput`. A small shared UI catalog supplies category-specific suggestions; the Edge resolver converts each submitted tag into a preferred `ParsedStepIntent`, using the authoritative dictionary when known and a bounded custom keyword otherwise. Search, ranking, prompt construction, and replacement inherit those resolved intents; neither client nor server derives exclusions, required constraints, or search terms from `additionalRequest` in the course-generation path.

**Tech Stack:** Expo React Native + TypeScript, Jest, Zod shared contracts, Supabase Edge/Deno, Kakao Local Search, Anthropic Haiku.

## Global Constraints

- Tags are optional; an untagged 2–4 step course remains valid and uses broad category retrieval.
- Each tag is a trimmed unique string of at most 40 characters; each step accepts at most 6 tags.
- Known tags resolve only to preferred intents for their own matching category; custom tags are preferred bounded keywords, never exclusions or required constraints.
- `additionalRequest` stays at 500 characters and is only supplementary prompt context: it must not create `excludedIntents`, `excludedCategories`, parsed preference flags, or Kakao keyword queries.
- Dictionary-backed suggestions differ by category and use the curated shared catalog; custom tags remain available for all concrete categories.
- Existing draft/request payloads without `intentTags` must stay valid. No database migration is required.
- Do not deploy Edge functions until targeted tests, `npm run validate`, and device QA are green.

---

## File Map

| File | Responsibility |
|---|---|
| `shared/recommendation/contracts.ts` | Public optional `CourseStepInput.intentTags` contract. |
| `shared/recommendation/schemas.ts` | Runtime bounds and uniqueness validation for tags. |
| `shared/recommendation/step-intent-tag-catalog.ts` | Portable curated category-to-tag suggestion catalog used by the Expo screen. |
| `lib/course-draft.ts` | Draft tag state/reducer and request serialization; removes text-derived course exclusions. |
| `components/recommendation/course-step-editor.tsx` | Per-step suggestion chips, selected chip deletion, and custom-tag add control. |
| `app/mode-flow/course.tsx` | Stops rendering text-parser preview/conflict feedback; labels free text as supplementary. |
| `supabase/functions/_shared/step-intent-resolve.ts` | Converts structured tags to preferred dictionary/custom intents with no free-text parse or AI parse call. |
| `supabase/functions/_shared/recommendation-search.ts` | Uses resolved tag queries only; removes free-text keyword queries. |
| `supabase/functions/_shared/recommendation-prompt.ts` | Separately renders selected tags and supplementary text. |
| `supabase/functions/_shared/recommend-date-handler.ts` | Stops merging free-text preferences and attaches tag-resolved intents. |
| `supabase/functions/replacement-candidates/index.ts` | Preserves/re-resolves the target step tags for replacement candidates. |
| `__tests__/course-draft.test.ts` | Draft reducer and course payload regressions. |
| `__tests__/recommend-date-intent-server.test.ts` | Tag resolver rules and no-free-text-constraint regressions. |
| `__tests__/recommend-date-search-server.test.ts` | Tag-first search plan and broad fallback behavior. |
| `__tests__/recommend-date-server.test.ts` | Prompt separation regression. |

### Task 1: Define bounded tag data and course-draft serialization

**Files:**
- Create: `shared/recommendation/step-intent-tag-catalog.ts`
- Modify: `shared/recommendation/contracts.ts:19-29`
- Modify: `shared/recommendation/schemas.ts:25-36`
- Modify: `lib/course-draft.ts:35-105, 130-180, 306-358`
- Test: `__tests__/course-draft.test.ts`

**Interfaces:**
- Produces `getStepIntentTagSuggestions(category: string): readonly string[]` and `MAX_STEP_INTENT_TAGS = 6`.
- Produces `CourseDraftStep.intentTags?: readonly string[]` and reducer actions `{ type: 'addStepIntentTag'; stepId: string; tag: string } | { type: 'removeStepIntentTag'; stepId: string; tag: string }`.
- Produces `CourseStepInput.intentTags?: string[]` validated as unique, trimmed, 1–40-character strings, at most six.

- [ ] **Step 1: Write the failing reducer and payload tests**

```ts
test('serializes selected tags only on their owning course step', () => {
  const draft = validDraft({
    steps: [
      { id: 'meal', category: 'meal', intentTags: ['라멘'] },
      { id: 'cafe', category: 'cafe' },
    ],
  });

  expect(buildStructuredCourseInput(draft, labels).courseSteps).toEqual([
    expect.objectContaining({ id: 'meal', intentTags: ['라멘'] }),
    expect.not.objectContaining({ intentTags: expect.anything() }),
  ]);
});

test('additional text never invalidates a matching selected category', () => {
  const result = validateCourseDraft(validDraft({ additionalRequest: '초밥 말고 라멘' }));
  expect(result).toEqual({ valid: true, issues: [] });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `npx jest __tests__/course-draft.test.ts --runInBand`

Expected: FAIL because tags are not serialized and free text still creates an exclusion conflict.

- [ ] **Step 3: Add the public tag contract and portable suggestion catalog**

```ts
export const MAX_STEP_INTENT_TAGS = 6;
export function getStepIntentTagSuggestions(category: string): readonly string[] {
  return STEP_INTENT_TAG_SUGGESTIONS[category] ?? [];
}

export type CourseStepInput = {
  id: string;
  category: string;
  label: string;
  intentTags?: string[];
  pinnedKakaoPlaceId?: string;
  pinnedName?: string;
};
```

Populate the catalog with curated canonical labels from the unified dictionary for `meal`, `cafe`, `drinks`, `activity`, `culture`, and `walk`; do not import Deno Edge files into Expo.

- [ ] **Step 4: Add minimal draft tag actions and remove course text parsing**

```ts
case 'addStepIntentTag': {
  const tag = action.tag.trim();
  if (!tag || tag.length > 40) return draft;
  return withStep(draft, action.stepId, (step) => ({
    ...step,
    intentTags: unique([...((step.intentTags ?? [])), tag]).slice(0, MAX_STEP_INTENT_TAGS),
  }));
}
```

Remove `parseCoursePreferences` from `validateCourseDraft` and `buildStructuredCourseInput`. Keep the original text only as `additionalRequest`; serialize nonempty per-step tags only.

- [ ] **Step 5: Run focused tests and type validation to verify GREEN**

Run: `npx jest __tests__/course-draft.test.ts --runInBand && npm run validate`

Expected: PASS; no type errors.

### Task 2: Render optional category-specific tags in each AI step

**Files:**
- Modify: `components/recommendation/course-step-editor.tsx:1-220`
- Modify: `app/mode-flow/course.tsx:17-330`
- Modify: `lib/i18n/ko.ts` and `lib/i18n/en.ts` (or the existing locale files located by `rg`)
- Test: `__tests__/course-step-editor.test.tsx` (create if component tests are already supported; otherwise extend `__tests__/course-draft.test.ts` with pure state coverage only)

**Interfaces:**
- Consumes `getStepIntentTagSuggestions`, reducer actions from Task 1, and `CourseDraftStep.intentTags`.
- Produces visible selected/suggested tags only while the step is in AI mode; custom tags feed the same reducer action.

- [ ] **Step 1: Write the failing component behavior test**

```tsx
test('adds a suggested tag and allows it to be removed', () => {
  render(<CourseStepEditor step={mealStep} {...props} />);
  fireEvent.press(screen.getByLabelText('라멘 태그 추가'));
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'addStepIntentTag', stepId: 'meal', tag: '라멘' });
  fireEvent.press(screen.getByLabelText('라멘 태그 삭제'));
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'removeStepIntentTag', stepId: 'meal', tag: '라멘' });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `npx jest __tests__/course-step-editor.test.tsx --runInBand`

Expected: FAIL because tag controls do not exist.

- [ ] **Step 3: Implement the compact optional tag control**

```tsx
{mode === 'ai' && step.category !== 'ai_decide' && (
  <StepIntentTagEditor
    suggestions={getStepIntentTagSuggestions(step.category)}
    selectedTags={step.intentTags ?? []}
    onAdd={(tag) => dispatch({ type: 'addStepIntentTag', stepId: step.id, tag })}
    onRemove={(tag) => dispatch({ type: 'removeStepIntentTag', stepId: step.id, tag })}
  />
)}
```

Place it directly below category chips. Show selected tags with an explicit delete affordance, hide suggestions already selected, include one small text input plus Add button, and disable additions at six tags. Add Korean/English strings describing this as optional and change the free-text field hint/label to “AI에 전달할 추가 요청 (선택)”.

- [ ] **Step 4: Remove obsolete text-parser UI**

```tsx
// Delete parseCoursePreferences useMemo, parsed preview card, and exclusion-conflict-specific styling/test IDs.
const validation = useMemo(() => validateCourseDraft(draft), [draft]);
```

Do not show inferred “텍스트에서 읽은 조건” chips. The text area remains editable and can never disable the generation button by category conflict.

- [ ] **Step 5: Run focused UI tests and type validation to verify GREEN**

Run: `npx jest __tests__/course-step-editor.test.tsx __tests__/course-draft.test.ts --runInBand && npm run validate`

Expected: PASS; screen compiles with no stale parser imports.

### Task 3: Resolve structured tags server-side without parsing free text

**Files:**
- Modify: `supabase/functions/_shared/step-intent-resolve.ts:1-250`
- Modify: `supabase/functions/_shared/recommend-date-handler.ts:185-230`
- Test: `__tests__/recommend-date-intent-server.test.ts`
- Test: `__tests__/recommend-date-phase7-handler.test.ts`

**Interfaces:**
- Consumes `CourseStepInput.intentTags` and `getStepIntentDictionaryEntry`.
- Produces `resolveStepIntents(request): Promise<ResolvedStepIntents>` with `stepIntents` all at `strength: 'preferred'`, `excludedIntents: []`, and no AI parse invocation.

- [ ] **Step 1: Write failing server resolver tests**

```ts
test('resolves a known meal tag to a preferred intent on that same step', async () => {
  const resolved = await resolveStepIntents(requestWithTags('meal', ['라멘']));
  expect(resolved.stepIntents).toEqual([expect.objectContaining({
    stepId: 'meal', canonicalTerm: '라멘', strength: 'preferred', kakaoSearchTerms: ['라멘', '일본식라면', '일식'],
  })]);
  expect(resolved.excludedIntents).toEqual([]);
});

test('keeps a custom tag as a bounded preferred keyword without an exclusion', async () => {
  const resolved = await resolveStepIntents(requestWithTags('meal', ['바질크림뇨끼']));
  expect(resolved.stepIntents[0]).toEqual(expect.objectContaining({ canonicalTerm: '바질크림뇨끼', strength: 'preferred' }));
  expect(resolved.excludedIntents).toEqual([]);
});

test('does not parse additionalRequest into structured constraints', async () => {
  const resolved = await resolveStepIntents(request({ additionalRequest: '초밥 말고 라멘' }));
  expect(resolved.stepIntents).toEqual([]);
  expect(resolved.excludedIntents).toEqual([]);
});
```

- [ ] **Step 2: Run resolver tests to verify RED**

Run: `npx jest __tests__/recommend-date-intent-server.test.ts --runInBand`

Expected: FAIL because the resolver currently parses `additionalRequest` and creates exclusions.

- [ ] **Step 3: Implement tag-only resolution**

```ts
function resolveTag(step: CourseStepInput, rawTag: string): ParsedStepIntent {
  const tag = rawTag.trim();
  const entry = getStepIntentDictionaryEntry(tag);
  return entry
    ? { stepId: step.id, stepCategory: entry.targetCategory, intentType: entry.intentType,
        canonicalTerm: entry.canonicalTerm, kakaoSearchTerms: unique([entry.canonicalTerm, ...entry.searchExpansions]).slice(0, 3),
        strength: 'preferred', displayLabel: entry.displayLabel }
    : { stepId: step.id, stepCategory: normalizeRecommendationCategory(step.category), intentType: 'dish',
        canonicalTerm: tag, kakaoSearchTerms: [tag], strength: 'preferred', displayLabel: { ko: tag, en: tag } };
}
```

Skip tags on locked/pinned steps, ignore malformed category-mismatched known entries, and return `source: 'tag' | 'none'`. Delete the handler’s `mergeServerPreferences`, structured conflict detection based on `additionalRequest`, `parseStepIntentsAi`, and `parsedPreferences` attachment from the course path. Preserve other explicitly structured request fields such as moods and indoor-only if still sent by a future client.

- [ ] **Step 4: Run resolver and handler regressions to verify GREEN**

Run: `npx jest __tests__/recommend-date-intent-server.test.ts __tests__/recommend-date-phase7-handler.test.ts --runInBand`

Expected: PASS; no request with only free text invokes the AI intent parser or contains excluded intents.

### Task 4: Make tag preference affect search, ranking, prompt, and replacement

**Files:**
- Modify: `supabase/functions/_shared/recommendation-search.ts:110-175`
- Modify: `supabase/functions/_shared/recommendation-ranking.ts:90-280`
- Modify: `supabase/functions/_shared/recommendation-prompt.ts:25-100`
- Modify: `supabase/functions/replacement-candidates/index.ts`
- Test: `__tests__/recommend-date-search-server.test.ts`
- Test: `__tests__/recommend-date-ranking-server.test.ts`
- Test: `__tests__/recommend-date-server.test.ts`

**Interfaces:**
- Consumes the Task 3 attached `resolvedStepIntents` and explicit `request.courseSteps[].intentTags`.
- Produces canonical-first `step_intent` search queries, preferred ranking boosts only, and a prompt object with separate `selectedStepTags` and `additionalRequest` fields.

- [ ] **Step 1: Write failing search/ranking/prompt regressions**

```ts
test('adds ramen intent queries before retaining broad meal fallback queries', () => {
  const plan = buildKakaoSearchPlan(requestWithTags('meal', ['라멘']));
  expect(plan.filter((query) => query.stepId === 'meal').map((query) => query.phase)).toContain('step_intent');
  expect(plan.some((query) => query.phase === 'broad_category')).toBe(true);
});

test('does not create Kakao queries from supplementary text', () => {
  expect(buildKakaoSearchPlan(request({ additionalRequest: '초밥 말고 라멘' })))
    .not.toContainEqual(expect.objectContaining({ phase: 'explicit' }));
});

test('prompt keeps selected tags separate from supplementary text', () => {
  const prompt = buildRecommendationPrompt(requestWithTags('meal', ['라멘'], { additionalRequest: '조용한 곳이면 좋아' }), candidates);
  expect(prompt).toContain('selectedStepTags');
  expect(prompt).toContain('additionalRequest');
});
```

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npx jest __tests__/recommend-date-search-server.test.ts __tests__/recommend-date-ranking-server.test.ts __tests__/recommend-date-server.test.ts --runInBand`

Expected: FAIL because free text still emits explicit queries and prompt lacks selected-tag field.

- [ ] **Step 3: Implement tag-first, broad-fallback retrieval and prompt separation**

```ts
for (const intent of effectiveStepIntents(request).filter((intent) => intent.stepId === step.id)) {
  for (const [expansionLevel, keyword] of intent.kakaoSearchTerms.entries()) {
    queries.push({ stepId: step.id, keyword, phase: 'step_intent', canonicalTerm: intent.canonicalTerm, expansionLevel });
  }
}
queries.push(...buildBroadCategoryQueries(step));
```

Remove the `additionalRequest` “explicit” query loop. Retain preferred scoring boosts and broad candidates; do not introduce required gates or exclusion filtering for tags. In the prompt, include ordered steps with `selectedTags: step.intentTags ?? []`, render additional text under `supplementaryAdditionalRequest`, and state that it cannot override verified candidates. Ensure replacement requests keep target-step `intentTags` and call the same resolver.

- [ ] **Step 4: Run focused server tests to verify GREEN**

Run: `npx jest __tests__/recommend-date-search-server.test.ts __tests__/recommend-date-ranking-server.test.ts __tests__/recommend-date-server.test.ts --runInBand`

Expected: PASS; tag matching ranks first when viable, but broad candidates remain selectable.

### Task 5: Remove temporary parser diagnostics and complete regression verification

**Files:**
- Modify: `app/mode-flow/generating.tsx`
- Modify: `lib/course-draft.ts` (delete now-unused parser code/imports if no remaining production consumer)
- Modify: `supabase/functions/_shared/recommendation-intent.ts` (revert the unshipped temporary Korean word-boundary tweak if the parser remains as legacy-only code)
- Modify: `__tests__/course-draft.test.ts`, `__tests__/recommend-date-intent-server.test.ts` (remove temporary parser-specific tests superseded by Tasks 1 and 3)
- Modify: `docs/superpowers/specs/2026-07-29-step-tagged-intents-design.md` status to `Implemented` only after verification

**Interfaces:**
- Consumes all prior tasks.
- Produces a release candidate without DEV-only raw error codes or a course-path dependence on free-text parsing.

- [ ] **Step 1: Write the failing end-to-end request regression**

```ts
test('a meal and cafe request with supplemental “초밥 말고 라멘” remains valid and has no excluded categories', () => {
  const request = buildRecommendationRequest(courseInputWithText('초밥 말고 라멘'), 'request-1', 'ko');
  expect(request.courseSteps.map((step) => step.category)).toEqual(['meal', 'cafe']);
  expect(request.parsedPreferences).toBeUndefined();
});
```

- [ ] **Step 2: Run it to verify RED/legacy failure where applicable**

Run: `npx jest __tests__/course-draft.test.ts __tests__/recommend-date-phase7-handler.test.ts --runInBand`

Expected: The test captures the old parser coupling before its cleanup; it passes only after Tasks 1–4 removed the coupling.

- [ ] **Step 3: Remove temporary-only changes and stale parser UI**

```ts
// generating.tsx: leave user-facing error mapping only; remove __DEV__ code/error console output.
// No course client/server request path may call parseCoursePreferences or parseStepIntents on additionalRequest.
```

Keep generic parser helpers only if another non-course feature imports them; otherwise delete dead code and its tests in the same change. Do not change deployed Edge code until this task is green.

- [ ] **Step 4: Run full local verification**

Run: `npx jest __tests__/course-draft.test.ts __tests__/course-step-editor.test.tsx __tests__/recommend-date-intent-server.test.ts __tests__/recommend-date-search-server.test.ts __tests__/recommend-date-ranking-server.test.ts __tests__/recommend-date-server.test.ts __tests__/recommend-date-phase7-handler.test.ts --runInBand && npm run validate`

Expected: PASS. If an unrelated suite failure appears, record its exact test and error separately rather than masking it.

- [ ] **Step 5: Perform device QA and deploy only after explicit confirmation**

On a local Xcode/Expo run, verify: (1) no tags + meal/cafe generates; (2) meal tag `라멘` appears selected and generates; (3) supplemental `초밥 말고 라멘` alone neither blocks the button nor becomes a displayed exclusion; (4) custom tag can be added/removed. After the user confirms QA, deploy both Edge functions together:

```bash
supabase functions deploy recommend-date replacement-candidates --project-ref wqjguifsmtblgrhdfnji
```

Then fetch/compare deployed source and update the design status to `Implemented`.
