# Step Intent Integrity Design

**Status:** Approved design — 2026-07-29

## Goal

Generated food intents, activity/culture place verification, required/excluded
constraints, and AI fallback parsing must agree on the meaning of a user intent.
The system must not treat broad search expansions or broad cuisine labels as proof
of a precise required or excluded food request.

## Scope

This design addresses the five review findings from the 2026-07-28 intent changes:

1. Classify generated coffee, beverage, and dessert food records as `cafe`, not
   unconditionally as `meal`.
2. Allow activity and culture candidates introduced by the taxonomy through the
   category verifier.
3. Make exclusions precise enough that excluding a dish does not exclude an
   entire cuisine.
4. Prevent level-1 and level-2 search expansion evidence from satisfying a
   required intent.
5. Replace the full generated-food dictionary in the AI fallback prompt with a
   bounded request-local retrieval set.

No database schema, API response schema, or user-facing copy changes are part of
this work.

## Chosen Architecture

### 1. Generated-food classification stays data-driven

`FoodIntentEntry` gains the intent metadata consumed by the unified dictionary:
`domain`, `intentType`, `targetCategory`, and `categoryNameKeywords`.

The standard-data collector preserves its available classification values. A
deterministic classifier maps those values to `meal` or `cafe`. An explicit,
versioned override table is authoritative for ambiguous records. Coffee, drinks,
bakery/dessert, ice cream, and bingsu records are listed or pattern-classified as
`cafe`; unclassified records default to `meal`.

The generated Edge module is rendered with the metadata, and
`food-intent-dictionary.ts` forwards it rather than assigning every generated
record `food/dish/meal`.

### 2. Category eligibility and precise intent proof are separate

`verifiedPlaceMatchesCategory(place, category)` continues to answer whether a
place is eligible for a broad course step. Its activity/culture keyword coverage
is expanded for every taxonomy subtype that can be returned by Kakao without a
reliable group code.

`placeMatchesStepIntent(place, intent)` answers the stronger question of whether
a place proves the exact requested intent. It remains the required-intent gate.
It evaluates exact search evidence, canonical/alias name matches, and only the
intent entry's compatible narrow category keywords.

The implementation may introduce a shared helper such as
`verifiedPlaceMatchesIntentCategory(place, category, intent)` where a call site
needs both checks, but it must preserve the two semantic layers above.

### 3. Strict evidence policy for hard constraints

Positive preferred intent scoring may use all three search expansion levels.
Required and excluded intent decisions use only strict evidence:

- `step_intent` evidence with matching canonical and `expansionLevel === 0`;
- a canonical term or alias present in the place name; or
- a narrow, dish/subtype-specific category keyword.

Broad cuisine and venue keywords (`일식`, `중식`, `양식`, `육류,고기`, and
equivalent broad expansions) must not be strict evidence for a dish. Positive
and exclusion matching use separate functions so a future score-oriented
positive rule cannot accidentally broaden the exclusion hard filter.

For safety, generated food entries with no verified narrow Kakao category mapping
have an empty `categoryNameKeywords` array. They can be proven by exact evidence
or name, never by a guessed broad cuisine category.

### 4. Bounded AI fallback retrieval

The rule parser remains the first pass. The AI fallback prompt receives:

- the curated non-generated taxonomy (activities, culture, drinks, venue types,
  and curated dishes);
- rule-parser intents already found for the request;
- up to 20 generated-food candidates retrieved from the free text by normalized
  canonical/alias match, ordered by exactness then stable Korean lexical order;
- ordered course steps and the original free text.

If no generated candidate matches, the prompt includes none; the existing
instruction allowing a concise unregistered canonical stays in place. The prompt
must not serialize all generated food intents.

## Data Flow

`standard-data row + overrides`
→ `FoodIntentEntry` with classification metadata
→ generated dictionary module
→ rule parser and request-local AI retrieval
→ Kakao search evidence with expansion level
→ broad course-step eligibility + strict required/exclusion proof
→ ranking and course selection.

## Acceptance Criteria

- A `meal + cafe` course maps `커피`, `라떼`, `케이크`, and `빙수` to the cafe
  step, while `닭갈비` maps to the meal step.
- Each expanded activity/culture term has a representative Kakao category-name
  fixture that is eligible for its broad course category.
- `초밥 말고 라멘` retains a ramen candidate categorized as Japanese food;
  `마라탕 말고 짜장면` retains a Chinese-food candidate; `삼겹살 제외` retains a
  generic barbecue candidate unless strict pork evidence exists.
- A candidate found only through an expansion-level 1 or 2 search cannot satisfy
  a required dish, while a level-0 result, matching place name, or narrow detail
  category can.
- The fallback prompt never contains all 1,235 generated entries and its
  generated-food section contains at most 20 candidates.
- Existing preferred-intent expansion scoring remains level-aware: exact > level
  1 > level 2.

## Verification

Use TDD for the classification and hard-constraint behavior. Run focused Jest
suites while changing each boundary, then `npm run validate` and the full Jest
suite before deployment. Because shared Edge modules are bundled into both
`recommend-date` and `replacement-candidates`, deploy both functions together
after automated verification and exercise the listed Korean requests against
real Kakao results.

## Non-goals

- Inferring a dish from a broad cuisine category.
- Adding a new database taxonomy table.
- Changing course-step categories or the public recommendation contracts.
