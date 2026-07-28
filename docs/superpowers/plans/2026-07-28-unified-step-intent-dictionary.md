# Unified Step-Intent Dictionary Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** Migrate every curated step intent to one schema that separates user-language aliases from Kakao search expansions while preserving parser, AI fallback, ranking, and course-selection behavior.

**Architecture:** Replace per-language alias fields and the ambiguous `expansions` field with a unified dictionary record. The rule parser matches `canonicalTerm` and `aliases`; it emits `kakaoSearchTerms` as `[canonicalTerm, ...searchExpansions]`. `targetCategory` remains the single course-step binding contract; new `domain` is an analytics and curation classification, not a routing instruction.

**Tech Stack:** TypeScript, Deno Edge shared modules, Jest, existing recommendation request contracts.

## Global Constraints

- Keep the public `ParsedStepIntent` shape unchanged, including `intentType`, `canonicalTerm`, and `kakaoSearchTerms`.
- `kakaoSearchTerms` stays a stable de-duplicated list of 1–3 strings, with the canonical term first.
- Do not introduce `compatibleSteps`: each dictionary record has one `targetCategory` because a rule intent binds to one course step.
- Introduce `domain` only for curation/analytics; it must not alter ranking or step selection in this phase.
- Preserve all existing Korean and English recognition behavior while merging `koAliases` and `enAliases` into `aliases`.
- Preserve all current curated entries, including `전시`, `보드게임`, activity/culture additions, and drinks entries.
- Use the existing hard requirement/exclusion semantics unchanged.

## Execution Decisions (2026-07-28)

- Generic drink taxonomy is intentional: `wine`/`와인` normalize to `와인`, and `cocktail`/`cocktails`/`칵테일` normalize to `칵테일`; explicit bar phrases (`wine bar`/`와인바`, `cocktail bar`/`칵테일바`) continue to target their bar canonicals. This is the approved exception to preserving prior canonical mappings.
- Collect every dictionary occurrence, then retain only the longest non-overlapping matches. For example, `수제맥주 말고 와인` yields excluded `수제맥주` (not the overlapping generic `맥주`) and preferred `와인`; `수제맥주 말고 맥주` preserves the later, non-overlapping preferred `맥주`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `supabase/functions/_shared/step-intent-dictionary.ts` | Unified curated intent records and schema-level invariants | Modify |
| `supabase/functions/_shared/step-intent.ts` | Alias matching, rule parsing, and Kakao search-term assembly | Modify |
| `supabase/functions/_shared/step-intent-resolve.ts` | Residual-term stripping and AI display-label lookup | Modify |
| `supabase/functions/_shared/recommendation-prompt.ts` | Registered-canonical payload supplied to the AI parser | Modify |
| `__tests__/stepIntent.test.ts` | Rule parsing, aliases, and canonical/search separation | Modify |
| `__tests__/stepIntentResolve.test.ts` | Rule/AI merge and residual-text behavior | Modify |
| `__tests__/generateAiParseStepIntents.test.ts` | AI parser prompt/schema regression | Modify as needed |

## Unified Data Contract

```ts
export type StepIntentDomain = 'food' | 'cafe' | 'alcohol' | 'activity' | 'culture';

export type StepIntentDictionaryEntry = {
  canonicalTerm: string;
  aliases: readonly string[];
  searchExpansions: readonly string[];
  domain: StepIntentDomain;
  targetCategory: StepIntentTargetCategory;
  intentType: StepIntentType;
  categoryNameKeywords: readonly string[];
  displayLabel: { ko: string; en: string };
};
```

`aliases` contains both Korean and English user phrases. The parser applies word boundaries only to aliases made of Latin letters, digits, and spaces; Korean aliases remain substring matches. `categoryNameKeywords` replaces `compatibleCategoryNameKeywords` without changing the positive/excluded candidate matcher’s evidence-first semantics.

### Task 1: Add schema invariants and RED migration tests

**Files:**
- Modify: `supabase/functions/_shared/step-intent-dictionary.ts`
- Modify: `__tests__/stepIntent.test.ts`

**Interfaces:**
- Consumes: `STEP_INTENT_DICTIONARY`.
- Produces: a runtime-validatable normalized record set with unified aliases and search expansions.

- [ ] **Step 1: Add a schema-shape invariant test**

```ts
import { STEP_INTENT_DICTIONARY } from '../supabase/functions/_shared/step-intent-dictionary';

it('uses one normalized dictionary schema for every entry', () => {
  for (const entry of STEP_INTENT_DICTIONARY) {
    expect(entry).toEqual(expect.objectContaining({
      canonicalTerm: expect.any(String), aliases: expect.any(Array),
      searchExpansions: expect.any(Array), domain: expect.any(String),
      targetCategory: expect.any(String), intentType: expect.any(String),
      categoryNameKeywords: expect.any(Array), displayLabel: expect.any(Object),
    }));
    expect(Array.isArray(entry.searchExpansions)).toBe(true);
    expect(entry.searchExpansions.length).toBeLessThanOrEqual(2);
  }
});
```

- [ ] **Step 2: Add a user-intent/search-query separation test**

```ts
const parsed = parseStepIntents(request('도자기 만들고 싶어', [{ id: 'activity', category: 'activity' }]));
expect(parsed.stepIntents[0]).toMatchObject({
  canonicalTerm: '도자기 체험',
  kakaoSearchTerms: ['도자기 체험', '도자기 공방', '도예 체험'],
});
```

- [ ] **Step 3: Verify RED**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts -t "normalized dictionary|search expansions"`

Expected: FAIL because the old record fields are still present and parser reads `koAliases`/`enAliases`/`expansions`.

### Task 2: Migrate all curated records to the unified schema

**Files:**
- Modify: `supabase/functions/_shared/step-intent-dictionary.ts`
- Test: `__tests__/stepIntent.test.ts`

**Interfaces:**
- Produces: `STEP_INTENT_DICTIONARY: readonly StepIntentDictionaryEntry[]` using only the unified fields.

- [ ] **Step 1: Replace old schema fields in the type and every record**

```ts
{
  canonicalTerm: '하이볼',
  aliases: ['하이볼', 'highball'],
  searchExpansions: ['하이볼바', '위스키바'],
  domain: 'alcohol',
  targetCategory: 'drinks',
  intentType: 'drink_type',
  categoryNameKeywords: ['하이볼', '위스키바'],
  displayLabel: { ko: '하이볼', en: 'Highball' },
}
```

Map domains consistently: dishes/cuisines to `food`, rooftop cafes to `cafe`, all drinks venues/beverages to `alcohol`, sport/classes/outdoor terms to `activity`, and exhibition/venue/reading/facility terms to `culture`. Preserve current canonical terms, aliases, labels, and category matcher keywords; rename fields rather than discarding information.

- [ ] **Step 2: Add a dictionary integrity guard**

```ts
export function assertStepIntentDictionary(entries: readonly StepIntentDictionaryEntry[]): void {
  const canonicals = new Set<string>();
  for (const entry of entries) {
    if (!entry.canonicalTerm.trim() || canonicals.has(entry.canonicalTerm)) throw new Error('invalid step intent canonical');
    if (entry.searchExpansions.length > 2) throw new Error(`too many search expansions: ${entry.canonicalTerm}`);
    canonicals.add(entry.canonicalTerm);
  }
}

assertStepIntentDictionary(STEP_INTENT_DICTIONARY);
```

- [ ] **Step 3: Verify GREEN**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts`

Expected: PASS; every activity/culture/drinks term retains its canonical and its first two Kakao queries.

### Task 3: Make parser matching and search generation consume unified fields

**Files:**
- Modify: `supabase/functions/_shared/step-intent.ts`
- Test: `__tests__/stepIntent.test.ts`

**Interfaces:**
- Consumes: `aliases`, `searchExpansions`, `categoryNameKeywords`.
- Produces: `parseStepIntents(request): ParsedStepIntents` without references to legacy dictionary fields.

- [ ] **Step 1: Add failing language-boundary tests**

```ts
expect(parseStepIntents(request('pasta is a must')).stepIntents[0]?.canonicalTerm).toBe('파스타');
expect(parseStepIntents(request('compassion')).stepIntents).toEqual([]);
expect(parseStepIntents(request('compassion pasta')).stepIntents[0]?.canonicalTerm).toBe('파스타');
expect(parseStepIntents(request('도자기 만들고 싶어', [{ id: 'activity', category: 'activity' }]))
  .stepIntents[0]?.canonicalTerm).toBe('도자기 체험');
```

- [ ] **Step 2: Implement unified alias matching**

```ts
const isLatinAlias = (alias: string) => /^[a-z0-9 ]+$/i.test(alias);
for (const alias of [entry.canonicalTerm, ...entry.aliases]) {
  const match = isLatinAlias(alias)
    ? new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i').exec(text)
    : null;
  const index = match ? match.index : isLatinAlias(alias) ? -1 : text.indexOf(normalize(alias));
  if (index >= 0) return { index, matchedLength: match ? match[0].length : normalize(alias).length };
}
```

Build search terms with `stableUnique([entry.canonicalTerm, ...entry.searchExpansions]).slice(0, 3)`. Replace category matching reads with `entry.categoryNameKeywords`.

- [ ] **Step 3: Verify GREEN**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts`

Expected: PASS with no legacy-field references in `step-intent.ts`.

### Task 4: Migrate resolver and AI parser prompt consumers

**Files:**
- Modify: `supabase/functions/_shared/step-intent-resolve.ts`
- Modify: `supabase/functions/_shared/recommendation-prompt.ts`
- Test: `__tests__/stepIntentResolve.test.ts`, `__tests__/generateAiParseStepIntents.test.ts`

**Interfaces:**
- Consumes: unified aliases and search expansions.
- Produces: the same AI parse request/response contract, now with `domain` as optional registered-term context.

- [ ] **Step 1: Add a residual-strip regression test**

```ts
expect(hasMeaningfulResidual('도자기 만들고 싶어')).toBe(false);
expect(hasMeaningfulResidual('도자기 만들고 조용한 곳')).toBe(true);
```

- [ ] **Step 2: Replace resolver legacy alias loops**

```ts
for (const entry of STEP_INTENT_DICTIONARY) {
  for (const alias of [entry.canonicalTerm, ...entry.aliases]) {
    out = removeDictionaryAlias(out, alias);
  }
}
```

Use the same Latin-boundary decision as the rule parser to avoid stripping substrings from unrelated English words.

- [ ] **Step 3: Extend only the registered-canonical AI prompt context**

```ts
const registeredCanonicals = STEP_INTENT_DICTIONARY.map((entry) => ({
  canonicalTerm: entry.canonicalTerm,
  targetCategory: entry.targetCategory,
  intentType: entry.intentType,
  domain: entry.domain,
  searchExpansions: entry.searchExpansions,
}));
```

Keep the external AI output schema unchanged: it continues to emit `kakaoSearchTerms`, not raw dictionary fields.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --runInBand __tests__/stepIntentResolve.test.ts __tests__/generateAiParseStepIntents.test.ts __tests__/stepIntentResolvedThreading.test.ts`

Expected: PASS.

### Task 5: Run recommendation regression and static verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes: parser output through Kakao query construction, ranking, candidate validation, and handler wiring.
- Produces: evidence of no recommendation behavior regression.

- [ ] **Step 1: Run dependent suites**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts __tests__/stepIntentResolve.test.ts __tests__/stepIntentResolvedThreading.test.ts __tests__/generateAiParseStepIntents.test.ts __tests__/recommend-date-ranking-server.test.ts __tests__/recommend-date-search-server.test.ts __tests__/recommend-date-course-selection.test.ts __tests__/recommend-date-phase7-handler.test.ts`

Expected: PASS.

- [ ] **Step 2: Check removed legacy fields**

Run: `rg -n "koAliases|enAliases|\.expansions|compatibleCategoryNameKeywords" supabase/functions/_shared __tests__`

Expected: no production or test references outside migration-history documentation.

- [ ] **Step 3: Run final type and diff checks**

Run: `npm run validate && git diff --check`

Expected: exit code 0.

## Plan Self-Review

- **Coverage:** the plan migrates schema data, parser matching/search generation, resolver residual stripping, and AI prompt context; then verifies every downstream consumer.
- **Compatibility:** public request and `ParsedStepIntent` contracts remain unchanged, so ranking/selection require no behavioral migration.
- **Scope boundary:** generated-food ingestion and unrecognized-term logging are not included; they can target this unified schema after it lands.
