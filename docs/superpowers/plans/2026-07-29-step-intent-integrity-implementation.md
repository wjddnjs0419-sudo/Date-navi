# Step Intent Integrity Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** Make generated food classification, broad category eligibility, strict intent proof, and AI fallback retrieval agree on user intent semantics.

**Architecture:** Generated food records carry unified-dictionary metadata from the sync pipeline. Broad category eligibility remains in `recommendation-category.ts`, while strict positive/exclusion proof is isolated in `step-intent.ts`. The fallback prompt serializes curated taxonomy plus request-local generated matches only.

**Tech Stack:** TypeScript, Deno Edge shared modules, Jest, Node sync scripts.

## Global Constraints

- No database schema, API response schema, or user-facing copy changes.
- Required and excluded dish decisions accept level-0 evidence, canonical/alias name, or narrow category keywords only.
- Preferred scoring retains level 0 > 1 > 2 behavior.
- Run `npm run validate` and full Jest before deployment; deploy `recommend-date` and `replacement-candidates` together only after automated verification.

---

### Phase 1: Generated-food metadata and classification

**Files:**
- Modify: `scripts/food-intent-sync-lib.ts`, `data/food-intents-overrides.json`, `supabase/functions/_shared/food-intent-dictionary.ts`
- Regenerate: `data/food-intents.generated.json`, `supabase/functions/_shared/food-intents.generated.ts`
- Test: `__tests__/food-intent-sync.test.ts`, `__tests__/stepIntent.test.ts`

**Produces:** Generated entries with `domain`, `intentType`, `targetCategory`, and `categoryNameKeywords`; coffee/beverage/dessert records map to `cafe` and other records default to `meal`.

- [ ] Write classification expectations for `커피`, `라떼`, `케이크`, `빙수`, and `닭갈비`.
- [ ] Run `npx jest __tests__/food-intent-sync.test.ts --runInBand`; expect the new `targetCategory` assertions to fail.
- [ ] Add deterministic classification and versioned overrides, forward generated metadata into the unified dictionary, regenerate committed artifacts.
- [ ] Re-run the focused suite and parser suite; expect pass.
- [ ] Dispatch a reviewer with the approved design and Phase 1 diff; resolve Critical/Important findings before Phase 2.

### Phase 2: Broad activity/culture eligibility

**Files:**
- Modify: `supabase/functions/_shared/recommendation-category.ts`
- Test: `__tests__/recommend-date-course-selection.test.ts`

**Consumes:** Curated activity and culture taxonomy entries.
**Produces:** `verifiedPlaceMatchesCategory` accepts a representative Kakao category-name fixture for every taxonomy subtype while retaining group-code checks.

- [ ] Add representative category-name fixtures covering activity and culture taxonomy subtypes.
- [ ] Run `npx jest __tests__/recommend-date-course-selection.test.ts --runInBand`; expect uncovered subtype fixtures to fail.
- [ ] Expand only broad-category keyword eligibility using taxonomy-derived keywords.
- [ ] Re-run the focused suite; expect pass.
- [ ] Dispatch a reviewer with the approved design and Phase 2 diff; resolve Critical/Important findings before Phase 3.

### Phase 3: Strict required and exclusion evidence

**Files:**
- Modify: `supabase/functions/_shared/step-intent.ts`, `supabase/functions/_shared/step-intent-dictionary.ts`
- Test: `__tests__/stepIntent.test.ts`, `__tests__/recommend-date-ranking-server.test.ts`

**Produces:** Separate strict matching functions that reject expansion level 1/2 and broad cuisine/venue category evidence for hard constraints without changing preferred ranking.

- [ ] Add level-1/2 required and excluded evidence regression tests plus dish-specific exclusion fixtures.
- [ ] Run `npx jest __tests__/stepIntent.test.ts __tests__/recommend-date-ranking-server.test.ts --runInBand`; expect strict-proof assertions to fail.
- [ ] Require `step_intent` level 0, canonical/alias name, or narrow entry keywords; remove broad keywords from dish strict mappings.
- [ ] Re-run focused suites; expect strict tests pass and exact/expansion scoring remains 35/12/6.
- [ ] Dispatch a reviewer with the approved design and Phase 3 diff; resolve Critical/Important findings before Phase 4.

### Phase 4: Bounded fallback retrieval

**Files:**
- Modify: `supabase/functions/_shared/food-intent-dictionary.ts`, `supabase/functions/_shared/recommendation-prompt.ts`
- Test: `__tests__/recommend-date-server.test.ts`

**Produces:** A request-local generated-food retrieval helper returning at most 20 canonical/alias matches in exactness then Korean lexical order; prompt includes curated taxonomy separately.

- [ ] Add prompt assertions that matched generated entries are present, unrelated entries absent, and generated candidates are bounded.
- [ ] Run `npx jest __tests__/recommend-date-server.test.ts --runInBand`; expect the fallback context assertion to fail.
- [ ] Implement normalized retrieval and split prompt serialization into curated taxonomy and local generated candidates.
- [ ] Re-run the focused suite; expect pass.
- [ ] Dispatch a reviewer with the approved design and Phase 4 diff; resolve Critical/Important findings before Phase 5.

### Phase 5: Integration and release verification

**Files:**
- Verify: `__tests__/recommend-date-search-server.test.ts`, `__tests__/recommend-date-ranking-server.test.ts`, `__tests__/recommend-date-course-selection.test.ts`, `__tests__/replacementCandidatesWiring.test.ts`
- Deploy together after approval: `supabase/functions/recommend-date`, `supabase/functions/replacement-candidates`

**Consumes:** Phases 1–4.
**Produces:** Verified cross-boundary behavior for meal/cafe assignment, category eligibility, strict hard constraints, and bounded fallback prompts.

- [ ] Add or extend integration regressions for `초밥 말고 라멘`, `마라탕 말고 짜장면`, and generic barbecue after `삼겹살 제외`.
- [ ] Run affected integration suites; expect pass without weakening preferred expansion scoring.
- [ ] Run `npm run validate` and `npx jest --runInBand`; resolve all failures.
- [ ] Dispatch final reviewer with the approved design and cumulative diff; resolve Critical/Important findings.
- [ ] Deploy both Edge functions together and exercise the listed Korean requests against real Kakao results only after user authorization for external deployment.
