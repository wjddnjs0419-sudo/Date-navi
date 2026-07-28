# Activity and Culture Dictionary Expansion Design

## Goal

Extend the existing step-intent dictionary so the curated activity and culture terms requested for date-course recommendations bind to their matching course step and produce Kakao search queries. Keep the current dictionary schema and every existing parser/search/selection contract unchanged.

## Scope

- Add the requested activity terms: sports, outdoor leisure, and hands-on classes.
- Add the requested culture terms: museums, venues, reading spaces, and cultural facilities.
- Normalize the existing board-game entry to canonical `보드게임`, retaining `보드게임카페` as an alias.
- Preserve the existing `전시` entry for compatibility; add `전시관` as its own more specific intent.
- Give every new entry a canonical term, Korean aliases where useful, 0–2 Kakao search expansions, English display label, and a compatible Kakao category-name keyword list.

## Non-goals

- Do not migrate the dictionary to a new `aliases`/`searchExpansions`/`domain` schema in this phase.
- Do not auto-add or replace a course step (for example, changing cafe to drinks from free text).
- Do not add uncurated long-tail entries or external logging infrastructure.

## Data and Matching Rules

- `canonicalTerm` is the user-facing normalized intent.
- `koAliases`/`enAliases` recognize alternate user wording.
- `expansions` are Kakao query terms and stay at the existing maximum of two.
- `targetCategory` remains `activity` or `culture`.
- `compatibleCategoryNameKeywords` is conservative: broad Kakao category names are only used when they identify the subtype; otherwise exact search evidence or name matching remains the proof.
- Longer/specific phrases precede shorter overlapping phrases so parser ordering preserves the user's intended canonical term.

## Verification

- Table-driven parser tests assert every requested term binds to its matching activity or culture step.
- Existing intent resolution, ranking, search, course selection, and handler regressions remain green.
- Run `npm run validate` and `git diff --check`.

## Follow-up Phase

After this curated expansion is stable, migrate all dictionary entries to a unified schema that explicitly separates user aliases, Kakao search expansions, course-step targeting, and Kakao category matching. Add a reviewed log pipeline for unrecognized concrete terms before expanding beyond the curated set.
