# Step Intent Phase 2 — 서버 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 결정론 규칙 파서 위에 부정어 감지, resolvedStepIntents 1회-resolve 배선, AI 파서 fallback, 미지원/충돌 수집, 응답 메트릭을 얹는다. UI(칩·완화)는 별도 플랜.

**Architecture:** 핸들러에서 intent를 1회 resolve(규칙 → 게이트 미충족/저신뢰 시 AI 병합)해 서버 내부 request에 `resolvedStepIntents` 부착. 하위 순수함수(search-plan/ranking/selection)는 `request.resolvedStepIntents ?? parseStepIntents(request).stepIntents`로 읽어 무회귀 유지. 부정 intent는 랭킹 페널티. 미지원/충돌은 응답 metadata로 경고 노출.

**Tech Stack:** Deno Edge Functions(TS), zod, jest(jest-expo). 참조: `docs/superpowers/specs/2026-07-19-step-intent-phase2-3-design.md`.

---

## 파일 구조

| 파일 | 책임 | 변경 |
|---|---|---|
| `supabase/functions/_shared/step-intent.ts` | 규칙 파서 + 부정 감지 + 술어 | Modify |
| `supabase/functions/_shared/step-intent-resolve.ts` (신규) | resolve 파이프라인(규칙/AI 병합), 서버 내부 타입 | Create |
| `supabase/functions/_shared/recommendation-search.ts` | resolvedStepIntents 우선 읽기 | Modify |
| `supabase/functions/_shared/recommendation-ranking.ts` | resolvedStepIntents 우선 + negated 페널티 | Modify |
| `supabase/functions/_shared/recommendation-course-selection.ts` | resolvedStepIntents 우선 | Modify |
| `supabase/functions/generate-ai/index.ts` | `parse_step_intents` action | Modify |
| `supabase/functions/_shared/recommend-date-downstream.ts` | `invokeParseStepIntents` | Modify |
| `supabase/functions/_shared/recommend-date-handler.ts` | resolve 1회 + 부착 + metadata.stepIntent | Modify |
| `shared/recommendation/schemas.ts` | `metadata.stepIntent` optional | Modify |

핵심 계약: `resolvedStepIntents`는 서버 내부 request 타입에만 존재(클라 스키마 무변경). `metadata.stepIntent`는 optional(무회귀).

---

### Task 1: 부정어 감지 (규칙 파서)

**Files:**
- Modify: `supabase/functions/_shared/step-intent.ts`
- Test: `__tests__/stepIntent.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

`__tests__/stepIntent.test.ts`의 `describe('parseStepIntents', ...)` 안에 추가:

```ts
it('부정 마커(말고/빼고)는 intent를 negated로 표시하고 positive에서 제외한다', () => {
  const parsed = parseStepIntents(request('삼겹살 말고 파스타 먹고 싶어'));
  const pasta = parsed.stepIntents.find((i) => i.canonicalTerm === '파스타');
  expect(pasta?.negated ?? false).toBe(false);
  expect(parsed.stepIntents.some((i) => i.canonicalTerm === '삼겹살')).toBe(false);
  expect(parsed.excludedIntents.map((i) => i.canonicalTerm)).toEqual(['삼겹살']);
});

it('영어 부정(not/except)도 감지한다', () => {
  const parsed = parseStepIntents(request('pasta but not sushi'));
  expect(parsed.excludedIntents.map((i) => i.canonicalTerm)).toEqual(['초밥']);
});

it('부정 마커 없으면 excludedIntents는 빈 배열', () => {
  expect(parseStepIntents(request('삼겹살 먹고 싶어')).excludedIntents).toEqual([]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/stepIntent.test.ts -t "부정"`
Expected: FAIL — `excludedIntents` 미정의, `negated` 없음.

- [ ] **Step 3: 구현**

`step-intent.ts` 수정:

```ts
// (1) ParsedStepIntent에 negated 추가
export type ParsedStepIntent = {
  stepId: string;
  stepCategory: string;
  intentType: StepIntentType;
  canonicalTerm: string;
  kakaoSearchTerms: string[];
  strength: StepIntentStrength;
  displayLabel: { ko: string; en: string };
  negated?: boolean;
};

// (2) ParsedStepIntents에 excludedIntents 추가
export type ParsedStepIntents = {
  stepIntents: ParsedStepIntent[];
  excludedIntents: ParsedStepIntent[];
  parserVersion: string;
};

// (3) 부정 마커 + 판정 window
const NEGATION_MARKERS_KO = /(?:말고|말구|빼고|제외|아니)/;
const NEGATION_MARKERS_EN = /\b(?:not|except|no)\b/i;
const NEGATION_WINDOW = 10;
function isNegatedAt(text: string, matchIndex: number, canonicalLen: number): boolean {
  // 부정 마커는 대상어 뒤(한국어 "삼겹살 말고")나 앞(영어 "not sushi")에 올 수 있어 양쪽을 본다.
  const after = text.slice(matchIndex, matchIndex + canonicalLen + NEGATION_WINDOW);
  const before = text.slice(Math.max(0, matchIndex - NEGATION_WINDOW), matchIndex);
  return NEGATION_MARKERS_KO.test(after) || NEGATION_MARKERS_EN.test(before) || NEGATION_MARKERS_EN.test(after);
}

// (4) parseStepIntents 안, 빈 반환 지점 갱신
  if (!raw) return { stepIntents: [], excludedIntents: [], parserVersion: STEP_INTENT_PARSER_VERSION };

// (5) 루프에서 negated 판정 후 분리. stepIntents.push 블록을 아래로 교체:
  const excludedIntents: ParsedStepIntent[] = [];
  for (const { entry, index } of matches) {
    const step = request.courseSteps.find((candidate) => (
      !usedStepIds.has(candidate.id)
      && !lockedStepIds.has(candidate.id)
      && normalizeRecommendationCategory(candidate.category) === entry.targetCategory
    ));
    if (!step) continue;
    const negated = isNegatedAt(text, index, normalize(entry.canonicalTerm).length);
    const intent: ParsedStepIntent = {
      stepId: step.id,
      stepCategory: entry.targetCategory,
      intentType: entry.intentType,
      canonicalTerm: entry.canonicalTerm,
      kakaoSearchTerms: [entry.canonicalTerm, ...entry.expansions].slice(0, 3),
      strength: isRequiredAt(text, index) ? 'required' : 'preferred',
      displayLabel: entry.displayLabel,
      ...(negated ? { negated: true } : {}),
    };
    if (negated) {
      excludedIntents.push(intent);
    } else {
      usedStepIds.add(step.id);
      stepIntents.push(intent);
    }
  }
  return { stepIntents, excludedIntents, parserVersion: STEP_INTENT_PARSER_VERSION };
```

주의: negated intent는 `usedStepIds`를 점유하지 않는다(뒤따르는 positive가 같은 step 쓰도록).

- [ ] **Step 4: 통과 확인 + 회귀**

Run: `npx jest __tests__/stepIntent.test.ts`
Expected: PASS 전체. (기존 케이스는 `excludedIntents` 프로퍼티 추가에 영향 없음 — `.stepIntents`만 검사)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/step-intent.ts __tests__/stepIntent.test.ts
git commit -m "feat: step intent 부정어 감지 (말고/빼고/not → excludedIntents)"
```

---

### Task 2: resolvedStepIntents 서버 내부 타입 + resolve 진입점

**Files:**
- Create: `supabase/functions/_shared/step-intent-resolve.ts`
- Test: `__tests__/stepIntentResolve.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// __tests__/stepIntentResolve.test.ts
import type { RecommendationRequest } from '../shared/recommendation/schemas';
import { resolveStepIntents } from '../supabase/functions/_shared/step-intent-resolve';

const request = (additionalRequest?: string): RecommendationRequest => ({
  requestId: 'req-resolve', mode: 'course', language: 'ko',
  location: { source: 'kakao', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
  courseSteps: [{ id: 'step-1', category: 'meal', label: '식사' }, { id: 'step-2', category: 'cafe', label: '카페' }],
  ...(additionalRequest ? { additionalRequest } : {}),
});

describe('resolveStepIntents (AI 없이)', () => {
  it('규칙이 잡으면 source=rule, AI 미호출', async () => {
    const invokeAi = jest.fn();
    const resolved = await resolveStepIntents(request('삼겹살 먹고 싶어'), { invokeAi });
    expect(resolved.source).toBe('rule');
    expect(resolved.stepIntents.map((i) => i.canonicalTerm)).toEqual(['삼겹살']);
    expect(invokeAi).not.toHaveBeenCalled();
  });

  it('additionalRequest 없으면 source=none, AI 미호출', async () => {
    const invokeAi = jest.fn();
    const resolved = await resolveStepIntents(request(), { invokeAi });
    expect(resolved.source).toBe('none');
    expect(resolved.stepIntents).toEqual([]);
    expect(invokeAi).not.toHaveBeenCalled();
  });

  it('규칙 미검출 + 잔여 텍스트 있으면 AI 호출 게이트가 열린다', async () => {
    const invokeAi = jest.fn(async () => ({ stepIntents: [], unsupported: [], conflicts: [] }));
    await resolveStepIntents(request('뭔가 이색적인 데이트 하고파'), { invokeAi });
    expect(invokeAi).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/stepIntentResolve.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// supabase/functions/_shared/step-intent-resolve.ts
import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import { parseStepIntents, type ParsedStepIntent } from './step-intent.ts';

export type StepIntentSource = 'none' | 'rule' | 'ai';

export type UnsupportedIntent = { term: string; reason: string };
export type IntentConflict = { description: string };

export type AiParseResult = {
  stepIntents: ParsedStepIntent[];
  unsupported: UnsupportedIntent[];
  conflicts: IntentConflict[];
};

export type ResolvedStepIntents = {
  source: StepIntentSource;
  stepIntents: ParsedStepIntent[];
  excludedIntents: ParsedStepIntent[];
  unsupported: UnsupportedIntent[];
  conflicts: IntentConflict[];
  aiError?: boolean;
};

type ResolveDeps = {
  invokeAi?: (request: RecommendationRequest) => Promise<AiParseResult>;
};

/** 규칙 미검출인데 의미 있는 잔여 텍스트가 남아 AI 파서가 가치 있는지. */
function shouldTryAi(request: RecommendationRequest, ruleFound: boolean): boolean {
  const raw = request.additionalRequest?.trim();
  if (!raw) return false;
  if (ruleFound) return false;
  // 2글자 이상 유의미 텍스트만(공백/기호 제외).
  return raw.replace(/[\s.,!?~]/g, '').length >= 2;
}

export async function resolveStepIntents(
  request: RecommendationRequest,
  deps: ResolveDeps = {},
): Promise<ResolvedStepIntents> {
  const rule = parseStepIntents(request);
  const ruleFound = rule.stepIntents.length > 0 || rule.excludedIntents.length > 0;

  if (!request.additionalRequest?.trim()) {
    return { source: 'none', stepIntents: [], excludedIntents: [], unsupported: [], conflicts: [] };
  }
  if (ruleFound || !deps.invokeAi || !shouldTryAi(request, ruleFound)) {
    return {
      source: ruleFound ? 'rule' : 'none',
      stepIntents: rule.stepIntents,
      excludedIntents: rule.excludedIntents,
      unsupported: [],
      conflicts: [],
    };
  }
  try {
    const ai = await deps.invokeAi(request);
    return {
      source: 'ai',
      stepIntents: ai.stepIntents,
      excludedIntents: rule.excludedIntents,
      unsupported: ai.unsupported ?? [],
      conflicts: ai.conflicts ?? [],
    };
  } catch {
    return {
      source: 'rule', stepIntents: rule.stepIntents, excludedIntents: rule.excludedIntents,
      unsupported: [], conflicts: [], aiError: true,
    };
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest __tests__/stepIntentResolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/step-intent-resolve.ts __tests__/stepIntentResolve.test.ts
git commit -m "feat: step intent resolve 진입점 (규칙 우선, AI 게이트)"
```

---

### Task 3: 하위 모듈이 resolvedStepIntents 우선 읽기

**Files:**
- Modify: `supabase/functions/_shared/recommendation-search.ts`, `recommendation-ranking.ts`, `recommendation-course-selection.ts`
- Test: `__tests__/stepIntentResolvedThreading.test.ts`

서버 내부 request에 optional `resolvedStepIntents?: ParsedStepIntent[]`를 실어 보내면 각 모듈이 재파싱 대신 그 값을 쓴다. 클라 스키마는 무변경(핸들러가 내부에서만 부착).

- [ ] **Step 1: 실패 테스트 작성**

```ts
// __tests__/stepIntentResolvedThreading.test.ts
import { buildKakaoSearchPlan } from '../supabase/functions/_shared/recommendation-search';
import type { ParsedStepIntent } from '../supabase/functions/_shared/step-intent';

const base = () => ({
  requestId: 'req-thread', mode: 'course' as const, language: 'ko' as const,
  location: { source: 'kakao' as const, label: 'x', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' as const },
  courseSteps: [{ id: 'step-0', category: 'meal', label: 'meal' }, { id: 'step-1', category: 'cafe', label: 'cafe' }],
});

it('resolvedStepIntents가 부착되면 additionalRequest 재파싱 대신 그 값으로 검색 플랜을 만든다', () => {
  const injected: ParsedStepIntent[] = [{
    stepId: 'step-0', stepCategory: 'meal', intentType: 'dish', canonicalTerm: '라멘',
    kakaoSearchTerms: ['라멘', '일식'], strength: 'preferred', displayLabel: { ko: '라멘', en: 'Ramen' },
  }];
  // additionalRequest는 '삼겹살'인데 resolved는 '라멘' → resolved가 이겨야 함
  const plan = buildKakaoSearchPlan({ ...base(), additionalRequest: '삼겹살', resolvedStepIntents: injected } as any);
  const intentTerms = plan.filter((p) => p.phase === 'step_intent').map((p) => p.canonicalTerm);
  expect(intentTerms).toEqual(['라멘', '라멘']); // canonical + expansion 모두 라멘 canonicalTerm 태그
  expect(intentTerms).not.toContain('삼겹살');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/stepIntentResolvedThreading.test.ts`
Expected: FAIL — 여전히 '삼겹살' 재파싱.

- [ ] **Step 3: 구현 — 공용 헬퍼 + 3개 호출부 교체**

`step-intent.ts`에 헬퍼 추가:

```ts
/** 핸들러가 부착한 resolvedStepIntents가 있으면 그걸, 없으면 규칙 파서를 쓴다. */
export function effectiveStepIntents(
  request: RecommendationRequest & { resolvedStepIntents?: ParsedStepIntent[] },
): ParsedStepIntent[] {
  return request.resolvedStepIntents ?? parseStepIntents(request).stepIntents;
}
```

`recommendation-search.ts` — `buildKakaoSearchPlan` 안 `const { stepIntents } = parseStepIntents(request);`를 교체:

```ts
import { effectiveStepIntents } from './step-intent.ts';
// ...
  const stepIntents = effectiveStepIntents(request);
```

`recommendation-ranking.ts` — `const { stepIntents } = parseStepIntents(request);`를 교체:

```ts
import { effectiveStepIntents } from './step-intent.ts';
// ...
  const stepIntents = effectiveStepIntents(request);
```

`recommendation-course-selection.ts` — `parseStepIntents(input.request).stepIntents` 사용부를 교체:

```ts
import { effectiveStepIntents } from './step-intent.ts';
// ...
  const requiredIntents = new Map(
    effectiveStepIntents(input.request)
      .filter((intent) => intent.strength === 'required')
      .map((intent) => [intent.stepId, intent]),
  );
```

(각 파일의 정확한 사용 라인은 `rg -n "parseStepIntents" supabase/functions/_shared/`로 찾아 교체. import 중복 주의.)

- [ ] **Step 4: 통과 확인 + 전체 회귀**

Run: `npx jest __tests__/stepIntentResolvedThreading.test.ts __tests__/recommend-date-search-server.test.ts __tests__/recommend-date-ranking-server.test.ts __tests__/recommend-date-course-selection.test.ts`
Expected: PASS 전체(부착 없는 기존 테스트는 규칙 파서 폴백 → 무회귀).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/step-intent.ts supabase/functions/_shared/recommendation-search.ts supabase/functions/_shared/recommendation-ranking.ts supabase/functions/_shared/recommendation-course-selection.ts __tests__/stepIntentResolvedThreading.test.ts
git commit -m "feat: 하위 모듈이 resolvedStepIntents 우선 읽기 (effectiveStepIntents)"
```

---

### Task 4: negated intent 랭킹 페널티

**Files:**
- Modify: `supabase/functions/_shared/recommendation-ranking.ts`
- Test: `__tests__/recommend-date-ranking-server.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

`describe('rankPlaceCandidates — step intent boost', ...)` 아래에:

```ts
it('negated intent에 매칭되는 후보는 페널티로 하위 랭크된다', () => {
  const excluded: ParsedStepIntent = {
    stepId: 'step-0', stepCategory: 'meal', intentType: 'dish', canonicalTerm: '삼겹살',
    kakaoSearchTerms: ['삼겹살'], strength: 'preferred', displayLabel: { ko: '삼겹살', en: 'Samgyeopsal' }, negated: true,
  };
  const porky = mealPlace('neg', { name: '역전 삼겹살' });
  const plain = mealPlace('pla');
  const req = { ...intentRequest, additionalRequest: undefined, resolvedStepIntents: [], resolvedExcludedIntents: [excluded] } as any;
  const { candidates } = rankPlaceCandidates([porky, plain], req);
  expect(candidates.findIndex((c) => c.kakaoPlaceId === 'pla'))
    .toBeLessThan(candidates.findIndex((c) => c.kakaoPlaceId === 'neg'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/recommend-date-ranking-server.test.ts -t "negated"`
Expected: FAIL — 페널티 없음.

- [ ] **Step 3: 구현**

`recommendation-ranking.ts`:

```ts
// 가중치에 추가
  stepIntentNegatedPenalty: -60,

// effectiveStepIntents 옆에서 excluded도 읽는 헬퍼(내부 request의 resolvedExcludedIntents 우선, 없으면 규칙)
  const excludedIntents = (request as { resolvedExcludedIntents?: ParsedStepIntent[] }).resolvedExcludedIntents
    ?? parseStepIntents(request).excludedIntents;

// intentBoostFor 내부 또는 별도 penalty 합산 지점에:
  const negatedPenaltyFor = (place: EvidencedKakaoPlace): number => {
    const name = place.name.normalize('NFKC').toLocaleLowerCase();
    return excludedIntents.some((intent) => name.includes(intent.canonicalTerm.toLocaleLowerCase()))
      ? RANKING_SCORE_WEIGHTS.stepIntentNegatedPenalty : 0;
  };

// scoreBreakdown.intent 합산에 + negatedPenaltyFor(place)
```

`step-intent.ts` `effectiveStepIntents` 옆에 `effectiveExcludedIntents` 대칭 추가:

```ts
export function effectiveExcludedIntents(
  request: RecommendationRequest & { resolvedExcludedIntents?: ParsedStepIntent[] },
): ParsedStepIntent[] {
  return request.resolvedExcludedIntents ?? parseStepIntents(request).excludedIntents;
}
```

랭킹은 `effectiveExcludedIntents(request)` 사용으로 정리.

- [ ] **Step 4: 통과 확인**

Run: `npx jest __tests__/recommend-date-ranking-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/recommendation-ranking.ts supabase/functions/_shared/step-intent.ts __tests__/recommend-date-ranking-server.test.ts
git commit -m "feat: negated intent 랭킹 페널티 (-60, 이름 매칭)"
```

---

### Task 5: AI 파서 action (generate-ai)

**Files:**
- Modify: `supabase/functions/generate-ai/index.ts`
- Test: `__tests__/generateAiParseStepIntents.test.ts` (신규; 기존 generate-ai 테스트 패턴 확인 후 맞춤)

- [ ] **Step 1: 실패 테스트 작성 (스키마/설정 존재 검증)**

generate-ai는 Deno 런타임이라 유닛 테스트가 제한적일 수 있음. 최소 계약 테스트로 ACTION_CONFIG에 키가 있는지 export하여 검증하거나, 스키마 형태만 순수 검증. 우선 스키마를 별도 export해 테스트:

```ts
// __tests__/generateAiParseStepIntents.test.ts
import { PARSE_STEP_INTENTS_SCHEMA } from '../supabase/functions/generate-ai/parse-step-intents-schema';

it('parse_step_intents 스키마는 stepIntents/unsupported/conflicts를 요구한다', () => {
  const props = (PARSE_STEP_INTENTS_SCHEMA as any).properties;
  expect(Object.keys(props)).toEqual(expect.arrayContaining(['stepIntents', 'unsupported', 'conflicts']));
  const item = props.stepIntents.items.properties;
  expect(Object.keys(item)).toEqual(expect.arrayContaining(['targetCategory', 'canonicalTerm', 'strength', 'negated', 'kakaoSearchTerms']));
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/generateAiParseStepIntents.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현 — 스키마 파일 분리 + action 등록**

```ts
// supabase/functions/generate-ai/parse-step-intents-schema.ts
export const PARSE_STEP_INTENTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stepIntents', 'unsupported', 'conflicts'],
  properties: {
    stepIntents: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['targetCategory', 'canonicalTerm', 'intentType', 'strength', 'negated', 'kakaoSearchTerms'],
        properties: {
          targetCategory: { type: 'string', enum: ['meal', 'cafe', 'culture', 'walk', 'drinks', 'activity'] },
          canonicalTerm: { type: 'string' },
          intentType: { type: 'string' },
          strength: { type: 'string', enum: ['required', 'preferred'] },
          negated: { type: 'boolean' },
          kakaoSearchTerms: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        },
      },
    },
    unsupported: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['term', 'reason'],
        properties: { term: { type: 'string' }, reason: { type: 'string' } } },
    },
    conflicts: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['description'],
        properties: { description: { type: 'string' } } },
    },
  },
} as const;
```

`generate-ai/index.ts` 수정:

```ts
import { PARSE_STEP_INTENTS_SCHEMA } from './parse-step-intents-schema.ts';
// ACTION_CONFIG에 추가:
  parse_step_intents: { schema: PARSE_STEP_INTENTS_SCHEMA, maxTokens: 512, temperature: 0, logged: true },
// 최종 반환 분기(라인 318 근처)에 추가:
  if (action === 'parse_step_intents') return json(parsed);
```

- [ ] **Step 4: 통과 확인 + tsc**

Run: `npx jest __tests__/generateAiParseStepIntents.test.ts && npm run validate`
Expected: PASS + tsc 클린.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-ai/parse-step-intents-schema.ts supabase/functions/generate-ai/index.ts __tests__/generateAiParseStepIntents.test.ts
git commit -m "feat: generate-ai parse_step_intents action + 스키마"
```

---

### Task 6: 핸들러 — resolve 1회 + 부착 + AI invoke 배선

**Files:**
- Modify: `supabase/functions/_shared/recommend-date-downstream.ts`, `recommend-date-handler.ts`, `recommendation-prompt.ts`(프롬프트 빌더)
- Test: `__tests__/recommend-date-phase7-handler.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

기존 핸들러 테스트 픽스처 재사용. resolvedStepIntents 부착으로 AI 유래 intent가 검색/게이트에 반영되는지, AI 미검출 시 규칙 경로 무회귀인지 검증:

```ts
describe('handler — step intent resolve 부착', () => {
  it('규칙 사전 히트는 AI를 호출하지 않고 처리한다', async () => {
    const parseAi = jest.fn();
    const result = await handleRecommendDate(baseInput({ additionalRequest: '삼겹살 먹고 싶어' }), {
      ...deps, parseStepIntentsAi: parseAi,
    });
    expect(parseAi).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
  });
});
```

(핸들러 dependency 주입 형태는 기존 `dependencies` 객체에 맞춰 `parseStepIntentsAi?` 추가.)

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/recommend-date-phase7-handler.test.ts -t "resolve 부착"`
Expected: FAIL — 의존성/부착 없음.

- [ ] **Step 3: 구현**

`recommend-date-downstream.ts`에 파서 invoke 추가(기존 invoke 재사용, action만 다름):

```ts
export async function invokeParseStepIntents(
  input: Omit<GenerateAiSelectionInput, 'action'> & { promptVersion: string },
  options: GenerateAiSelectionOptions = {},
): Promise<unknown> {
  return invokeGenerateAiSelection({ ...input, action: 'parse_step_intents' }, { timeoutMs: 8_000, ...options });
}
```

`recommend-date-handler.ts` — serverRequest 조립 직후(라인 129 이후), search 호출 전에 resolve:

```ts
import { resolveStepIntents } from './step-intent-resolve.ts';
import { buildParseStepIntentsPrompt } from './recommendation-prompt.ts';
// ...
  const resolved = await resolveStepIntents(serverRequest, {
    invokeAi: dependencies.parseStepIntentsAi
      ? async (req) => {
        const raw = await dependencies.parseStepIntentsAi!({
          prompt: buildParseStepIntentsPrompt(req),
          promptVersion: PARSE_STEP_INTENTS_PROMPT_VERSION,
        });
        return coerceAiParseResult(raw, req); // 스키마 검증 + ParsedStepIntent 매핑(stepId 바인딩)
      }
      : undefined,
  });
  const intentAwareRequest = {
    ...serverRequest,
    resolvedStepIntents: resolved.stepIntents,
    resolvedExcludedIntents: resolved.excludedIntents,
  };
```

이후 파이프라인은 `serverRequest` 대신 `intentAwareRequest`를 사용(searchCandidates·게이트·selection·prompt 빌더 인자 교체). 게이트의 required 판정도 `resolved.stepIntents.filter(required)`로 교체.

`coerceAiParseResult`는 `step-intent-resolve.ts`에 두고, AI 원출력을 `PARSE_STEP_INTENTS_SCHEMA`로 안전 파싱 후 targetCategory→첫 미사용 step 바인딩(규칙과 동일 로직 재사용). 실패 시 throw → resolve의 catch가 규칙 폴백.

`recommendation-prompt.ts`에 `buildParseStepIntentsPrompt(request)` + `PARSE_STEP_INTENTS_PROMPT_VERSION = 'parse-step-intents-v1'` 추가: courseSteps(id/category) + additionalRequest + 사전 canonical 목록을 주고 사전 canonical 매핑 강제, 미매핑은 unsupported로.

- [ ] **Step 4: 통과 확인 + 전체 회귀**

Run: `npx jest && npm run validate`
Expected: PASS 전체 + tsc 클린.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/recommend-date-downstream.ts supabase/functions/_shared/recommend-date-handler.ts supabase/functions/_shared/recommendation-prompt.ts supabase/functions/_shared/step-intent-resolve.ts __tests__/recommend-date-phase7-handler.test.ts
git commit -m "feat: 핸들러 step intent resolve 1회 + AI 파서 배선 + 부착"
```

---

### Task 7: 응답 metadata.stepIntent (미지원/충돌/메트릭)

**Files:**
- Modify: `shared/recommendation/schemas.ts`, `recommend-date-handler.ts`
- Test: `__tests__/recommend-date-phase7-handler.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

```ts
it('응답 metadata.stepIntent에 parserSource와 resolved 칩 데이터가 담긴다', async () => {
  const result = await handleRecommendDate(baseInput({ additionalRequest: '삼겹살 먹고 싶어' }), deps);
  expect(result.status).toBe(200);
  const meta = (result.body as any).metadata.stepIntent;
  expect(meta.parserSource).toBe('rule');
  expect(meta.resolved.map((r: any) => r.canonicalTerm)).toContain('삼겹살');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/recommend-date-phase7-handler.test.ts -t "metadata.stepIntent"`
Expected: FAIL — 스키마에 없음(`.strict()` 거부).

- [ ] **Step 3: 구현**

`shared/recommendation/schemas.ts` — `recommendDateMetadataSchema`에 optional 추가:

```ts
export const stepIntentMetadataSchema = z.object({
  parserSource: z.enum(['none', 'rule', 'ai']),
  aiFallbackUsed: z.boolean(),
  resolved: z.array(z.object({
    canonicalTerm: boundedText(80),
    displayLabel: z.object({ ko: boundedText(80), en: boundedText(80) }),
    strength: z.enum(['required', 'preferred']),
    negated: z.boolean(),
    stepId: boundedText(120),
  })),
  unsupported: z.array(z.object({ term: boundedText(80), reason: boundedText(200) })),
  conflicts: z.array(z.object({ description: boundedText(280) })),
}).strict();

export const recommendDateMetadataSchema = z.object({
  fallbackUsed: z.boolean(),
  selectionSource: z.enum(['ai', 'deterministic_fallback']),
  selectionReason: z.enum(['none', 'ai_timeout', 'ai_malformed', 'ai_invalid_selection', 'ai_route_constraint', 'ai_unavailable']),
  search: recommendDateSearchMetadataSchema,
  route: recommendDateRouteMetadataSchema,
  stepIntent: stepIntentMetadataSchema.optional(),
}).strict();
```

`recommend-date-handler.ts` 응답 조립(라인 258 metadata)에서 추가:

```ts
      ...(resolved.source !== 'none' || resolved.stepIntents.length > 0 ? {
        stepIntent: {
          parserSource: resolved.source,
          aiFallbackUsed: resolved.source === 'ai',
          resolved: [...resolved.stepIntents, ...resolved.excludedIntents].map((i) => ({
            canonicalTerm: i.canonicalTerm, displayLabel: i.displayLabel,
            strength: i.strength, negated: i.negated ?? false, stepId: i.stepId,
          })),
          unsupported: resolved.unsupported,
          conflicts: resolved.conflicts,
        },
      } : {}),
```

- [ ] **Step 4: 통과 확인 + 전체 회귀**

Run: `npx jest && npm run validate`
Expected: PASS 전체 + tsc 클린.

- [ ] **Step 5: Commit**

```bash
git add shared/recommendation/schemas.ts supabase/functions/_shared/recommend-date-handler.ts __tests__/recommend-date-phase7-handler.test.ts
git commit -m "feat: 응답 metadata.stepIntent (parserSource/resolved/unsupported/conflicts)"
```

---

## Self-Review 체크

- 부정어(§2) → Task 1 ✅ / resolve 배선(핵심 아키텍처) → Task 2·3·6 ✅ / AI fallback(§1) → Task 5·6 ✅ / 미지원·충돌(§3) → Task 6·7 ✅ / 메트릭(§4) → Task 7 ✅
- UI(§5 칩, §6 완화)와 Phase 4(§7)는 본 플랜 범위 밖 — 별도 플랜.
- 타입 일관: `ParsedStepIntent.negated`, `ResolvedStepIntents`, `effectiveStepIntents`/`effectiveExcludedIntents`, `metadata.stepIntent` 전 태스크 통일.
- 배포는 전 태스크 완료 후 사용자 승인.
