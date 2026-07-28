# Activity and Culture Dictionary Expansion Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** Add the curated activity and culture intents to the current recommendation dictionary without changing public request or course-selection contracts.

**Architecture:** Keep `StepIntentDictionaryEntry` unchanged. Each entry supplies its normalized user intent, aliases, up to two Kakao search expansions, target course category, and conservative Kakao category-name matcher. `parseStepIntents` continues to create `ParsedStepIntent.kakaoSearchTerms` from the canonical term plus expansions.

**Tech Stack:** TypeScript, Deno Edge shared modules, Jest, existing recommendation contracts.

## Global Constraints

- Keep the existing dictionary field names and all parser/search/selection public contracts unchanged.
- Activity entries bind only to `targetCategory: 'activity'`; culture entries bind only to `targetCategory: 'culture'`.
- Keep `expansions` at no more than two terms.
- Preserve `전시` compatibility and register `전시관` as a distinct canonical intent.
- Normalize existing `보드게임카페` to canonical `보드게임` while retaining the former wording as an alias.
- Do not add automatic course-step creation or replacement.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `supabase/functions/_shared/step-intent-dictionary.ts` | Curated rule dictionary consumed by parsing, search generation, and matcher validation | Modify |
| `__tests__/stepIntent.test.ts` | Rule-parser contracts for canonical terms and binding categories | Modify |

### Task 1: Lock the curated vocabulary into parser contracts

**Files:**
- Modify: `__tests__/stepIntent.test.ts`

**Interfaces:**
- Consumes: `parseStepIntents(request)`.
- Produces: table-driven checks that every requested canonical term maps to its activity or culture step.

- [ ] **Step 1: Write the failing activity vocabulary test**

```ts
it.each(['클라이밍', '실내 사격', '공방 체험', '원데이 클래스'])('%s binds to activity', (canonicalTerm) => {
  const parsed = parseStepIntents(request(canonicalTerm, [{ id: 'activity', category: 'activity' }]));
  expect(parsed.stepIntents[0]).toMatchObject({ stepId: 'activity', stepCategory: 'activity', canonicalTerm });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts -t "activity step intent"`

Expected: requested terms that are absent from the dictionary fail or return no intent.

- [ ] **Step 3: Write the failing culture vocabulary test**

```ts
it.each(['미술관', '독립서점', '전시관', '수족관'])('%s binds to culture', (canonicalTerm) => {
  const parsed = parseStepIntents(request(canonicalTerm, [{ id: 'culture', category: 'culture' }]));
  expect(parsed.stepIntents[0]).toMatchObject({ stepId: 'culture', stepCategory: 'culture', canonicalTerm });
});
```

- [ ] **Step 4: Verify RED**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts -t "culture step intent"`

Expected: requested terms that are absent from the dictionary fail or return no intent.

### Task 2: Add activity and culture dictionary records

**Files:**
- Modify: `supabase/functions/_shared/step-intent-dictionary.ts`
- Test: `__tests__/stepIntent.test.ts`

**Interfaces:**
- Consumes: `StepIntentDictionaryEntry` fields `canonicalTerm`, `expansions`, `koAliases`, `enAliases`, `targetCategory`, and `compatibleCategoryNameKeywords`.
- Produces: one entry per curated activity/culture canonical term; `parseStepIntents` yields `[canonicalTerm, ...expansions]` as Kakao terms.

- [ ] **Step 1: Add activity entries**

```ts
{
  canonicalTerm: '도자기 체험', intentType: 'activity', targetCategory: 'activity',
  expansions: ['도자기 공방', '도예 체험'],
  koAliases: ['도자기 만들기', '도자기체험'], enAliases: ['pottery class'],
  compatibleCategoryNameKeywords: ['도자기', '공방'],
  displayLabel: { ko: '도자기 체험', en: 'Pottery class' },
}
```

Use these activity records (canonical → Korean alias → Kakao expansions):

| Canonical | Alias | Expansions |
|---|---|---|
| 볼링 | 볼링장 | 볼링장 |
| 방탈출 | 방탈출카페 | 방탈출카페 |
| 보드게임 | 보드게임카페 | 보드게임카페, 보드게임 |
| 클라이밍 | 클라이밍장 | 클라이밍장 |
| 실내 사격 | 실내사격 | 실내사격장 |
| 양궁 | 양궁장 | 양궁장 |
| 탁구 | 탁구장 | 탁구장 |
| 당구 | 당구장 | 당구장 |
| 롤러스케이트 | 롤러스케이트장 | 롤러스케이트장 |
| 아이스링크 | 스케이트장 | 아이스링크, 스케이트장 |
| 테니스 | 테니스장 | 테니스장 |
| 배드민턴 | 배드민턴장 | 배드민턴장 |
| 수영 | 수영장 | 수영장 |
| 서핑 | 서핑장 | 서핑 체험 |
| 카약 | 카약 체험 | 카약 체험 |
| 요트 | 요트 체험 | 요트 체험 |
| 낚시 | 낚시 체험 | 낚시 체험 |
| 승마 | 승마 체험 | 승마 체험 |
| 패러글라이딩 | 패러글라이딩 체험 | 패러글라이딩 체험 |
| 짚라인 | 짚라인 체험 | 짚라인 체험 |
| 레일바이크 | 레일 바이크 | 레일바이크 |
| 스키 | 스키장 | 스키장 |
| 눈썰매 | 눈썰매장 | 눈썰매장 |
| 캠핑 | 캠핑장 | 캠핑장 |
| 공방 체험 | 공방체험 | 공방, 원데이클래스 |
| 도자기 체험 | 도자기 만들기 | 도자기 공방, 도예 체험 |
| 향수 만들기 | 향수 만들기 체험 | 향수 공방, 원데이클래스 |
| 반지 만들기 | 반지 만들기 체험 | 반지 공방, 원데이클래스 |
| 쿠킹 클래스 | 쿠킹클래스 | 요리 클래스, 원데이클래스 |
| 원데이 클래스 | 원데이클래스 | 원데이클래스 |

- [ ] **Step 2: Add culture entries**

```ts
{
  canonicalTerm: '미술관', intentType: 'culture_subtype', targetCategory: 'culture',
  expansions: ['미술관', '갤러리'], koAliases: ['그림 전시'], enAliases: ['art museum'],
  compatibleCategoryNameKeywords: ['미술관', '갤러리'],
  displayLabel: { ko: '미술관', en: 'Art museum' },
}
```

Use these culture records (canonical → Korean alias → Kakao expansions):

| Canonical | Alias | Expansions |
|---|---|---|
| 미술관 | 그림 전시 | 미술관, 갤러리 |
| 박물관 | 역사 박물관 | 박물관 |
| 갤러리 | 전시 갤러리 | 갤러리, 전시관 |
| 독립서점 | 독립 서점 | 독립서점 |
| 도서관 | 라이브러리 | 도서관 |
| 공연장 | 공연 보러 | 공연장, 콘서트홀 |
| 극장 | 연극 보러 | 극장, 연극 |
| 영화관 | 영화 보러 | 영화관 |
| 아트센터 | 아트 센터 | 아트센터 |
| 문화센터 | 문화 센터 | 문화센터 |
| 복합문화공간 | 복합 문화 공간 | 복합문화공간 |
| 전시관 | 전시 보러 | 전시관, 갤러리 |
| 역사관 | 역사 박물관 | 역사관, 박물관 |
| 천문대 | 별 보러 | 천문대 |
| 식물원 | 식물 보러 | 식물원 |
| 수족관 | 아쿠아리움 | 수족관, 아쿠아리움 |

Retain the existing `전시` record after the more specific `전시관` record.

- [ ] **Step 3: Verify GREEN**

Run: `npm test -- --runInBand __tests__/stepIntent.test.ts`

Expected: each requested term binds to the requested course step; existing food, cafe, drinks, and negation tests stay green.

### Task 3: Run dependent regression and static verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes: dictionary output through intent resolution, Kakao search query construction, ranking, and course selection.
- Produces: evidence that no shared recommendation contract regressed.

- [ ] **Step 1: Run dependent recommendation suites**

Run: `npm test -- --runInBand __tests__/stepIntentResolve.test.ts __tests__/stepIntentResolvedThreading.test.ts __tests__/recommend-date-ranking-server.test.ts __tests__/recommend-date-search-server.test.ts __tests__/recommend-date-course-selection.test.ts __tests__/recommend-date-phase7-handler.test.ts`

Expected: PASS.

- [ ] **Step 2: Run type and whitespace validation**

Run: `npm run validate && git diff --check`

Expected: exit code 0.

## Plan Self-Review

- **Coverage:** Tasks 1–2 cover every requested activity and culture term, the board-game normalization, and `전시` compatibility; Task 3 covers all dependent consumers.
- **Boundary:** dictionary-schema unification, automatic course editing, and unrecognized-term logging remain explicitly deferred.
- **Consistency:** all entries use current dictionary fields and preserve the existing maximum of two Kakao expansions.
