# Localized Step Tags Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** Localize shipped step-tag labels while keeping Korean Kakao search values stable, and prevent unverified custom tags from being permanently saved.

**Architecture:** Represent a suggestion as `{ value, label, shipped }`, where `value` is the stable canonical request tag and `label` follows the app language. The personal catalog keeps existing database rows as canonical/raw values and projects them into localized suggestions on each render. The Edge returns the custom-tag evidence already present in search metadata; client persistence is delayed until the current selection has verified evidence.

**Tech Stack:** Expo React Native, TypeScript, Supabase Realtime, Supabase Edge Functions, Kakao Local API, Jest.

## Global Constraints

- Shipped tags use a Korean canonical value for Kakao lookup in every UI language.
- One tag per course step remains enforced by reducer and request schema.
- A dictionary-recognized English tag canonicalizes before persistence and Edge resolution.
- Unknown custom tags remain usable for the current request, but no evidence means no personal-catalog persistence.
- Account-backed personal and hidden tag rows are not duplicated by an app-language switch.

---

### Task 1: Localized canonical tag catalog

**Files:**
- Modify: `shared/recommendation/step-intent-tag-catalog.ts`
- Modify: `lib/personal-step-tag-catalog.ts`
- Test: `__tests__/personal-step-tag-catalog.test.ts`

**Interfaces:**
- Produces `StepIntentTagSuggestion { value: string; label: string; shipped: boolean }`.
- Produces `getStepIntentTagSuggestions(category, language)` and `canonicalizeStepIntentTag(tag)`.
- `mergePersonalStepTagCatalog(category, language, shipped, personal, hidden)` returns localized suggestions.

- [ ] **Step 1: Write failing catalog tests**

```ts
expect(getStepIntentTagSuggestions('meal', 'en')[0]).toEqual({
  value: '라멘', label: 'Ramen', shipped: true,
});
expect(canonicalizeStepIntentTag('Ramen')).toBe('라멘');
```

- [ ] **Step 2: Run the catalog test to verify it fails**

Run: `npx jest __tests__/personal-step-tag-catalog.test.ts --runInBand`

- [ ] **Step 3: Implement the localized projection**

```ts
export type StepIntentTagSuggestion = { value: string; label: string; shipped: boolean };
export function getStepIntentTagSuggestions(category: string, language: RecommendationLanguage): StepIntentTagSuggestion[];
export function canonicalizeStepIntentTag(tag: string): string;
```

- [ ] **Step 4: Run the catalog test to verify it passes**

Run: `npx jest __tests__/personal-step-tag-catalog.test.ts --runInBand`

### Task 2: Language-reactive tag editor and catalog hook

**Files:**
- Modify: `components/recommendation/use-personal-step-tag-catalog.ts`
- Modify: `components/recommendation/course-step-editor.tsx`
- Modify: `app/mode-flow/course.tsx`
- Test: `__tests__/course-step-editor.test.tsx`

**Interfaces:**
- `usePersonalStepTagCatalog(language)` provides `suggestionsFor(category): StepIntentTagSuggestion[]`.
- `CourseStepEditor` consumes localized suggestions and stores `suggestion.value` when selected.

- [ ] **Step 1: Write failing UI tests**

```ts
expect(renderedEnglishSuggestion.props.children).toContain('#Ramen');
expect(dispatchedSelectAction).toMatchObject({ tag: '라멘' });
```

- [ ] **Step 2: Run the editor test to verify it fails**

Run: `npx jest __tests__/course-step-editor.test.tsx --runInBand`

- [ ] **Step 3: Pass language through the hook and editor**

```tsx
const personalTagCatalog = usePersonalStepTagCatalog(language);
<CourseStepEditor suggestions={personalTagCatalog.suggestionsFor(step.category)} />
```

- [ ] **Step 4: Run the editor and catalog tests**

Run: `npx jest __tests__/course-step-editor.test.tsx __tests__/personal-step-tag-catalog.test.ts --runInBand`

### Task 3: Canonical Edge resolution and unverified custom-tag feedback

**Files:**
- Modify: `supabase/functions/_shared/step-intent-resolve.ts`
- Modify: `supabase/functions/_shared/recommend-date-handler.ts`
- Modify: `shared/recommendation/schemas.ts`
- Modify: `app/mode-flow/course.tsx`
- Test: `__tests__/stepIntentResolve.test.ts`
- Test: `__tests__/recommend-date-phase7-handler.test.ts`

**Interfaces:**
- Known English aliases resolve to the same Korean `canonicalTerm` and Kakao terms as Korean tags.
- The successful response metadata exposes verified tag canonical terms, allowing the client to persist only matched unknown custom tags.

- [ ] **Step 1: Write failing resolver and handler tests**

```ts
expect((await resolveStepIntents(requestWithTag('Ramen'))).stepIntents[0]).toMatchObject({
  canonicalTerm: '라멘', kakaoSearchTerms: ['라멘'],
});
expect(responseMetadata.stepIntent?.verifiedCanonicalTerms).toContain('라멘');
```

- [ ] **Step 2: Run focused Edge tests to verify failure**

Run: `npx jest __tests__/stepIntentResolve.test.ts __tests__/recommend-date-phase7-handler.test.ts --runInBand`

- [ ] **Step 3: Add canonical alias resolution and verified-term metadata**

```ts
verifiedCanonicalTerms: resolved.stepIntents
  .filter((intent) => search.candidates.some((candidate) => placeMatchesStepIntent(candidate, intent)))
  .map((intent) => intent.canonicalTerm)
```

- [ ] **Step 4: Persist only verified custom tags after a successful generation**

```ts
if (isUnknownCustomTag && !verifiedCanonicalTerms.includes(tag)) {
  setTagNotice('검색어를 확인해 주세요. 이 태그는 저장하지 않았어요.');
} else {
  await personalTagCatalog.addSuggestion(category, tag);
}
```

- [ ] **Step 5: Run focused behavior tests and typecheck**

Run: `npx jest __tests__/stepIntentResolve.test.ts __tests__/recommend-date-phase7-handler.test.ts __tests__/course-screen.test.tsx --runInBand && npm run validate`

### Task 4: Deployment verification

**Files:**
- Modify: files from Tasks 1-3 only

- [ ] **Step 1: Run complete test suite**

Run: `npm test -- --runInBand`

- [ ] **Step 2: Deploy Edge functions using the verified source**

Run: `npx supabase functions deploy recommend-date replacement-candidates --project-ref wqjguifsmtblgrhdfnji`

- [ ] **Step 3: Commit and push**

Run: `git add <verified files> && git commit -m "feat: localize step tag suggestions" && git push origin main`
