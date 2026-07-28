# Food Intent Dictionary Sync Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** 식품의약품안전처 식품영양성분 DB를 수동 배치로 수집·정제해, 곱창·치킨·양꼬치·닭갈비 등의 음식명을 로컬 규칙 파서와 Kakao 검색에 제공한다.

**Architecture:** `npm run sync:food-intents`가 공공 API의 모든 페이지를 수집하고 raw snapshot, 검토용 제외 목록, versioned JSON, Edge용 TypeScript 모듈을 생성한다. 추천 요청은 공공 API를 호출하지 않고 generated 음식 사전과 기존 curated 사전을 하나의 runtime dictionary로 읽는다.

**Tech Stack:** Node.js/`tsx`, TypeScript, Jest, Deno Supabase Edge Functions, 식품의약품안전처 식품영양성분DB REST API.

## Global Constraints

- 추천 요청 경로에서는 공공 API를 절대 호출하지 않는다.
- API 키는 `FOOD_NTR_CPNT_DB_SERVICE_KEY` 환경 변수로만 읽고 `.env.*.local` 밖에 저장하지 않는다.
- API endpoint는 `GET https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02`이며 `type=json`으로 요청한다.
- `data/food-source-raw.json`은 로컬 재현용으로 Git ignore한다. overrides, generated, excluded, Edge module은 Git 추적한다.
- generated 음식은 `targetCategory: 'meal'`, `intentType: 'dish'`로만 변환한다.
- curated 사전은 generated 사전보다 우선하며, generated 데이터는 curated canonical의 alias·확장·compatibility를 덮어쓰지 않는다.
- API 원본의 브랜드 상품·원재료·영양/용량 표기·비식당 메뉴는 자동 포함하지 않는다.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `scripts/food-intent-sync-lib.ts` | 응답 해석, 이름 정규화, 후보/제외 생성, overrides 적용 | Create |
| `scripts/sync-food-intents.ts` | 인증·페이지 수집·파일 출력 CLI | Create |
| `scripts/.env.food-intents.local.example` | 동기화 전용 키 예시 | Create |
| `data/food-intents-overrides.json` | 수동 include/exclude/alias/검색어 보정 | Create |
| `data/food-intents.generated.json` | versioned 정제 음식 사전 | Create/Generated |
| `data/food-intents-excluded.json` | 자동 제외 원천명과 reason | Create/Generated |
| `supabase/functions/_shared/food-intents.generated.ts` | Deno runtime용 generated JSON mirror | Create/Generated |
| `supabase/functions/_shared/food-intent-dictionary.ts` | curated+generated unified dictionary | Create |
| `supabase/functions/_shared/step-intent.ts` | unified dictionary와 alias-first search term 사용 | Modify |
| `supabase/functions/_shared/step-intent-resolve.ts` | unified dictionary로 residual/AI label 처리 | Modify |
| `supabase/functions/_shared/recommendation-prompt.ts` | unified canonical 목록을 보조 AI에 제공 | Modify |
| `package.json`, `.gitignore` | sync command와 raw ignore | Modify |
| `__tests__/food-intent-sync.test.ts`, `__tests__/stepIntent.test.ts` | sync·parser 회귀 검증 | Create/Modify |

## Data Contracts

```ts
export type FoodIntentEntry = {
  canonicalTerm: string;
  aliases: string[];
  searchExpansions: string[];
  cuisineCategory?: string;
};

export type GeneratedFoodIntentFile = {
  schemaVersion: 1;
  generatedAt: string;
  source: {
    dataset: '식품의약품안전처_식품영양성분DB정보';
    endpoint: 'FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';
    totalSourceRows: number;
    acceptedCount: number;
    excludedCount: number;
  };
  entries: FoodIntentEntry[];
};

export type FoodIntentOverrides = {
  include: FoodIntentEntry[];
  excludeCanonicalTerms: string[];
  aliasesByCanonicalTerm: Record<string, string[]>;
  searchExpansionsByCanonicalTerm: Record<string, string[]>;
  cuisineCategoryByCanonicalTerm: Record<string, string>;
};
```

`food-intents.generated.ts`는 JSON의 `entries`를 `GENERATED_FOOD_INTENTS`로 export하는 byte-stable mirror다. Deno Edge는 이 TypeScript 모듈만 import하므로 Node/Jest JSON import 설정에 의존하지 않는다.

### Task 1: Write and test the pure curation pipeline

**Files:**
- Create: `scripts/food-intent-sync-lib.ts`
- Create: `__tests__/food-intent-sync.test.ts`

**Interfaces:**
- Produces: `collectFoodRows(payload)`, `buildFoodIntentArtifacts(rows, overrides)`, `renderFoodIntentModule(entries)`.

- [ ] **Step 1: Add failing API-envelope and curation tests**

```ts
expect(collectFoodRows({
  body: { totalCount: 2, items: [{ FOOD_NM_KR: '야채곱창' }, { FOOD_NM_KR: '치킨' }] },
})).toEqual([{ sourceName: '야채곱창' }, { sourceName: '치킨' }]);

expect(() => collectFoodRows({
  header: { resultCode: '30', resultMsg: 'SERVICE ERROR' }, body: { items: [] },
})).toThrow('Food API returned 30: SERVICE ERROR');
```

Add fixture rows `야채곱창(조리식품)`, `곱창구이`, and `닭가슴살 원재료`; assert the first two become canonical `곱창` aliases after overrides and the last is excluded with reason `ingredient`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand __tests__/food-intent-sync.test.ts`

Expected: FAIL because the sync library is absent.

- [ ] **Step 3: Implement deterministic curation**

Use `FOOD_NM_KR` as the source name and retain its unmodified value in review output. Normalize with NFKC, bracket/parenthesis metadata removal, whitespace collapse, and trim. Reject names outside 2–30 Korean characters or matching:

```ts
const NON_RESTAURANT_PATTERNS = [
  /(?:원재료|농산물|수산물|축산물|분말|추출물|농축액|시럽|소스|조미료|첨가물)/,
  /(?:mg|g|ml|kcal|%|1회\s*제공량|영양성분)/i,
  /(?:주식회사|㈜|유한회사|브랜드|상품|제조|제품)/,
];
```

Apply `excludeCanonicalTerms` before grouping; apply `include`, alias additions, expansion additions, and cuisine overrides afterwards. Canonical grouping is override-first; otherwise use the shortest accepted normalized member. Search terms are `[canonical, ...searchExpansions]`, stable de-duplicated and capped at three. Sort generated entries by `ko-KR` canonical order.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --runInBand __tests__/food-intent-sync.test.ts`

Expected: PASS.

### Task 2: Build the manual authenticated sync command

**Files:**
- Create: `scripts/sync-food-intents.ts`, `scripts/.env.food-intents.local.example`, `data/food-intents-overrides.json`
- Modify: `package.json`, `.gitignore`
- Test: `__tests__/food-intent-sync.test.ts`

**Interfaces:**
- Produces: `syncFoodIntents({ fetchImpl, serviceKey, now, paths })` for tests and the CLI wrapper for operators.

- [ ] **Step 1: Add a failing pagination/output test**

Mock page 1 with `body.totalCount: 3` and page 2 with the last record. Assert `serviceKey`, `type=json`, `pageNo`, and `numOfRows` query params; assert no artifact is written if a later page fails.

```ts
expect(fetchImpl).toHaveBeenCalledTimes(2);
expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('pageNo')).toBe('1');
expect(JSON.parse(files['food-intents.generated.json']).entries).toHaveLength(3);
expect(files['food-intents.generated.ts']).toContain('GENERATED_FOOD_INTENTS');
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand __tests__/food-intent-sync.test.ts`

Expected: FAIL because `syncFoodIntents` is absent.

- [ ] **Step 3: Implement fetch and atomic output flow**

Request every page with:

```ts
const url = new URL('https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02');
url.searchParams.set('serviceKey', serviceKey);
url.searchParams.set('type', 'json');
url.searchParams.set('pageNo', String(pageNo));
url.searchParams.set('numOfRows', String(pageSize));
```

Fetch page 1, require numeric `body.totalCount`, calculate `Math.ceil(totalCount / pageSize)`, then fetch pages sequentially. Reject non-2xx, malformed JSON, bad API header, missing total count, or a later short/failed page before any final artifact write. After successful curation write raw pages to `data/food-source-raw.json`, generated JSON, excluded JSON, and the TypeScript mirror.

Add:

```json
"sync:food-intents": "tsx --env-file=scripts/.env.food-intents.local scripts/sync-food-intents.ts"
```

to `package.json`; add `data/food-source-raw.json` to `.gitignore`; create the local example containing `FOOD_NTR_CPNT_DB_SERVICE_KEY=` only. Seed overrides for `곱창`, `치킨`, `양꼬치`, and `닭갈비` so the initial release guarantees the known missing foods.

- [ ] **Step 4: Verify command behavior**

Run: `npm test -- --runInBand __tests__/food-intent-sync.test.ts`

Expected: PASS, including secret-free output and no-partial-write behavior.

- [ ] **Step 5: Perform and review the first sync**

Run: `npm run sync:food-intents -- --page-size=1000`

Expected: exit 0; raw snapshot is untracked; generated dictionary contains 500–1,500 entries; every excluded row has a reason. Correct accepted data only through `data/food-intents-overrides.json`, then rerun.

### Task 3: Connect generated foods to the runtime parser

**Files:**
- Create: `supabase/functions/_shared/food-intent-dictionary.ts`
- Modify: `supabase/functions/_shared/step-intent.ts`, `supabase/functions/_shared/step-intent-resolve.ts`, `supabase/functions/_shared/recommendation-prompt.ts`
- Test: `__tests__/stepIntent.test.ts`

**Interfaces:**
- Produces: `ALL_STEP_INTENT_DICTIONARY` and `getStepIntentDictionaryEntry(canonicalTerm)`.

- [ ] **Step 1: Add failing generated-food parser tests**

```ts
const parsed = parseStepIntents(request('오늘은 야채곱창 꼭 먹고 싶어'));
expect(parsed.stepIntents).toEqual([expect.objectContaining({
  canonicalTerm: '곱창',
  kakaoSearchTerms: ['야채곱창', '곱창', '곱창집'],
  strength: 'required',
})]);
expect(parseStepIntents(request('닭갈비 먹자')).stepIntents[0]?.canonicalTerm).toBe('닭갈비');
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts`

Expected: FAIL because generated foods are not in the current parser dictionary and search terms currently start with canonical only.

- [ ] **Step 3: Implement unified lookup and alias-first terms**

Map each generated entry to `StepIntentDictionaryEntry` with meal/dish values, Korean label equal to canonical, English label equal to canonical, empty English aliases, and empty compatibility keywords. Build:

```ts
export const ALL_STEP_INTENT_DICTIONARY = [
  ...STEP_INTENT_DICTIONARY,
  ...generatedFoodEntriesNotShadowedByCuratedCanonical,
] as const;
```

Change alias matching to return the actual matching Korean alias. Build parsed search terms as `[matchedTerm, canonicalTerm, ...expansions]`, stable de-duplicated and capped at three; retain canonical in every intent for merge, ranking evidence, and required validation. Replace all direct `STEP_INTENT_DICTIONARY` reads in parser, resolver residual stripping, and AI parse prompt construction with unified lookup.

- [ ] **Step 4: Verify parser/search regressions**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts __tests__/stepIntentResolve.test.ts __tests__/stepIntentResolvedThreading.test.ts __tests__/recommend-date-search-server.test.ts __tests__/recommend-date-course-selection.test.ts`

Expected: PASS.

### Task 4: Validate release artifacts and operator workflow

**Files:**
- Verify: all files above

- [ ] **Step 1: Verify generated data invariants**

Run: `npx tsx -e "import entries from './data/food-intents.generated.json' with { type: 'json' }; const names = entries.entries.map((x: { canonicalTerm: string }) => x.canonicalTerm); if (new Set(names).size !== names.length) throw new Error('duplicate canonical'); if (names.some((x: string) => !x.trim())) throw new Error('empty canonical'); console.log(names.length);"`

Expected: one integer in the 500–1,500 range and no error.

- [ ] **Step 2: Run complete validation**

Run: `npm test -- --runInBand __tests__/food-intent-sync.test.ts __tests__/stepIntent.test.ts __tests__/stepIntentResolve.test.ts __tests__/stepIntentResolvedThreading.test.ts __tests__/recommend-date-search-server.test.ts __tests__/recommend-date-course-selection.test.ts && npm run validate && git diff --check`

Expected: all suites pass, TypeScript exits 0, and no whitespace error.

- [ ] **Step 3: Review tracked output before commit**

Run: `git status --short && git diff -- data/food-intents-overrides.json data/food-intents.generated.json data/food-intents-excluded.json supabase/functions/_shared/food-intents.generated.ts`

Expected: raw snapshot and API key are absent from tracked changes; every generated change is explained by source data or overrides.

## Plan Self-Review

- **Coverage:** The plan covers periodic fetch, filtering, raw/generated/override/exclusion artifacts, local runtime parsing, Kakao alias-first queries, and test/validation gates.
- **Scope boundary:** Keyword-selection UI, Supabase persistence, category-wide exclusion semantics, and trailing required-marker parsing remain separate follow-up work.
- **Source contract:** The official dataset is a REST API offering JSON/XML food-name, classification, code, nutrient, source/manufacturer-related fields. The adapter fails loudly if `FOOD_NM_KR` is absent instead of silently generating an empty dictionary.
