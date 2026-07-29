# Personal Step-Tag Catalog Design

**Status:** Proposed — 2026-07-29

## Goal

Make category-specific suggestion tags personal, persistent, and live-synchronized across a user's signed-in devices. A user may add a tag to their personal suggestions or hide a shipped default tag. Neither action affects another user.

## Scope and Terminology

- **Selected step tag:** A tag attached to one draft course step for the current recommendation. Its existing `×` removes only that selection.
- **Suggested tag:** A reusable category suggestion shown below a step's category selector.
- **Shipped default:** A read-only app-defined suggested tag from `step-intent-tag-catalog.ts`.
- **Personal tag:** A user-created reusable suggested tag stored on the server.
- **Hidden default:** A per-user record suppressing one shipped default from that user's suggestions.

## User Experience

For a concrete AI course category, the suggestion area renders:

```
effective suggestions = shipped defaults - hidden defaults + personal tags
```

- All tags visibly render as `#라멘`.
- Tapping a suggestion adds it to the current step selection, as today.
- Every suggested tag has a small adjacent `×` control to remove it from the user's reusable suggestions.
  - Removing a shipped default creates a personal hidden-default record.
  - Removing a personal tag deletes that personal tag record.
- The direct input + Add control creates a reusable personal tag in the selected category and immediately selects it for the current step.
- Re-adding a term that is currently hidden deletes its hidden-default record, which restores it as a personal tag. It remains after app updates and is not auto-restored otherwise.
- Selected tags retain their own in-place pressed feedback. Controls must not change layout height, translate vertically, or reflow neighboring tags when pressed; use color/opacity only.
- `ai_decide` has no suggested-tag catalog because it has no concrete category.

## Data Model

Create two Supabase tables.

### `personal_step_intent_tags`

| Column | Type | Constraint |
|---|---|---|
| `id` | uuid | primary key, default `gen_random_uuid()` |
| `user_id` | uuid | `auth.users`, cascade delete |
| `category` | text | one of `meal`, `cafe`, `drinks`, `activity`, `culture`, `walk` |
| `tag` | text | trimmed, 1–40 chars |
| `normalized_tag` | text | lowercase NFKC-compatible app normalization |
| `created_at` | timestamptz | default `now()` |

Unique key: `(user_id, category, normalized_tag)`.

### `personal_hidden_step_intent_defaults`

| Column | Type | Constraint |
|---|---|---|
| `user_id` | uuid | `auth.users`, cascade delete |
| `category` | text | same concrete-category allowlist |
| `tag` | text | canonical shipped-default tag |
| `normalized_tag` | text | normalized canonical tag |
| `created_at` | timestamptz | default `now()` |

Primary key: `(user_id, category, normalized_tag)`.

Both tables enable RLS. Authenticated users may select, insert, and delete only rows whose `user_id = auth.uid()`. Clients never update a row; they delete then insert as needed.

Both tables are added to `supabase_realtime` publication.

## Client Data Flow

1. The course screen authenticates normally and loads the current user's two tag tables once when mounted.
2. `usePersonalStepTagCatalog(userId)` merges server data with `getStepIntentTagSuggestions(category)` without mutating the shipped list.
3. It subscribes to `INSERT` and `DELETE` Postgres changes for both tables filtered to the authenticated `user_id`.
4. An add action trims and normalizes input, then:
   - inserts a personal tag with `upsert(..., { onConflict: 'user_id,category,normalized_tag' })`;
   - removes a matching hidden-default row first, if one exists;
   - dispatches `addStepIntentTag` only after the write succeeds (or immediately optimistically, with rollback on failure if the existing UI pattern supports it).
5. Suggested-tag delete determines whether the tag is shipped:
   - shipped: upsert a hidden-default record;
   - personal: delete the personal-tag row by its id.
6. Every write updates the local catalog immediately and remains idempotent when its Realtime echo arrives.

## Recommendation Contract

The existing course payload remains unchanged: selected tags serialize as `CourseStepInput.intentTags`. Personal catalogs only determine which tags are offered in the UI; they are not sent as request-wide preferences and do not alter the server's dictionary authority.

## Interaction Stability

Suggested-tag and selected-tag controls use fixed/minimum height, horizontal padding, and no press transform. Active state may only change background, border, text/icon color, and opacity. This prevents a selected tag from appearing to jump one line upward.

## Error Handling

- Initial catalog read failure falls back to shipped defaults and shows a non-blocking retry affordance.
- Add/delete failure leaves the reusable suggestions unchanged and shows a concise error notice; it must not remove an already selected course-step tag.
- A user may still make a course recommendation when personal catalog loading fails.

## Acceptance Criteria

- Removing suggested `#라멘` affects only the current user and remains hidden after relaunch.
- Entering `라멘` manually after hiding it restores it as a personal suggested tag for that user only.
- Adding/deleting a personal suggestion on one device updates another active session of the same account without reload.
- Removing a tag from a selected course step does not delete it from reusable personal suggestions.
- Pressing or selecting a tag has no vertical movement or layout reflow.
- Course generation still sends only selected step tags and keeps additional free text supplementary.
