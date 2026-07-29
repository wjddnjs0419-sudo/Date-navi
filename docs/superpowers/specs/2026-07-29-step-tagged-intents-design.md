# Step-Tagged Intents Design

**Status:** Proposed — 2026-07-29

## Goal

Replace free-text-derived hard recommendation constraints with optional, per-course-step intent tags. Preserve free text as Haiku-only supplementary context so normal phrasing cannot block recommendation generation.

## User Experience

Each course step retains its category (`meal`, `cafe`, `activity`, etc.). Beneath a selected category, the user may add zero or more intent tags:

- Meal examples: `라멘`, `파스타`, `삼겹살`, `초밥`
- Cafe examples: `루프탑 카페`, `디저트`, `북카페`
- Activity/culture/drinks examples come from the same curated intent dictionary.

Tags are optional. A course with no tags remains valid and uses ordinary broad category recommendation. Users can select suggested tags, delete selected tags, or add a custom tag. Suggestions are filtered by the step category and sourced from the unified intent dictionary.

The existing additional-request text field remains, labelled and treated as supplementary AI context. It does not create exclusions, required intents, or Kakao search terms.

## Data Contract

Add an optional `stepIntents` field to each course-step input:

```ts
type CourseStepInput = {
  id: string;
  category: string;
  label: string;
  intentTags?: string[];
};
```

The server resolves each tag against the unified dictionary. Known tags become structured preferred intents for their own step. A custom tag becomes a bounded keyword candidate for that step, never a category exclusion or required constraint.

No tag is required and no tag changes the public course result shape.

## Search and Ranking

1. Build broad Kakao category retrieval for every course step as today.
2. For each resolved step tag, add canonical-first Kakao keyword queries for that step.
3. Rank tag-matching candidates above untagged broad-category candidates, but allow broad candidates when a preferred tag has no viable result.
4. Do not produce `excludedIntents` or `excludedCategories` from `additionalRequest`.

The existing strict evidence rules remain relevant only for future explicit hard constraints; this feature creates preferred tags, not hard constraints.

## Haiku Prompt

The prompt receives:

- ordered steps and their structured selected tags;
- the original additional-request text as supplementary context;
- verified Kakao candidates.

Haiku may prefer selected-tag candidates but cannot invent a place or override verified category/candidate constraints. Free text is not parsed into a search constraint before reaching Haiku.

## Migration and Compatibility

Existing saved drafts without `intentTags` behave exactly as untagged steps. Existing requests may still carry `additionalRequest`; its old local/server exclusion parsing is removed from the course-generation path. No database migration is required unless saved draft persistence serializes a stricter schema.

## Acceptance Criteria

- `초밥 말고 라멘` in free text never blocks generation or creates a meal exclusion.
- Selecting `라멘` on a meal step creates ramen-first search/ranking while allowing a broad meal fallback.
- A meal + cafe course with no tags remains valid and recommends normally.
- Suggestions differ per step category and are drawn from the dictionary.
- Custom tags remain supplemental and cannot exclude an entire category.
- The Haiku prompt includes selected tags and free text in separate fields.
