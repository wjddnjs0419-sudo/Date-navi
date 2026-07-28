# Step Intent Rule–AI Merge Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** Preserve deterministic rule-parser positive intents when the AI fallback runs, while allowing the AI to add non-duplicate intents and allowing explicit negations to win.

**Architecture:** Keep `resolveStepIntents()` as the sole merge boundary. Add a pure exported merge helper that accepts rule positives, AI positives, and the merged exclusions, then returns stable, de-duplicated positives. The handler and downstream search/ranking/selection remain unchanged because they already consume `resolvedStepIntents` and `resolvedExcludedIntents`.

**Tech Stack:** Deno Edge Functions TypeScript, Jest, root TypeScript validation.

## Global Constraints

- Do not change the public recommendation request schema or AI response schema.
- Preserve rule-parser exact-match fields (`stepId`, category, canonical term, search expansions, labels) for a duplicate intent.
- Define duplicate identity as normalized `{stepId, canonicalTerm}`.
- For a duplicate positive intent, `required` wins over `preferred`.
- Any explicit negation for the same normalized canonical term suppresses a positive intent, regardless of source or step.
- Keep `source: 'ai'` when the AI was successfully invoked, even if every resulting positive intent originated from rules.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `supabase/functions/_shared/step-intent-resolve.ts` | Pure rule/AI positive merge and resolver application | Modify |
| `__tests__/stepIntentResolve.test.ts` | Resolver-level regression, conflict, and de-duplication coverage | Modify |
| `__tests__/recommend-date-phase7-handler.test.ts` | Handler wiring regression: preserved intent reaches actual search request | Modify |

### Task 1: Specify the resolver merge contract with failing tests

**Files:**
- Test: `__tests__/stepIntentResolve.test.ts`

**Interfaces:**
- Consumes: `resolveStepIntents(request, { invokeAi })`.
- Produces: expectations for the exported `mergeRuleAndAiIntents(ruleIntents, aiIntents, excludedIntents)` helper and the resolver output.

- [x] **Step 1: Add a fallback-omission regression test**

Add a test in `describe('resolveStepIntents — 고재현 AI 게이트', ...)` that calls the resolver with `삼겹살 먹고 조용하고 분위기 좋은 감성 카페 가고싶어`; make `invokeAi` return only a cafe intent. Assert AI was called and `resolved.stepIntents` contains both `삼겹살` and the AI cafe canonical term, in that order.

```ts
expect(resolved.source).toBe('ai');
expect(resolved.stepIntents.map((intent) => intent.canonicalTerm))
  .toEqual(['삼겹살', '감성 카페']);
```

- [x] **Step 2: Add merge-policy unit tests**

Import `mergeRuleAndAiIntents` and use small literal `ParsedStepIntent` fixtures to cover all policy branches:

```ts
expect(mergeRuleAndAiIntents([rulePork], [aiPorkRequired], [])).toEqual([
  { ...rulePork, strength: 'required' },
]);
expect(mergeRuleAndAiIntents([rulePork], [aiCafe], [])).toEqual([rulePork, aiCafe]);
expect(mergeRuleAndAiIntents([rulePork], [aiPork], [negatedPork]))
  .toEqual([]);
```

Make `aiPork` intentionally differ in `kakaoSearchTerms` and `displayLabel`; assert the result retains the rule values so exact dictionary search behavior cannot be overwritten.

- [x] **Step 3: Run the focused tests to establish the regression**

Run: `npm test -- --runInBand __tests__/stepIntentResolve.test.ts`

Expected: FAIL. The omission regression returns only `감성 카페`; the helper import fails until Task 2 adds it.

### Task 2: Implement pure, deterministic rule–AI merging

**Files:**
- Modify: `supabase/functions/_shared/step-intent-resolve.ts:90-176`
- Test: `__tests__/stepIntentResolve.test.ts`

**Interfaces:**
- Consumes: `ParsedStepIntent[]` for rule positives, AI positives, and already-merged exclusions.
- Produces: `export function mergeRuleAndAiIntents(ruleIntents, aiIntents, excludedIntents): ParsedStepIntent[]`.

- [x] **Step 1: Add normalized identity helpers and merge function**

Place the helper above `resolveStepIntents`. Use locale-lowercased NFKC normalization already available in this file.

```ts
const intentIdentity = (intent: ParsedStepIntent) =>
  `${normalize(intent.stepId)}:${normalize(intent.canonicalTerm)}`;

export function mergeRuleAndAiIntents(
  ruleIntents: ParsedStepIntent[],
  aiIntents: ParsedStepIntent[],
  excludedIntents: ParsedStepIntent[],
): ParsedStepIntent[] {
  const excludedTerms = new Set(excludedIntents.map((intent) => normalize(intent.canonicalTerm)));
  const merged = new Map<string, ParsedStepIntent>();
  for (const intent of [...ruleIntents, ...aiIntents]) {
    if (excludedTerms.has(normalize(intent.canonicalTerm))) continue;
    const key = intentIdentity(intent);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, intent);
    } else if (existing.strength !== 'required' && intent.strength === 'required') {
      merged.set(key, { ...existing, strength: 'required' });
    }
  }
  return [...merged.values()];
}
```

This preserves rule fields because rules are inserted first; an AI duplicate can only upgrade `strength`.

- [x] **Step 2: Apply the helper at the AI-success boundary**

Replace the direct assignment in the `try` branch with a named merged exclusion array and the helper call:

```ts
const excludedIntents = [...rule.excludedIntents, ...(ai.excludedIntents ?? [])];
return {
  source: 'ai',
  stepIntents: mergeRuleAndAiIntents(rule.stepIntents, ai.stepIntents, excludedIntents),
  excludedIntents,
  unsupported: ai.unsupported ?? [],
  conflicts: ai.conflicts ?? [],
};
```

Update the nearby handler/resolver comment from “AI 병합” only if it inaccurately describes the final behavior.

- [x] **Step 3: Run resolver tests**

Run: `npm test -- --runInBand __tests__/stepIntentResolve.test.ts`

Expected: PASS, including the fallback omission, duplicate strength, and negation-precedence cases.

### Task 3: Prove the merged result reaches the recommendation pipeline

**Files:**
- Test: `__tests__/recommend-date-phase7-handler.test.ts`

**Interfaces:**
- Consumes: `handleRecommendDate()` with injected `parseStepIntentsAi` and `searchCandidates` dependencies.
- Produces: a regression assertion that the handler’s search request includes the preserved rule intent in `resolvedStepIntents`.

- [x] **Step 1: Add a handler integration regression test**

Create an AI mock that returns only a cafe intent for the mixed request. Capture the `RecommendationRequest` passed into `searchCandidates` and assert both intent terms are present.

```ts
expect(searchCandidates).toHaveBeenCalledWith(expect.objectContaining({
  resolvedStepIntents: expect.arrayContaining([
    expect.objectContaining({ canonicalTerm: '삼겹살' }),
    expect.objectContaining({ canonicalTerm: '감성 카페' }),
  ]),
}));
```

Use candidates that satisfy the existing course selection fixture so the test asserts a `200` response as well.

- [x] **Step 2: Run the handler regression test**

Run: `npm test -- --runInBand __tests__/recommend-date-phase7-handler.test.ts`

Expected: PASS. The captured downstream request carries both the exact rule intent and the AI-added intent.

### Task 4: Run complete relevant verification

**Files:**
- Verify only; no source changes expected.

- [x] **Step 1: Run all step-intent and recommendation handler tests**

Run: `npm test -- --runInBand __tests__/stepIntentResolve.test.ts __tests__/stepIntentResolvedThreading.test.ts __tests__/recommend-date-phase7-handler.test.ts __tests__/recommend-date-search-server.test.ts __tests__/recommend-date-course-selection.test.ts`

Expected: PASS. This verifies resolver behavior, resolved-value threading, search-plan use, and required-intent selection validation.

- [x] **Step 2: Run repository type validation**

Run: `npm run validate`

Expected: exit code 0.

- [x] **Step 3: Review the diff before handoff**

Run: `git diff --check && git diff -- supabase/functions/_shared/step-intent-resolve.ts __tests__/stepIntentResolve.test.ts __tests__/recommend-date-phase7-handler.test.ts`

Expected: no whitespace errors; only resolver merge and its tests changed.

## Plan Self-Review

- **Spec coverage:** Tasks 1–2 cover rule-positive preservation, AI-only additions, duplicate identity, required-strength precedence, and negation precedence. Task 3 confirms the resolved result reaches the actual downstream request. Task 4 covers regression and type validation.
- **Intentional scope limit:** no dictionary, prompt, public API, metadata, or downstream algorithm change is needed because the fault is exclusively at the resolver’s AI-success merge boundary.
- **Type consistency:** `ParsedStepIntent` and `StepIntentStrength` already define all fields used by the helper; no new request type or schema field is introduced.
