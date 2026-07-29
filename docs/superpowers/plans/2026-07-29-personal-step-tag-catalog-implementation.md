# Personal Step-Tag Catalog Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** Persist each user's reusable suggested step tags and hidden shipped defaults, synchronize them with Supabase Realtime, and keep tag presses visually stationary.

**Architecture:** Shipped suggestions remain a static fallback catalog. A client repository reads two user-scoped Supabase tables, merges them into an effective catalog, applies idempotent writes, and subscribes to user-filtered Postgres changes. The step editor receives that catalog plus reusable add/remove callbacks; its selected course tags remain local draft state and serialize unchanged to `CourseStepInput.intentTags`.

**Tech Stack:** Expo React Native, TypeScript, Supabase Postgres/RLS/Realtime, Jest, react-test-renderer.

## Global Constraints

- Personal tags and hidden defaults are scoped to `auth.uid()`; no user may read or mutate another user's rows.
- Categories are exactly `meal`, `cafe`, `drinks`, `activity`, `culture`, and `walk`; `ai_decide` has no reusable catalog.
- Tags are trimmed, normalized, unique per `(user, category)`, 1–40 characters, and a step still selects at most six.
- Effective suggestions equal shipped defaults minus hidden defaults plus personal tags.
- Hiding a shipped default is persistent and may only be restored by manually adding the same term.
- Reusable catalog writes must not delete selected tags from the current draft when the network operation fails.
- Pressed tag controls must not use transform, changed margins, or changed height; only color/border/opacity feedback is allowed.
- `docs/supabase-schema.sql` and an executable timestamped migration must carry the same schema/RLS/publication changes.

---

### Task 1: Add user-scoped schema, RLS, and Realtime publication

**Files:**
- Create: `supabase/migrations/20260729000000_personal_step_intent_tags.sql`
- Modify: `docs/supabase-schema.sql`
- Test: `__tests__/personal-step-tag-schema.test.ts`

**Interfaces:**
- Produces tables `personal_step_intent_tags` and `personal_hidden_step_intent_defaults` with the columns and uniqueness rules in the approved design.
- Produces RLS policies named `personal_step_intent_tags_owner` and `personal_hidden_step_intent_defaults_owner` for SELECT/INSERT/DELETE where `user_id = auth.uid()`.

- [ ] **Step 1: Write the failing schema contract test**

```ts
test('declares user-scoped personal tags, hidden defaults, RLS, and realtime publication', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  expect(sql).toContain('create table if not exists public.personal_step_intent_tags');
  expect(sql).toContain('unique (user_id, category, normalized_tag)');
  expect(sql).toContain('create table if not exists public.personal_hidden_step_intent_defaults');
  expect(sql).toContain('enable row level security');
  expect(sql).toContain("alter publication supabase_realtime add table public.personal_step_intent_tags");
});
```

- [ ] **Step 2: Run it to verify RED**

Run: `npx jest __tests__/personal-step-tag-schema.test.ts --runInBand`

Expected: FAIL because no migration exists.

- [ ] **Step 3: Add idempotent SQL migration and schema documentation**

```sql
create table if not exists public.personal_step_intent_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('meal','cafe','drinks','activity','culture','walk')),
  tag text not null check (char_length(btrim(tag)) between 1 and 40),
  normalized_tag text not null,
  created_at timestamptz not null default now(),
  unique (user_id, category, normalized_tag)
);
```

Create the hidden-default table with `(user_id, category, normalized_tag)` primary key, enable RLS, create owner policies for SELECT/INSERT/DELETE, and add both tables to `supabase_realtime` conditionally so reruns are safe.

- [ ] **Step 4: Run schema contract test to verify GREEN**

Run: `npx jest __tests__/personal-step-tag-schema.test.ts --runInBand`

Expected: PASS.

### Task 2: Build a testable personal-tag catalog repository

**Files:**
- Create: `lib/personal-step-tag-catalog.ts`
- Test: `__tests__/personal-step-tag-catalog.test.ts`

**Interfaces:**
- Produces `normalizeStepIntentTag(tag: string): string`.
- Produces `mergePersonalStepTagCatalog(category, shipped, personalRows, hiddenRows): string[]`.
- Produces `PersonalStepTagCatalogRepository` with `load(userId)`, `addPersonalTag(userId, category, tag)`, `hideShippedTag(userId, category, tag)`, `deletePersonalTag(id)`, and `subscribe(userId, onChange)`.

- [ ] **Step 1: Write failing merge and intent tests**

```ts
test('hides a shipped tag and retains a personal tag in the same category', () => {
  expect(mergePersonalStepTagCatalog('meal', ['라멘', '파스타'], [{ id: 'p1', category: 'meal', tag: '뇨끼' }], [{ category: 'meal', tag: '라멘' }]))
    .toEqual(['파스타', '뇨끼']);
});

test('manually adding a hidden default asks the repository to clear its hidden record before upsert', async () => {
  await repository.addPersonalTag('u1', 'meal', '라멘');
  expect(mockDeleteHidden).toHaveBeenCalledWith('u1', 'meal', '라멘');
  expect(mockUpsertPersonal).toHaveBeenCalledWith(expect.objectContaining({ normalized_tag: '라멘' }));
});
```

- [ ] **Step 2: Run it to verify RED**

Run: `npx jest __tests__/personal-step-tag-catalog.test.ts --runInBand`

Expected: FAIL because repository and merge function do not exist.

- [ ] **Step 3: Implement pure merge and Supabase repository boundary**

```ts
export function mergePersonalStepTagCatalog(
  category: PersonalTagCategory,
  shipped: readonly string[],
  personal: readonly PersonalStepIntentTag[],
  hidden: readonly HiddenStepIntentDefault[],
): string[] {
  const hiddenKeys = new Set(hidden.filter((row) => row.category === category).map((row) => row.normalizedTag));
  return unique([
    ...shipped.filter((tag) => !hiddenKeys.has(normalizeStepIntentTag(tag))),
    ...personal.filter((row) => row.category === category).map((row) => row.tag),
  ]);
}
```

Repository writes normalize once, use `upsert` with the documented unique conflict key, and subscribe to INSERT/DELETE on both tables filtered by `user_id=eq.<id>`. Return an unsubscribe that removes the channel.

- [ ] **Step 4: Run repository tests to verify GREEN**

Run: `npx jest __tests__/personal-step-tag-catalog.test.ts --runInBand`

Expected: PASS; duplicate/Realtime echo inputs do not duplicate a visible suggestion.

### Task 3: Connect the course screen to the personal catalog

**Files:**
- Create: `components/recommendation/personal-step-tag-catalog-provider.tsx`
- Modify: `app/mode-flow/course.tsx`
- Modify: `components/recommendation/course-step-editor.tsx`
- Test: `__tests__/course-step-editor.test.tsx`
- Test: `__tests__/course-screen.test.tsx`

**Interfaces:**
- Produces `usePersonalStepTagCatalog(): { suggestionsFor(category); addSuggestedTag(category, tag); removeSuggestedTag(category, tag); status }`.
- `CourseStepEditor` consumes `suggestions`, `onAddSuggestedTag`, and `onRemoveSuggestedTag` rather than the static catalog directly.

- [ ] **Step 1: Write failing editor tests for reusable controls**

```tsx
test('removing a suggested shipped tag calls the reusable-catalog delete without changing the selected draft tag', () => {
  const renderer = render({ id: 'meal', category: 'meal', intentTags: ['라멘'] }, { suggestions: ['라멘'], onRemoveSuggestedTag });
  act(() => byTestID(renderer, 'course-step-suggestion-remove-라멘')!.props.onPress());
  expect(onRemoveSuggestedTag).toHaveBeenCalledWith('meal', '라멘');
  expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'removeStepIntentTag' }));
});

test('custom tag add persists it as a reusable suggestion and selects it in the current step', () => {
  // enter 뇨끼, press Add
  expect(onAddSuggestedTag).toHaveBeenCalledWith('meal', '뇨끼');
  expect(dispatch).toHaveBeenCalledWith({ type: 'addStepIntentTag', stepId: 'meal', tag: '뇨끼' });
});
```

- [ ] **Step 2: Run UI tests to verify RED**

Run: `npx jest __tests__/course-step-editor.test.tsx __tests__/course-screen.test.tsx --runInBand`

Expected: FAIL because suggestions are static and do not have reusable-catalog delete controls.

- [ ] **Step 3: Implement provider loading, live updates, and separated controls**

```tsx
const suggestions = catalog.suggestionsFor(step.category);
<CourseStepEditor
  suggestions={suggestions}
  onAddSuggestedTag={(tag) => catalog.addSuggestedTag(step.category, tag)}
  onRemoveSuggestedTag={(tag) => catalog.removeSuggestedTag(step.category, tag)}
  {...existingProps}
/>
```

Fetch `supabase.auth.getUser()` in the provider. While loading or on a non-authenticated screenshot fixture, show the shipped catalog. On failure retain shipped catalog and render a retry button; adding/removing reusable tags surfaces a non-blocking notice and does not mutate draft selection on failure.

- [ ] **Step 4: Run UI tests to verify GREEN**

Run: `npx jest __tests__/course-step-editor.test.tsx __tests__/course-screen.test.tsx --runInBand`

Expected: PASS.

### Task 4: Stabilize tag interaction layout and verify final behavior

**Files:**
- Modify: `components/recommendation/course-step-editor.tsx:tag styles`
- Modify: `docs/superpowers/specs/2026-07-29-personal-step-tag-catalog-design.md` status after verification
- Test: `__tests__/course-step-editor.test.tsx`
- Test: `__tests__/personal-step-tag-catalog.test.ts`

**Interfaces:**
- Consumes Tasks 1–3.
- Produces tag controls with a fixed minimum height and press feedback limited to colors/borders/opacity.

- [ ] **Step 1: Write the failing style contract test**

```ts
test('tag controls have stable height and do not use a press transform', () => {
  expect(styles.selectedTag.minHeight).toBe(34);
  expect(styles.suggestedTag.minHeight).toBe(34);
  expect(JSON.stringify(styles)).not.toMatch(/translateY|scale/);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `npx jest __tests__/course-step-editor.test.tsx --runInBand`

Expected: FAIL until controls expose fixed layout constraints without transforms.

- [ ] **Step 3: Apply stationary press styles and complete checks**

```tsx
style={[styles.suggestedTag, pressed && styles.tagPressed]}
// tagPressed: { opacity: 0.72, borderColor: C.pinkBorder, backgroundColor: C.pinkLight }
```

Do not alter `margin`, `padding`, `minHeight`, or `transform` in active states. Verify both the suggestion delete control and selected tag delete control retain their positions.

- [ ] **Step 4: Run full targeted verification**

Run: `npx jest __tests__/personal-step-tag-schema.test.ts __tests__/personal-step-tag-catalog.test.ts __tests__/course-draft.test.ts __tests__/course-step-editor.test.tsx __tests__/course-screen.test.tsx --runInBand && npm run validate`

Expected: PASS.

- [ ] **Step 5: Apply database migration, perform two-session QA, and commit**

Apply `supabase/migrations/20260729000000_personal_step_intent_tags.sql` through the Supabase SQL Editor, then confirm: (1) add/remove on device A appears on device B for the same account; (2) another account retains default `#라멘`; (3) hiding then manual re-add works; (4) tag presses do not move vertically; (5) course payload sends only selected tags. Commit only the personal-catalog implementation files after these checks.
