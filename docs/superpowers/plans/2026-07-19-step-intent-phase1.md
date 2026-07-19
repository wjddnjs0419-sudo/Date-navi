# Step Intent Phase 1 (결정론 수직슬라이스) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "삼겹살 먹고 싶어"/"I want samgyupsal" 같은 구체 요청을 규칙 파서로 step별 canonical 카카오 검색 의도로 변환해 검색→evidence→랭킹→선택검증→폴백→교체까지 전파한다. AI 파서 없음(Phase 2).

**Architecture:** 서버 전용 순수함수 `parseStepIntents(request)`를 사전(dictionary) 기반으로 추가. `buildKakaoSearchPlan`이 내부에서 호출해 `step_intent` phase 쿼리를 생성(파싱 성공 시 raw explicit 쿼리 제거 — 애드덤 패치 7). evidence에 intent 필드 보존(패치 5), 랭킹 intent 슬롯 가산, required intent는 게이트(422 STEP_INTENT_UNSATISFIED)+선택검증+폴백 필터. step_intent 쿼리는 크로스유저 캐시 제외(패치 3). 교체는 baseRequest 재사용이라 자동 전파(코드 무변경, 테스트만).

**Tech Stack:** Deno Edge Functions(TS), zod, jest(jest-expo). 참조 스펙: `DATE_NAVI_AI_RECOMMENDATION_V4_STEP_INTENT_SPEC.md` §24 Phase 1 + `docs/AI_RECOMMENDATION_V4_STEP_INTENT_RECONCILIATION.md` 패치 1·3·4·5·6·7.

**핵심 설계 결정:**
- 파서는 마이크로초급 순수함수 → 필요한 모듈(search plan/ranking/selection/prompt/handler)이 각자 `parseStepIntents(request)` 재호출 허용. "파싱 1회" 원칙은 AI 파서 비용 얘기(Phase 2)임.
- intent 바인딩은 **category 기준**: 사전 엔트리의 `targetCategory`와 normalize된 step category가 일치하는 **첫 step**에 바인딩. 같은 category 다수 스텝 모호성은 Phase 2(AI)로. 교체 요청은 courseSteps가 target 1개로 재구성돼도 category 일치 시 자동 바인딩됨.
- 랭킹 점수는 기존 `scoreBreakdown.intent` 슬롯에 **합산**(신규 필드 없음 → 스키마 무변경): exact evidence +35, expansion1 +12, expansion2 +6(evidence 중 최대 1개), 이름 매칭 +20.
- 기존 `parseAdditionalRequest`(recommendation-intent.ts)는 그대로 두고 **호출부를 공유하지 않는다** — soft preference(quiet/photo/indoor/제외)와 step intent(dish 등)는 겹치는 필드가 없어 Phase 1에선 병렬 존재가 중복이 아님. 파일 통합 리팩터는 Phase 2에서 AI 파서 도입 시. (애드덤 패치 1의 "중복 금지"는 *같은 필드를 두 번 파싱*하는 것 금지 — 여기선 발생 안 함.)

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| Create `supabase/functions/_shared/step-intent-dictionary.ts` | 데이터 사전(canonical/expansions/ko·en alias/로마자/호환 categoryName 키워드/displayLabel) |
| Create `supabase/functions/_shared/step-intent.ts` | 타입 + `parseStepIntents` 규칙 파서 + `placeMatchesStepIntent` 술어 |
| Modify `supabase/functions/_shared/recommendation-search.ts` | SearchPhase에 `step_intent`, SearchEvidence intent 필드, buildKakaoSearchPlan step_intent 쿼리+raw explicit 조건부 제거, executeKakaoSearchPlan progressive expansion |
| Modify `supabase/functions/_shared/kakao-search-cache.ts` | `isCacheable`에 step_intent 제외 |
| Modify `supabase/functions/_shared/recommendation-ranking.ts` | intent 슬롯 step-intent 가산 |
| Modify `supabase/functions/_shared/recommendation-course-selection.ts` | required intent 선택검증 + 폴백 required 필터/preferred 우선 |
| Modify `supabase/functions/_shared/recommend-date-handler.ts` | required intent sufficiency 게이트 → 422 |
| Modify `shared/recommendation/contracts.ts`, `errors.ts` | `STEP_INTENT_UNSATISFIED` 에러코드+메타데이터 |
| Modify `supabase/functions/_shared/recommendation-prompt.ts` | v4 버전 + resolvedStepIntents 블록 |
| Modify `lib/recommend-date.ts`, `locales/ko.json`, `locales/en.json` | 클라 에러코드+문구 |
| Test: `__tests__/stepIntent.test.ts`(신규) 외 기존 테스트 파일 수정 | 아래 각 태스크 |

---

### Task 1: 사전 + 파서 타입 + 규칙 파서

**Files:**
- Create: `supabase/functions/_shared/step-intent-dictionary.ts`
- Create: `supabase/functions/_shared/step-intent.ts`
- Test: `__tests__/stepIntent.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/stepIntent.test.ts
import type { RecommendationRequest } from '../shared/recommendation/schemas';
import { parseStepIntents, placeMatchesStepIntent, STEP_INTENT_PARSER_VERSION } from '../supabase/functions/_shared/step-intent';

const request = (additionalRequest?: string, steps: Array<{ id: string; category: string }> = [
  { id: 'step-1', category: 'meal' },
  { id: 'step-2', category: 'cafe' },
]): RecommendationRequest => ({
  requestId: 'request-intent',
  mode: 'course',
  language: 'ko',
  location: { source: 'kakao', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
  courseSteps: steps.map((step) => ({ ...step, label: step.category })),
  ...(additionalRequest ? { additionalRequest } : {}),
});

describe('parseStepIntents', () => {
  it('한국어 dish 요청을 meal step에 preferred로 바인딩한다', () => {
    const parsed = parseStepIntents(request('삼겹살 먹고 싶어'));
    expect(parsed.stepIntents).toEqual([{
      stepId: 'step-1',
      stepCategory: 'meal',
      intentType: 'dish',
      canonicalTerm: '삼겹살',
      kakaoSearchTerms: ['삼겹살', '돼지고기구이', '고기집'],
      strength: 'preferred',
      displayLabel: { ko: '삼겹살', en: 'Samgyeopsal' },
    }]);
    expect(parsed.parserVersion).toBe(STEP_INTENT_PARSER_VERSION);
  });

  it('영어 번역 표현을 canonical 한국어로 매핑한다', () => {
    const parsed = parseStepIntents(request('I want Korean pork belly.'));
    expect(parsed.stepIntents[0]?.canonicalTerm).toBe('삼겹살');
  });

  it('로마자 표기 변형(samgyupsal 등)을 alias로 흡수한다', () => {
    for (const text of ['samgyeopsal please', 'I want samgyupsal', 'samgyopsal!']) {
      expect(parseStepIntents(request(text)).stepIntents[0]?.canonicalTerm).toBe('삼겹살');
    }
  });

  it('무조건/only 마커는 required로 승격한다', () => {
    expect(parseStepIntents(request('무조건 삼겹살이어야 해')).stepIntents[0]?.strength).toBe('required');
    expect(parseStepIntents(request('Only sushi for dinner.')).stepIntents[0]?.strength).toBe('required');
    expect(parseStepIntents(request('파스타가 좋을 것 같아')).stepIntents[0]?.strength).toBe('preferred');
  });

  it('venue_subtype은 cafe step에, 여러 intent는 각자 category step에 바인딩한다', () => {
    const parsed = parseStepIntents(request('삼겹살 먹고 카페는 루프탑이면 좋겠어'));
    expect(parsed.stepIntents.map((intent) => [intent.stepId, intent.canonicalTerm])).toEqual([
      ['step-1', '삼겹살'],
      ['step-2', '루프탑 카페'],
    ]);
  });

  it('대상 category step이 없으면 intent를 만들지 않는다', () => {
    const parsed = parseStepIntents(request('방탈출 하고 싶어')); // steps엔 activity 없음
    expect(parsed.stepIntents).toEqual([]);
  });

  it('additionalRequest 없으면 빈 결과', () => {
    expect(parseStepIntents(request()).stepIntents).toEqual([]);
  });

  it('같은 category 중복 매칭 시 첫 step 하나에만 바인딩한다', () => {
    const parsed = parseStepIntents(request('삼겹살', [
      { id: 'step-1', category: 'meal' },
      { id: 'step-2', category: 'meal' },
    ]));
    expect(parsed.stepIntents.map((intent) => intent.stepId)).toEqual(['step-1']);
  });
});

describe('placeMatchesStepIntent', () => {
  const intent = parseStepIntents(request('삼겹살 먹고 싶어')).stepIntents[0]!;
  const place = (overrides: Record<string, unknown>) => ({
    kakaoPlaceId: 'p1',
    name: '어느 식당',
    categoryGroupCode: 'FD6',
    categoryGroupName: '음식점',
    categoryName: '음식점 > 한식',
    address: '', roadAddress: '', latitude: 37.5, longitude: 127.0, mapUrl: '',
    matchedSearchEvidence: [],
    ...overrides,
  });

  it('exact step_intent 검색 evidence로 매칭한다', () => {
    expect(placeMatchesStepIntent(place({
      matchedSearchEvidence: [{ queryId: 'query_002', source: 'keyword', page: 1, queryText: '삼겹살', phase: 'step_intent', canonicalTerm: '삼겹살', expansionLevel: 0 }],
    }), intent)).toBe(true);
  });

  it('장소 이름의 canonical 포함으로 매칭한다', () => {
    expect(placeMatchesStepIntent(place({ name: '왕십리 삼겹살집' }), intent)).toBe(true);
  });

  it('호환 categoryName 키워드로 매칭한다', () => {
    expect(placeMatchesStepIntent(place({ categoryName: '음식점 > 한식 > 육류,고기 > 삼겹살' }), intent)).toBe(true);
  });

  it('무관한 장소는 매칭하지 않는다', () => {
    expect(placeMatchesStepIntent(place({}), intent)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/stepIntent.test.ts`
Expected: FAIL — `Cannot find module '../supabase/functions/_shared/step-intent'`

- [ ] **Step 3: 사전 구현**

```ts
// supabase/functions/_shared/step-intent-dictionary.ts
// 데이터 전용 사전. 파서 로직과 분리(스펙 §8.1). 확장 시 이 파일에 엔트리만 추가한다.

export type StepIntentType = 'dish' | 'cuisine' | 'venue_subtype' | 'activity' | 'culture_subtype' | 'drink_type';
export type StepIntentTargetCategory = 'meal' | 'cafe' | 'culture' | 'walk' | 'drinks' | 'activity';

export type StepIntentDictionaryEntry = {
  canonicalTerm: string;
  intentType: StepIntentType;
  targetCategory: StepIntentTargetCategory;
  /** 카카오 확장 검색어. 최대 2개(스펙 §10.3). */
  expansions: readonly string[];
  /** 한국어 표기 변형(canonical 포함 불필요 — canonical은 항상 매칭). */
  koAliases: readonly string[];
  /** 영어 번역 + 로마자 변형. 전부 소문자(단어 경계 매칭). 애드덤 패치 6. */
  enAliases: readonly string[];
  /** 카카오 상세 categoryName 호환 서브타입 allowlist(스펙 §12.2). */
  compatibleCategoryNameKeywords: readonly string[];
  displayLabel: { ko: string; en: string };
};

export const STEP_INTENT_DICTIONARY: readonly StepIntentDictionaryEntry[] = [
  {
    canonicalTerm: '삼겹살', intentType: 'dish', targetCategory: 'meal',
    expansions: ['돼지고기구이', '고기집'],
    koAliases: ['삼겹', '오겹살'],
    enAliases: ['korean pork belly', 'pork belly', 'samgyeopsal', 'samgyupsal', 'samgyopsal'],
    compatibleCategoryNameKeywords: ['삼겹살', '돼지고기구이', '육류,고기'],
    displayLabel: { ko: '삼겹살', en: 'Samgyeopsal' },
  },
  {
    canonicalTerm: '파스타', intentType: 'dish', targetCategory: 'meal',
    expansions: ['이탈리안', '이탈리아음식'],
    koAliases: ['스파게티'],
    enAliases: ['pasta', 'spaghetti', 'italian food', 'italian restaurant'],
    compatibleCategoryNameKeywords: ['이탈리안', '파스타', '양식'],
    displayLabel: { ko: '파스타', en: 'Pasta' },
  },
  {
    canonicalTerm: '초밥', intentType: 'dish', targetCategory: 'meal',
    expansions: ['오마카세', '일식'],
    koAliases: ['스시', '오마카세'],
    enAliases: ['sushi', 'omakase'],
    compatibleCategoryNameKeywords: ['초밥', '일식', '스시'],
    displayLabel: { ko: '초밥', en: 'Sushi' },
  },
  {
    canonicalTerm: '떡볶이', intentType: 'dish', targetCategory: 'meal',
    expansions: ['분식'],
    koAliases: [],
    enAliases: ['tteokbokki', 'ddeokbokki', 'topokki', 'spicy rice cake'],
    compatibleCategoryNameKeywords: ['떡볶이', '분식'],
    displayLabel: { ko: '떡볶이', en: 'Tteokbokki' },
  },
  {
    canonicalTerm: '마라탕', intentType: 'dish', targetCategory: 'meal',
    expansions: ['중식'],
    koAliases: ['마라'],
    enAliases: ['malatang', 'mala soup', 'mala'],
    compatibleCategoryNameKeywords: ['마라탕', '중식'],
    displayLabel: { ko: '마라탕', en: 'Malatang' },
  },
  {
    canonicalTerm: '라멘', intentType: 'dish', targetCategory: 'meal',
    expansions: ['일본식라면', '일식'],
    koAliases: [],
    enAliases: ['ramen'],
    compatibleCategoryNameKeywords: ['라멘', '일식'],
    displayLabel: { ko: '라멘', en: 'Ramen' },
  },
  {
    canonicalTerm: '루프탑 카페', intentType: 'venue_subtype', targetCategory: 'cafe',
    expansions: ['루프탑', '옥상 카페'],
    koAliases: ['루프탑카페', '루프탑'],
    enAliases: ['rooftop cafe', 'rooftop coffee', 'rooftop'],
    compatibleCategoryNameKeywords: ['카페'],
    displayLabel: { ko: '루프탑 카페', en: 'Rooftop cafe' },
  },
  {
    canonicalTerm: '보드게임카페', intentType: 'venue_subtype', targetCategory: 'activity',
    expansions: ['보드게임'],
    koAliases: ['보드게임 카페', '보드게임'],
    enAliases: ['board game cafe', 'boardgame cafe'],
    compatibleCategoryNameKeywords: ['보드카페', '보드게임'],
    displayLabel: { ko: '보드게임카페', en: 'Board game cafe' },
  },
  {
    canonicalTerm: '방탈출', intentType: 'activity', targetCategory: 'activity',
    expansions: ['방탈출카페'],
    koAliases: [],
    enAliases: ['escape room', 'escape cafe'],
    compatibleCategoryNameKeywords: ['방탈출'],
    displayLabel: { ko: '방탈출', en: 'Escape room' },
  },
  {
    canonicalTerm: '볼링', intentType: 'activity', targetCategory: 'activity',
    expansions: ['볼링장'],
    koAliases: [],
    enAliases: ['bowling'],
    compatibleCategoryNameKeywords: ['볼링'],
    displayLabel: { ko: '볼링', en: 'Bowling' },
  },
  {
    canonicalTerm: '전시', intentType: 'culture_subtype', targetCategory: 'culture',
    expansions: ['전시회', '미술관'],
    koAliases: ['전시회'],
    enAliases: ['exhibition', 'art exhibition', 'gallery'],
    compatibleCategoryNameKeywords: ['전시', '미술관', '갤러리'],
    displayLabel: { ko: '전시', en: 'Exhibition' },
  },
  {
    canonicalTerm: '와인바', intentType: 'drink_type', targetCategory: 'drinks',
    expansions: ['와인'],
    koAliases: ['와인 바', '와인'],
    enAliases: ['wine bar', 'wine'],
    compatibleCategoryNameKeywords: ['와인바'],
    displayLabel: { ko: '와인바', en: 'Wine bar' },
  },
  {
    canonicalTerm: '칵테일바', intentType: 'drink_type', targetCategory: 'drinks',
    expansions: ['칵테일'],
    koAliases: ['칵테일 바', '칵테일'],
    enAliases: ['cocktail bar', 'cocktails', 'cocktail'],
    compatibleCategoryNameKeywords: ['칵테일바'],
    displayLabel: { ko: '칵테일바', en: 'Cocktail bar' },
  },
];
```

- [ ] **Step 4: 파서 구현**

```ts
// supabase/functions/_shared/step-intent.ts
import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import { normalizeRecommendationCategory } from './recommendation-category.ts';
import {
  STEP_INTENT_DICTIONARY,
  type StepIntentDictionaryEntry,
  type StepIntentType,
} from './step-intent-dictionary.ts';

export const STEP_INTENT_PARSER_VERSION = 'step-intent-rules-v1';

export type StepIntentStrength = 'required' | 'preferred';

export type ParsedStepIntent = {
  stepId: string;
  stepCategory: string;
  intentType: StepIntentType;
  canonicalTerm: string;
  /** [canonical, ...expansions] — 인덱스가 곧 expansionLevel(0/1/2). */
  kakaoSearchTerms: string[];
  strength: StepIntentStrength;
  displayLabel: { ko: string; en: string };
};

export type ParsedStepIntents = {
  stepIntents: ParsedStepIntent[];
  parserVersion: string;
};

const REQUIRED_MARKERS_KO = /(?:무조건|반드시|꼭)/;
const REQUIRED_MARKERS_EN = /\b(?:only|must|has to be)\b/i;
/** 매칭 지점 앞뒤로 required 마커를 찾는 로컬 window(자소 단위). */
const REQUIRED_WINDOW = 14;

const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase();

type AliasMatch = { entry: StepIntentDictionaryEntry; index: number };

function findAliasMatch(text: string, entry: StepIntentDictionaryEntry): number {
  const koTerms = [entry.canonicalTerm, ...entry.koAliases];
  for (const term of koTerms) {
    const index = text.indexOf(normalize(term));
    if (index >= 0) return index;
  }
  for (const alias of entry.enAliases) {
    const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const match = pattern.exec(text);
    if (match) return match.index;
  }
  return -1;
}

function isRequiredAt(text: string, matchIndex: number): boolean {
  const windowText = text.slice(Math.max(0, matchIndex - REQUIRED_WINDOW), matchIndex + REQUIRED_WINDOW);
  return REQUIRED_MARKERS_KO.test(windowText) || REQUIRED_MARKERS_EN.test(windowText);
}

export function parseStepIntents(request: RecommendationRequest): ParsedStepIntents {
  const raw = request.additionalRequest?.trim();
  if (!raw) return { stepIntents: [], parserVersion: STEP_INTENT_PARSER_VERSION };
  const text = normalize(raw);

  // 사전 순회로 매칭 수집. 같은 canonical은 1회만.
  const matches: AliasMatch[] = [];
  for (const entry of STEP_INTENT_DICTIONARY) {
    const index = findAliasMatch(text, entry);
    if (index >= 0) matches.push({ entry, index });
  }
  matches.sort((a, b) => a.index - b.index);

  const usedStepIds = new Set<string>();
  const stepIntents: ParsedStepIntent[] = [];
  for (const { entry, index } of matches) {
    const step = request.courseSteps.find((candidate) => (
      !usedStepIds.has(candidate.id)
      && normalizeRecommendationCategory(candidate.category) === entry.targetCategory
    ));
    if (!step) continue; // 대상 category step 없음 → intent 미생성(Phase 2에서 unsupported로 노출)
    usedStepIds.add(step.id);
    stepIntents.push({
      stepId: step.id,
      stepCategory: entry.targetCategory,
      intentType: entry.intentType,
      canonicalTerm: entry.canonicalTerm,
      kakaoSearchTerms: [entry.canonicalTerm, ...entry.expansions].slice(0, 3),
      strength: isRequiredAt(text, index) ? 'required' : 'preferred',
      displayLabel: entry.displayLabel,
    });
  }
  return { stepIntents, parserVersion: STEP_INTENT_PARSER_VERSION };
}

type IntentEvidence = {
  phase?: string;
  canonicalTerm?: string;
};

type IntentMatchablePlace = {
  name: string;
  categoryName: string;
  matchedSearchEvidence: readonly IntentEvidence[];
};

/** 스펙 §12.2 required 충족 조건: exact 검색 evidence ∨ 이름 포함 ∨ 호환 상세 category. */
export function placeMatchesStepIntent(place: IntentMatchablePlace, intent: ParsedStepIntent): boolean {
  if (place.matchedSearchEvidence.some((evidence) => (
    evidence.phase === 'step_intent' && evidence.canonicalTerm === intent.canonicalTerm
  ))) return true;
  const entry = STEP_INTENT_DICTIONARY.find((candidate) => candidate.canonicalTerm === intent.canonicalTerm);
  const name = normalize(place.name);
  if (name.includes(normalize(intent.canonicalTerm))) return true;
  const categoryName = normalize(place.categoryName ?? '');
  return (entry?.compatibleCategoryNameKeywords ?? []).some((keyword) => categoryName.includes(normalize(keyword)));
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx jest __tests__/stepIntent.test.ts`
Expected: PASS (전체)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/step-intent-dictionary.ts supabase/functions/_shared/step-intent.ts __tests__/stepIntent.test.ts
git commit -m "feat: step intent 사전 + 규칙 파서 (ko/en/로마자 alias)"
```

---

### Task 2: 검색 플랜 — step_intent 쿼리 + raw explicit 조건부 제거 + evidence 필드

**Files:**
- Modify: `supabase/functions/_shared/recommendation-search.ts`
- Test: `__tests__/recommend-date-search-server.test.ts` (기존 파일에 describe 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`__tests__/recommend-date-search-server.test.ts`에 추가:

```ts
describe('buildKakaoSearchPlan — step intent (Phase 1)', () => {
  const intentRequest = (additionalRequest: string): RecommendationRequest => ({
    ...request(['meal', 'cafe']),
    additionalRequest,
  });

  it('사전 매칭 시 step_intent 쿼리를 만들고 raw explicit 쿼리를 제거한다', () => {
    const plan = buildKakaoSearchPlan(intentRequest('삼겹살 먹고 싶어'));
    const stepIntent = plan.filter((item) => item.phase === 'step_intent');
    expect(stepIntent.map((item) => [item.queryText, item.expansionLevel])).toEqual([
      ['삼겹살', 0], ['돼지고기구이', 1], ['고기집', 2],
    ]);
    expect(stepIntent[0]).toMatchObject({
      stepId: 'step-0', canonicalTerm: '삼겹살', strength: 'preferred', source: 'keyword',
    });
    expect(plan.some((item) => item.phase === 'explicit')).toBe(false);
  });

  it('사전 미매칭 시 기존처럼 raw explicit 쿼리를 유지한다', () => {
    const plan = buildKakaoSearchPlan(intentRequest('감성 있는 곳이면 좋겠어'));
    expect(plan.some((item) => item.phase === 'step_intent')).toBe(false);
    expect(plan.find((item) => item.phase === 'explicit')?.queryText).toBe('감성 있는 곳이면 좋겠어');
  });

  it('step_intent 쿼리는 generic intent(데이트 코스)보다 앞에 온다', () => {
    const plan = buildKakaoSearchPlan(intentRequest('삼겹살'));
    const stepIntentIndex = plan.findIndex((item) => item.phase === 'step_intent');
    const genericIndex = plan.findIndex((item) => item.phase === 'intent');
    expect(stepIntentIndex).toBeGreaterThan(-1);
    expect(stepIntentIndex).toBeLessThan(genericIndex);
  });

  it('evidence에 phase/stepId/canonicalTerm/expansionLevel이 보존된다', () => {
    const plan = buildKakaoSearchPlan(intentRequest('삼겹살'));
    const exact = plan.find((item) => item.phase === 'step_intent' && item.expansionLevel === 0)!;
    const outcome: KakaoSearchOutcome = {
      query: { ...exact, page: 1 },
      status: 'success',
      documents: [document('intent-place')],
    };
    const [place] = mergeKakaoSearchEvidence([outcome]);
    expect(place.matchedSearchEvidence[0]).toMatchObject({
      phase: 'step_intent', stepId: 'step-0', canonicalTerm: '삼겹살', strength: 'preferred', expansionLevel: 0,
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/recommend-date-search-server.test.ts`
Expected: 새 describe 4건 FAIL (phase 'step_intent' 없음 / explicit 잔존 / evidence 필드 없음)

- [ ] **Step 3: 구현**

`recommendation-search.ts` 수정:

```ts
// (1) import 추가
import { parseStepIntents, type ParsedStepIntent } from './step-intent.ts';

// (2) SearchEvidence 확장 (기존 필드 유지, 전부 optional → 기존 테스트 무영향)
export type SearchEvidence = {
  queryId: string;
  queryText?: string;
  source: 'category' | 'keyword' | 'fallback';
  page: number;
  categoryCode?: string;
  phase?: SearchPhase;
  stepId?: string;
  intentType?: string;
  canonicalTerm?: string;
  strength?: 'required' | 'preferred';
  expansionLevel?: 0 | 1 | 2;
};

// (3) SearchPhase에 step_intent 추가
type SearchPhase = 'required' | 'step_intent' | 'explicit' | 'intent' | 'fallback';

// (4) buildKakaoSearchPlan — required 루프 뒤를 다음으로 교체
  const { stepIntents } = parseStepIntents(request);
  for (const intent of stepIntents) {
    intent.kakaoSearchTerms.forEach((term, level) => {
      items.push({
        source: 'keyword',
        phase: 'step_intent',
        queryText: term,
        stepId: intent.stepId,
        intentType: intent.intentType,
        canonicalTerm: intent.canonicalTerm,
        strength: intent.strength,
        expansionLevel: level as 0 | 1 | 2,
      });
    });
  }
  // 애드덤 패치 7: 파싱 성공 시 raw 통문장 검색 제거, 실패 시에만 최후 보조로 유지.
  const explicit = request.additionalRequest?.trim();
  if (explicit && stepIntents.length === 0) {
    items.push({ source: 'keyword', phase: 'explicit', queryText: explicit });
  }
  items.push({ source: 'keyword', phase: 'intent', queryText: '데이트 코스' });
  items.push({ source: 'fallback', phase: 'fallback', queryText: '주변 데이트 장소' });

// (5) evidenceFromQuery — intent 필드 보존
function evidenceFromQuery(query: KakaoSearchQuery): SearchEvidence {
  return {
    queryId: query.queryId,
    source: query.source,
    page: query.page,
    ...(query.queryText ? { queryText: query.queryText } : {}),
    ...(query.categoryCode ? { categoryCode: query.categoryCode } : {}),
    ...(query.phase ? { phase: query.phase } : {}),
    ...(query.stepId ? { stepId: query.stepId } : {}),
    ...(query.intentType ? { intentType: query.intentType } : {}),
    ...(query.canonicalTerm ? { canonicalTerm: query.canonicalTerm } : {}),
    ...(query.strength ? { strength: query.strength } : {}),
    ...(query.expansionLevel !== undefined ? { expansionLevel: query.expansionLevel } : {}),
  };
}
```

주의: `KakaoSearchPlanItem`은 `Omit<SearchEvidence, 'page'> & { category?; phase }` 정의라 SearchEvidence 확장으로 자동 확장됨. `evidenceKey`/`compareEvidence`는 queryId가 유니크하므로 무변경.

- [ ] **Step 4: 통과 확인 + 기존 회귀 확인**

Run: `npx jest __tests__/recommend-date-search-server.test.ts __tests__/stepIntent.test.ts`
Expected: PASS. 기존 테스트 중 additionalRequest에 사전 등재어를 쓰는 케이스가 있으면 explicit → step_intent 전환으로 깨질 수 있음 — 깨진 테스트는 의도 확인 후 기대값을 새 동작(패치 7)으로 갱신.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/recommendation-search.ts __tests__/recommend-date-search-server.test.ts
git commit -m "feat: 검색 플랜 step_intent 쿼리 생성 + 파싱 성공 시 raw explicit 제거"
```

---

### Task 3: progressive expansion — exact 충분하면 확장 검색 생략

**Files:**
- Modify: `supabase/functions/_shared/recommendation-search.ts` (`executeKakaoSearchPlan`)
- Test: `__tests__/recommend-date-search-server.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
describe('executeKakaoSearchPlan — step intent progressive expansion', () => {
  const intentPlan = () => buildKakaoSearchPlan({ ...request(['meal', 'cafe']), additionalRequest: '삼겹살' });
  const outcomeFor = (query: KakaoSearchQuery, ids: string[]): KakaoSearchOutcome => ({
    query, status: 'success',
    documents: ids.map((id) => document(id, query.phase === 'step_intent'
      ? { category_group_code: 'FD6', category_name: '음식점 > 한식 > 육류,고기 > 삼겹살' }
      : {})),
  });

  it('exact가 충분(≥3)하면 expansion 쿼리를 실행하지 않는다', async () => {
    const executed: KakaoSearchQuery[] = [];
    const search = async (query: KakaoSearchQuery) => {
      executed.push(query);
      if (query.phase === 'step_intent' && query.expansionLevel === 0) {
        return outcomeFor(query, ['i1', 'i2', 'i3']);
      }
      return outcomeFor(query, [`${query.queryId}-a`, `${query.queryId}-b`, `${query.queryId}-c`,
        `${query.queryId}-d`, `${query.queryId}-e`, `${query.queryId}-f`]);
    };
    await executeKakaoSearchPlan(intentPlan(), search);
    expect(executed.filter((query) => query.phase === 'step_intent').map((query) => query.expansionLevel))
      .toEqual([0]);
  });

  it('exact가 부족하면 expansion 1 → 2 순서로 추가 실행한다', async () => {
    const executed: KakaoSearchQuery[] = [];
    const search = async (query: KakaoSearchQuery) => {
      executed.push(query);
      return outcomeFor(query, query.phase === 'step_intent' ? [] : [`${query.queryId}-a`, `${query.queryId}-b`,
        `${query.queryId}-c`, `${query.queryId}-d`, `${query.queryId}-e`, `${query.queryId}-f`]);
    };
    await executeKakaoSearchPlan(intentPlan(), search);
    expect(executed.filter((query) => query.phase === 'step_intent').map((query) => query.expansionLevel))
      .toEqual([0, 1, 2]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/recommend-date-search-server.test.ts -t "progressive expansion"`
Expected: FAIL — 현재 executeKakaoSearchPlan은 step_intent phase를 1차 그룹에서 아예 실행하지 않거나(필터 미포함) expansion을 무조건 실행.

- [ ] **Step 3: 구현**

`executeKakaoSearchPlan` 실행 순서를 다음으로 교체:

```ts
  const MIN_INTENT_MATCHES = 3;
  const intentMatchCount = (canonicalTerm: string) => mergeKakaoSearchEvidence(outcomes)
    .filter((place) => place.matchedSearchEvidence.some((evidence) => (
      evidence.phase === 'step_intent' && evidence.canonicalTerm === canonicalTerm
    )) || place.name.normalize('NFKC').toLocaleLowerCase().includes(canonicalTerm.toLocaleLowerCase()))
    .length;

  // 1차: required 카테고리 + step-intent exact + (파싱 실패 시) raw explicit
  for (const item of plan.filter((entry) => (
    entry.phase === 'required'
    || (entry.phase === 'step_intent' && entry.expansionLevel === 0)
    || entry.phase === 'explicit'
  ))) {
    await run(item, 1);
  }
  // step-intent progressive expansion(스펙 §10.3): exact 매칭 후보가 부족할 때만 확장.
  for (const level of [1, 2] as const) {
    for (const item of plan.filter((entry) => entry.phase === 'step_intent' && entry.expansionLevel === level)) {
      if (!item.canonicalTerm || intentMatchCount(item.canonicalTerm) >= MIN_INTENT_MATCHES) continue;
      await run(item, 1);
    }
  }
  // 이하 기존 로직 유지(uniqueCount < min → intent/fallback → page 2)
```

주의: 최하단 `page 2` 루프는 `plan` 전체를 돌므로 step_intent 항목도 포함될 수 있음 — 여기서는 `plan.filter((entry) => entry.phase !== 'step_intent' || entry.expansionLevel === 0)`로 expansion의 page 2 재실행을 막는다(요청 예산 보호).

- [ ] **Step 4: 통과 확인**

Run: `npx jest __tests__/recommend-date-search-server.test.ts`
Expected: PASS (기존 + 신규 전체. maxRequests 12 상한 테스트가 있으면 여전히 통과해야 함 — `run()`의 상한 가드는 무변경이라 보장됨)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/recommendation-search.ts __tests__/recommend-date-search-server.test.ts
git commit -m "feat: step intent progressive expansion (exact 충분 시 확장 생략)"
```

---

### Task 4: 캐시 — step_intent 쿼리 크로스유저 캐시 제외 (애드덤 패치 3, 보안)

**Files:**
- Modify: `supabase/functions/_shared/kakao-search-cache.ts:126`
- Test: `__tests__/kakaoSearchCache.test.ts` (기존 파일에 테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

기존 `kakaoSearchCache.test.ts`의 explicit 제외 테스트와 같은 패턴으로(파일 열어 기존 explicit 테스트를 찾아 바로 아래에 추가):

```ts
it('step_intent 쿼리는 additionalRequest 파생이므로 캐시 조회/저장 모두 제외한다', async () => {
  const store = {
    fetchFresh: jest.fn(async () => new Map()),
    put: jest.fn(async () => {}),
  };
  const plan = [{
    queryId: 'query_001', source: 'keyword' as const, phase: 'step_intent' as const,
    queryText: '삼겹살', canonicalTerm: '삼겹살', expansionLevel: 0 as const,
  }];
  const searchPage = createCachedKakaoSearchPage({
    plan,
    center: { source: 'kakao', label: 'x', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
    store,
    kakaoRestApiKey: 'key',
    fetchPage: async (query) => ({ query, status: 'success', documents: [] }),
  });
  await searchPage({ ...plan[0], page: 1 });
  expect(store.fetchFresh).toHaveBeenCalledWith([]); // prefetch 키에 미포함
  expect(store.put).not.toHaveBeenCalled();          // 성공해도 저장 안 함
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/kakaoSearchCache.test.ts`
Expected: 신규 1건 FAIL (`put`이 호출됨)

- [ ] **Step 3: 구현**

`kakao-search-cache.ts:124-126` 주석과 조건 교체:

```ts
  // User free text (additionalRequest) travels on explicit-phase queries, and parsed
  // step-intent queries are derived from that same personal text. Neither is cached:
  // no cross-user storage of potentially personal text or its derivatives.
  const isCacheable = (item: { phase?: string }): boolean => (
    item.phase !== 'explicit' && item.phase !== 'step_intent'
  );
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest __tests__/kakaoSearchCache.test.ts __tests__/kakaoSearchCacheWiring.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/kakao-search-cache.ts __tests__/kakaoSearchCache.test.ts
git commit -m "fix: step_intent 쿼리 크로스유저 캐시 제외 (개인 텍스트 파생물 보호)"
```

---

### Task 5: 랭킹 — step intent 증거 가산

**Files:**
- Modify: `supabase/functions/_shared/recommendation-ranking.ts`
- Test: `__tests__/recommend-date-ranking-server.test.ts` (기존 파일에 describe 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

기존 파일의 place/request 픽스처 헬퍼를 재사용해 추가(파일 열어 헬퍼 이름 확인 후 맞춤 — 아래는 헬퍼가 없을 때의 자립 버전):

```ts
describe('rankPlaceCandidates — step intent boost', () => {
  const intentRequest: RecommendationRequest = {
    requestId: 'request-rank-intent', mode: 'course', language: 'ko',
    location: { source: 'kakao', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
    courseSteps: [
      { id: 'step-0', category: 'meal', label: 'meal' },
      { id: 'step-1', category: 'cafe', label: 'cafe' },
    ],
    additionalRequest: '삼겹살 먹고 싶어',
  };
  const mealPlace = (kakaoPlaceId: string, overrides: Partial<EvidencedKakaoPlace> = {}): EvidencedKakaoPlace => ({
    kakaoPlaceId, name: `식당 ${kakaoPlaceId}`,
    categoryGroupCode: 'FD6', categoryGroupName: '음식점', categoryName: '음식점 > 한식',
    address: '', roadAddress: '', latitude: 37.5444, longitude: 127.0374, mapUrl: '',
    matchedSearchEvidence: [], ...overrides,
  });

  it('exact intent evidence 후보가 동일 카테고리 무관 후보보다 상위 랭크된다', () => {
    const withEvidence = mealPlace('aaa', {
      matchedSearchEvidence: [{
        queryId: 'query_002', source: 'keyword', page: 1, queryText: '삼겹살',
        phase: 'step_intent', stepId: 'step-0', canonicalTerm: '삼겹살', strength: 'preferred', expansionLevel: 0,
      }],
    });
    // 무관 후보의 kakaoPlaceId를 사전순으로 앞서게 두어 tie-break가 아니라 점수로 이겼음을 증명
    const unrelated = mealPlace('aab');
    const { candidates } = rankPlaceCandidates([unrelated, withEvidence], intentRequest);
    expect(candidates.findIndex((candidate) => candidate.kakaoPlaceId === 'aaa'))
      .toBeLessThan(candidates.findIndex((candidate) => candidate.kakaoPlaceId === 'aab'));
    const boosted = candidates.find((candidate) => candidate.kakaoPlaceId === 'aaa')!;
    const plain = candidates.find((candidate) => candidate.kakaoPlaceId === 'aab')!;
    expect(boosted.scoreBreakdown.intent - plain.scoreBreakdown.intent).toBe(35);
  });

  it('이름에 canonical이 포함되면 +20 가산한다', () => {
    const named = mealPlace('bbb', { name: '성수 삼겹살집' });
    const plain = mealPlace('bba');
    const { candidates } = rankPlaceCandidates([named, plain], intentRequest);
    const boosted = candidates.find((candidate) => candidate.kakaoPlaceId === 'bbb')!;
    const base = candidates.find((candidate) => candidate.kakaoPlaceId === 'bba')!;
    expect(boosted.scoreBreakdown.intent - base.scoreBreakdown.intent).toBe(20);
  });

  it('expansion evidence는 exact보다 낮게(1차 +12, 2차 +6) 가산한다', () => {
    const evidence = (expansionLevel: 0 | 1 | 2, queryText: string) => mealPlace(`c${expansionLevel}x`, {
      matchedSearchEvidence: [{
        queryId: `query_00${expansionLevel + 2}`, source: 'keyword', page: 1, queryText,
        phase: 'step_intent', stepId: 'step-0', canonicalTerm: '삼겹살', strength: 'preferred', expansionLevel,
      }],
    });
    const { candidates } = rankPlaceCandidates(
      [evidence(0, '삼겹살'), evidence(1, '돼지고기구이'), evidence(2, '고기집')],
      intentRequest,
    );
    const intentOf = (id: string) => candidates.find((candidate) => candidate.kakaoPlaceId === id)!.scoreBreakdown.intent;
    expect(intentOf('c0x') - intentOf('c1x')).toBe(35 - 12);
    expect(intentOf('c1x') - intentOf('c2x')).toBe(12 - 6);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/recommend-date-ranking-server.test.ts -t "step intent boost"`
Expected: FAIL (가산 없음, 차이 0)

- [ ] **Step 3: 구현**

`recommendation-ranking.ts` 수정:

```ts
// import 추가
import { parseStepIntents } from './step-intent.ts';

// 가중치 추가
export const RANKING_SCORE_WEIGHTS = {
  requiredCategory: 40,
  explicitKeywordEvidence: 20,
  stepIntentExact: 35,
  stepIntentNameMatch: 20,
  stepIntentExpansion1: 12,
  stepIntentExpansion2: 6,
  distanceMax: 20,
  routeFitMax: 10,
  diversityRecall: 5,
  exclusionPenalty: -100,
} as const;

// rankPlaceCandidates 안, scored 매핑 이전에:
  const { stepIntents } = parseStepIntents(request);
  const intentBoostFor = (place: EvidencedKakaoPlace): number => {
    let boost = 0;
    for (const intent of stepIntents) {
      const levels = place.matchedSearchEvidence
        .filter((evidence) => evidence.phase === 'step_intent' && evidence.canonicalTerm === intent.canonicalTerm)
        .map((evidence) => evidence.expansionLevel ?? 0);
      if (levels.length > 0) {
        const bestLevel = Math.min(...levels);
        boost += bestLevel === 0
          ? RANKING_SCORE_WEIGHTS.stepIntentExact
          : bestLevel === 1
            ? RANKING_SCORE_WEIGHTS.stepIntentExpansion1
            : RANKING_SCORE_WEIGHTS.stepIntentExpansion2;
      }
      if (place.name.normalize('NFKC').toLocaleLowerCase().includes(intent.canonicalTerm.toLocaleLowerCase())) {
        boost += RANKING_SCORE_WEIGHTS.stepIntentNameMatch;
      }
    }
    return boost;
  };

// scoreBreakdown.intent 계산을 다음으로 교체:
      intent: (requiredMatch
        ? RANKING_SCORE_WEIGHTS.requiredCategory
        : explicitKeywordMatch ? RANKING_SCORE_WEIGHTS.explicitKeywordEvidence : 0)
        + intentBoostFor(place),
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest __tests__/recommend-date-ranking-server.test.ts __tests__/unfitPlaceFilter.test.ts`
Expected: PASS (additionalRequest 없는 기존 테스트는 stepIntents가 빈 배열이라 가산 0 → 무회귀)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/recommendation-ranking.ts __tests__/recommend-date-ranking-server.test.ts
git commit -m "feat: 랭킹에 step intent 증거 가산 (exact 35 / exp1 12 / exp2 6 / 이름 20)"
```

---

### Task 6: required intent — 에러코드 + 게이트 + 선택검증 + 폴백

**Files:**
- Modify: `shared/recommendation/contracts.ts:127-135` (에러코드)
- Modify: `shared/recommendation/errors.ts` (메타데이터 + zod enum)
- Modify: `supabase/functions/_shared/recommend-date-handler.ts:146` 근처 (게이트)
- Modify: `supabase/functions/_shared/recommendation-course-selection.ts` (선택검증 + 폴백)
- Modify: `lib/recommend-date.ts:14-18` (클라 에러코드)
- Modify: `locales/ko.json`, `locales/en.json` (`courseErrors` 블록)
- Test: `__tests__/recommend-date-course-selection.test.ts`, `__tests__/recommend-date-phase7-handler.test.ts` (기존 파일에 추가)

- [ ] **Step 1: 실패하는 테스트 — 선택검증/폴백**

`__tests__/recommend-date-course-selection.test.ts`에 추가 (기존 픽스처 헬퍼 재사용; 없으면 아래 자립 픽스처):

```ts
describe('required step intent 검증', () => {
  const requiredRequest: RecommendationRequest = {
    requestId: 'request-required', mode: 'course', language: 'ko',
    location: { source: 'kakao', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
    courseSteps: [
      { id: 'step-1', category: 'meal', label: '식사' },
      { id: 'step-2', category: 'cafe', label: '카페' },
    ],
    additionalRequest: '무조건 삼겹살이어야 해',
  };
  const candidate = (candidateId: string, kakaoPlaceId: string, overrides: Partial<PlaceCandidate> = {}): PlaceCandidate => ({
    candidateId, kakaoPlaceId, name: `장소 ${kakaoPlaceId}`,
    categoryGroupCode: 'FD6', categoryGroupName: '음식점', categoryName: '음식점 > 한식',
    address: '주소', roadAddress: '도로명', latitude: 37.5444, longitude: 127.0374,
    mapUrl: 'https://place.map.kakao.com/1', matchedSearchEvidence: [],
    distanceFromSearchCenterMeters: 0, score: 50,
    scoreBreakdown: { intent: 40, distance: 10, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
    ...overrides,
  });
  const cafeCandidate = (candidateId: string, kakaoPlaceId: string) => candidate(candidateId, kakaoPlaceId, {
    categoryGroupCode: 'CE7', categoryGroupName: '카페', categoryName: '음식점 > 카페',
  });
  const porkCandidate = (candidateId: string, kakaoPlaceId: string) => candidate(candidateId, kakaoPlaceId, {
    categoryName: '음식점 > 한식 > 육류,고기 > 삼겹살',
  });

  it('AI가 required intent 미충족 후보를 고르면 COURSE_VALIDATION_FAILED', () => {
    expect(() => buildCandidateOnlyCourse({
      request: requiredRequest,
      candidates: [candidate('candidate_001', 'p1'), porkCandidate('candidate_002', 'p2'), cafeCandidate('candidate_003', 'p3')],
      selection: { steps: [
        { stepId: 'step-1', candidateId: 'candidate_001' }, // 무관 식당
        { stepId: 'step-2', candidateId: 'candidate_003' },
      ] },
      generatedAt: '2026-07-19T00:00:00.000Z',
    })).toThrow(CourseSelectionError);
  });

  it('required intent 충족 후보 선택은 통과한다', () => {
    const built = buildCandidateOnlyCourse({
      request: requiredRequest,
      candidates: [candidate('candidate_001', 'p1'), porkCandidate('candidate_002', 'p2'), cafeCandidate('candidate_003', 'p3')],
      selection: { steps: [
        { stepId: 'step-1', candidateId: 'candidate_002' },
        { stepId: 'step-2', candidateId: 'candidate_003' },
      ] },
      generatedAt: '2026-07-19T00:00:00.000Z',
    });
    expect(built.course.steps[0].kakaoPlaceId).toBe('p2');
  });

  it('결정론 폴백은 required intent 충족 후보만 사용한다', () => {
    const built = buildDeterministicCandidateCourse({
      request: requiredRequest,
      candidates: [
        candidate('candidate_001', 'p1', { score: 90 }), // 무관 고점수
        porkCandidate('candidate_002', 'p2'),
        cafeCandidate('candidate_003', 'p3'),
      ],
      generatedAt: '2026-07-19T00:00:00.000Z',
    });
    expect(built.course.steps[0].kakaoPlaceId).toBe('p2'); // 고점수 무관 후보를 제치고 삼겹살
  });

  it('preferred intent는 폴백에서 우선하되 없으면 카테고리 후보를 허용한다', () => {
    const preferredRequest = { ...requiredRequest, additionalRequest: '삼겹살 먹고 싶어' };
    const built = buildDeterministicCandidateCourse({
      request: preferredRequest,
      candidates: [candidate('candidate_001', 'p1', { score: 90 }), cafeCandidate('candidate_003', 'p3')],
      generatedAt: '2026-07-19T00:00:00.000Z',
    });
    expect(built.course.steps[0].kakaoPlaceId).toBe('p1'); // 매칭 후보 없음 → 완화 허용
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/recommend-date-course-selection.test.ts -t "required step intent"`
Expected: FAIL (1·3번 케이스 — 검증/필터 없음)

- [ ] **Step 3: 에러코드 추가**

`shared/recommendation/contracts.ts:127` union에 추가:

```ts
export type RecommendationErrorCode =
  | 'LOCATION_REQUIRED'
  | 'INVALID_INPUT'
  | 'PLACE_SEARCH_TIMEOUT'
  | 'PLACE_SEARCH_RATE_LIMITED'
  | 'INSUFFICIENT_CANDIDATES'
  | 'STEP_INTENT_UNSATISFIED'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_RESPONSE'
  | 'COURSE_VALIDATION_FAILED'
  // ...기존 나머지 유지
```

`shared/recommendation/errors.ts` — `RECOMMENDATION_ERROR_METADATA`에 추가(INSUFFICIENT_CANDIDATES 아래) + `recommendationErrorSchema`의 `z.enum([...])`에 `'STEP_INTENT_UNSATISFIED'` 추가:

```ts
  STEP_INTENT_UNSATISFIED: {
    messages: {
      ko: '요청한 조건에 딱 맞는 장소를 근처에서 찾지 못했어요. 조건을 조금 완화하거나 지역을 넓혀 주세요.',
      en: 'We could not find nearby places matching that specific request. Try relaxing it or widening the area.',
    },
    retryable: false,
    requiresConditionEdit: true,
  },
```

- [ ] **Step 4: 선택검증 + 폴백 구현**

`recommendation-course-selection.ts` 수정:

```ts
// import 추가
import { parseStepIntents, placeMatchesStepIntent, type ParsedStepIntent } from './step-intent.ts';

// buildCandidateOnlyCourse 내부, locks 선언 다음에:
  const requiredIntents = new Map(
    parseStepIntents(input.request).stepIntents
      .filter((intent) => intent.strength === 'required')
      .map((intent) => [intent.stepId, intent]),
  );
// 루프 안 else 분기(비잠금 후보 검증)에서 category 검증 직후 추가:
      const requiredIntent = requiredIntents.get(requestedStep.id);
      if (requiredIntent && candidate && !placeMatchesStepIntent(candidate, requiredIntent)) {
        throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
      }

// buildDeterministicCandidateCourse의 choices 계산을 다음으로 교체:
  const { stepIntents } = parseStepIntents(input.request);
  const intentByStepId = new Map(stepIntents.map((intent) => [intent.stepId, intent]));
  const choices = input.request.courseSteps.map((step) => {
    const lock = locks.get(step.id);
    if (lock) return [candidateFromLock(lock)];
    const categoryEligible = input.candidates
      .filter((candidate) => candidateMatchesCategory(candidate, step.category));
    const intent = intentByStepId.get(step.id);
    const intentMatched = intent
      ? categoryEligible.filter((candidate) => placeMatchesStepIntent(candidate, intent))
      : [];
    // required: 매칭 후보만 허용(스펙 §15). preferred: 매칭 후보 우선, 없으면 카테고리 전체 완화.
    const eligible = intent?.strength === 'required'
      ? intentMatched
      : intentMatched.length > 0 ? intentMatched : categoryEligible;
    const sorted = eligible.sort(compareStable);
    if (sorted.length === 0) throw new CourseSelectionError('INSUFFICIENT_CANDIDATES');
    return sorted;
  });
```

- [ ] **Step 5: 게이트 구현 (handler)**

`recommend-date-handler.ts` — `hasEveryRequiredCategory` 게이트(146행 근처) 바로 아래 추가:

```ts
// import 추가
import { parseStepIntents, placeMatchesStepIntent } from './step-intent.ts';

// 게이트:
  const requiredStepIntents = parseStepIntents(serverRequest).stepIntents
    .filter((intent) => intent.strength === 'required');
  const hasEveryRequiredIntent = requiredStepIntents.every((intent) => (
    search.candidates.some((candidate) => placeMatchesStepIntent(candidate, intent))
  ));
  if (!hasEveryRequiredIntent) {
    return errorResult(422, 'STEP_INTENT_UNSATISFIED');
  }
```

주의: `errorResult`가 `RecommendationErrorCode`를 받는 구조인지 확인 — 아니라면 기존 INSUFFICIENT_CANDIDATES 호출과 동일한 방식으로 맞춘다.

- [ ] **Step 6: 클라 + i18n**

`lib/recommend-date.ts:16` Set에 `'STEP_INTENT_UNSATISFIED'` 추가.

`locales/ko.json` `courseErrors`에 추가:
```json
"STEP_INTENT_UNSATISFIED": "요청한 조건에 딱 맞는 장소를 근처에서 찾지 못했어요. 조건을 조금 완화하거나 지역을 넓혀주세요."
```
`locales/en.json` `courseErrors`에 추가:
```json
"STEP_INTENT_UNSATISFIED": "We couldn't find nearby places matching that specific request. Try relaxing it or widening the area."
```

- [ ] **Step 7: handler 게이트 테스트 추가**

`__tests__/recommend-date-phase7-handler.test.ts`(또는 handler 게이트 테스트가 있는 파일 — INSUFFICIENT_CANDIDATES 422 테스트를 grep으로 찾아 그 옆에)에 추가. 기존 handler 테스트의 dependencies 목 패턴을 재사용해:

```ts
it('required intent 매칭 후보가 0이면 422 STEP_INTENT_UNSATISFIED를 반환한다', async () => {
  // 기존 성공 케이스 픽스처를 복사한 뒤:
  // - request.additionalRequest = '무조건 삼겹살이어야 해'
  // - searchCandidates 목이 반환하는 후보를 전부 무관 식당(categoryName '음식점 > 한식', 이름에 삼겹살 없음, evidence 없음)으로 구성
  // 기대: status 422, body.error === 'STEP_INTENT_UNSATISFIED'
});
```

- [ ] **Step 8: 통과 확인**

Run: `npx jest __tests__/recommend-date-course-selection.test.ts __tests__/recommend-date-phase7-handler.test.ts __tests__/recommendationContracts.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add shared/recommendation/contracts.ts shared/recommendation/errors.ts supabase/functions/_shared/recommendation-course-selection.ts supabase/functions/_shared/recommend-date-handler.ts lib/recommend-date.ts locales/ko.json locales/en.json __tests__/recommend-date-course-selection.test.ts __tests__/recommend-date-phase7-handler.test.ts
git commit -m "feat: required step intent 게이트(422)+선택검증+폴백 필터, preferred 폴백 우선"
```

---

### Task 7: Haiku 프롬프트 v4 — resolvedStepIntents 블록

**Files:**
- Modify: `supabase/functions/_shared/recommendation-prompt.ts`
- Test: `__tests__/prompt.test.ts` (기존 파일 수정+추가)

- [ ] **Step 1: 실패하는 테스트**

`__tests__/prompt.test.ts`에 추가(버전 어서션이 이미 있으면 `recommend-date-v4-step-intent`로 갱신):

```ts
it('step intent가 있으면 resolvedStepIntents 블록과 매칭 후보 id를 포함한다', () => {
  const prompt = buildRecommendationPrompt(
    { ...baseRequest, additionalRequest: '삼겹살 먹고 싶어' },
    [porkCandidate, plainCandidate], // porkCandidate: categoryName '...삼겹살', plainCandidate: 무관
  );
  const parsedBlock = JSON.parse(prompt.slice(prompt.indexOf('{'), prompt.lastIndexOf('"Verified')).trim().replace(/,\s*$/, ''));
  // 위 파싱이 취약하면: expect(prompt).toContain('"resolvedStepIntents"') + 개별 문자열 포함 검증으로 대체
  expect(prompt).toContain('"resolvedStepIntents"');
  expect(prompt).toContain('"canonicalTerm": "삼겹살"');
  expect(prompt).toContain(porkCandidate.candidateId); // matchingCandidateIds 안
});

it('프롬프트 버전이 v4로 올라간다', () => {
  expect(RECOMMEND_DATE_PROMPT_VERSION).toBe('recommend-date-v4-step-intent');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/prompt.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`recommendation-prompt.ts`:

```ts
// import 추가
import { parseStepIntents, placeMatchesStepIntent } from './step-intent.ts';

// 버전 교체
export const RECOMMEND_DATE_PROMPT_VERSION = 'recommend-date-v4-step-intent';

// buildRecommendationPrompt 내부, structuredConstraints에 필드 추가:
  const { stepIntents } = parseStepIntents(request);
  const resolvedStepIntents = stepIntents.map((intent) => ({
    stepId: intent.stepId,
    canonicalTerm: intent.canonicalTerm,
    strength: intent.strength,
    matchingCandidateIds: candidates
      .filter((candidate) => placeMatchesStepIntent(candidate, intent))
      .map((candidate) => candidate.candidateId),
  }));
  // structuredConstraints 객체에:
    ...(resolvedStepIntents.length > 0 ? { resolvedStepIntents } : {}),

// 지시문 배열에 추가(§14 규칙 4·5·6):
    'resolvedStepIntents is authoritative: for a required intent select only from its matchingCandidateIds; for a preferred intent strongly prefer them.',
    'Never claim a place satisfies an attribute without verified evidence.',
```

- [ ] **Step 4: 통과 확인 + generate-ai promptVersion 허용 확인**

Run: `npx jest __tests__/prompt.test.ts __tests__/generate-ai-recommend-date-selection.test.ts`
그리고: `grep -rn "recommend-date-v3" supabase/ shared/ lib/ __tests__/ --include="*.ts"` — v3 문자열을 검증/저장하는 곳(generate-ai allowlist, attestation, 테스트)이 있으면 전부 v4로 갱신.
Expected: PASS + grep 잔여 0건(또는 의도적 히스토리 기록만)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/recommendation-prompt.ts __tests__/prompt.test.ts
git commit -m "feat: 프롬프트 v4 — resolvedStepIntents 블록 + required 선택 제한 지시"
```

---

### Task 8: 교체 후보 intent 보존 (코드 무변경 검증)

**Files:**
- Test: `__tests__/replacementCandidates.test.ts` (기존 파일에 추가)

- [ ] **Step 1: 테스트 추가**

교체 경로는 `baseRequest`(additionalRequest 포함)를 재사용하므로 파이프라인이 intent-aware가 된 시점에 자동 전파된다(플랜 서두 설계 결정). 이를 고정하는 테스트:

```ts
it('교체 요청도 원 요청의 step intent 가산이 랭킹에 반영된다', async () => {
  // searchAndRankRecommendation을 직접 호출:
  // request = { ...원요청, additionalRequest: '삼겹살 먹고 싶어', courseSteps: [{ id: 'step-1', category: 'meal', label: '식사' }] }
  // fetcher 목: step_intent 쿼리('삼겹살')에는 porkPlace 반환, category 쿼리에는 무관 식당 반환
  // 기대 1: 실행된 쿼리 중 queryText '삼겹살' 존재 (교체 재검색에 intent 쿼리 포함)
  // 기대 2: 결과 candidates에서 porkPlace가 무관 식당보다 상위 (score 차 ≥ 35)
});
```

기존 replacementCandidates.test.ts의 목 픽스처 패턴(문서/장소 헬퍼)을 재사용해 위 주석을 실제 코드로 완성한다.

- [ ] **Step 2: 통과 확인**

Run: `npx jest __tests__/replacementCandidates.test.ts`
Expected: PASS (Task 2·5가 이미 구현됐으므로 신규 테스트도 즉시 통과해야 함 — 실패하면 교체 경로 전파에 구멍이 있다는 신호이니 원인 조사)

- [ ] **Step 3: Commit**

```bash
git add __tests__/replacementCandidates.test.ts
git commit -m "test: 교체 후보 경로의 step intent 보존 고정"
```

---

### Task 9: 전체 검증 + 세션 기록

- [ ] **Step 1: 타입 체크**

Run: `npm run validate`
Expected: 에러 0. 에러 시 스스로 수정(CLAUDE.md 원칙), 해결한 빌드 오류는 `AGENTS.md` Anti-Patterns에 1줄 추가.

- [ ] **Step 2: 전체 테스트**

Run: `npx jest`
Expected: 전체 통과(기준선 92 suites / 733 tests + 신규). 실패 시 회귀 원인 수정 후 재실행.

- [ ] **Step 3: 배포 안 함 확인**

Phase 1은 로컬 완결. edge function 배포(`recommend-date`/`replacement-candidates`)는 사용자 승인 후 별도 진행 — 배포 리스크(프롬프트 버전 변경·검색 플랜 변화로 캐시 히트율 일시 하락)를 먼저 보고한다.

- [ ] **Step 4: 문서 갱신 + Commit**

`RESULT.md`에 세션 기록 추가(구현 요약·테스트 수·미배포 상태 명시), `PLAN.md` 활성 태스크 반영.

```bash
git add RESULT.md PLAN.md
git commit -m "docs: step intent Phase 1 구현 세션 기록"
```

---

## Self-Review 결과

- **스펙 커버리지**: §24 Phase 1의 9개 항목 — 타입(T1), 사전(T1), ko/en 파서(T1), step별 검색(T2·T3), evidence 전파(T2), step-aware 랭킹(T5), required/preferred 검증(T6), 교체 보존(T8), 테스트(각 태스크). 애드덤 패치 3(T4)·5(T2)·6(T1)·7(T2) 반영. 패치 1은 서두 설계 결정(겹치는 필드 없음 → Phase 2 통합)으로 처리. 패치 2·4는 Phase 1 무관(AI 파서 없음, category string 유지 이미 준수).
- **의도적 제외**: 스펙 §7.4 완화 옵션 UI·§17 칩 UI·§21 relaxation 메타데이터 → Phase 3. §19.5 메트릭 로깅 → Phase 2. `STEP_INTENT_UNSATISFIED`만 Phase 1에 필요(required 게이트의 응답이므로).
- **타입 일관성**: `ParsedStepIntent`/`parseStepIntents`/`placeMatchesStepIntent`/`STEP_INTENT_PARSER_VERSION` 명칭이 T1 정의와 T2·T5·T6·T7 사용처에서 일치함을 확인.
