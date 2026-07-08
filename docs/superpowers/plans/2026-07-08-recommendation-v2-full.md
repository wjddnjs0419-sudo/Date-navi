# 추천 생성 로직 V2 (Phase 4·5·2·6·7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `lib/intent.ts`·`lib/candidate.ts`(Phase 0·1·3 완료)를 실제 파이프라인에 배선하고, Claude를 candidate 선택기로 축소하며, Adaptive Retrieval·Session 재사용·Observability까지 V2 전체를 완성한다.

**Architecture:** Kakao=검색, App=결정론(Intent·Dedup·Scoring·Validation·Fallback·Merge), Claude Haiku=상위 후보 중 선택+설명. 위치 있을 때만 candidate 플로우, 없으면 현행 자유생성 유지(무회귀). Edge 함수 2개(`generate-ai`, `place-search`) 재배포 필요.

**Tech Stack:** TypeScript, Expo/React Native, React Context(상태), Supabase Edge Functions(Deno), Claude Haiku 4.5 structured outputs, Kakao Local API, Jest.

**설계 문서:** `PLAN_GENERATION_ARCHITECTURE_V2.md` (§ 참조는 이 문서 기준).

**결정 사항 (착수 전 확정됨):**
- 범위 = V2 전체 (Phase 4·5·2·6·7).
- 위치 미입력/후보 0개 → **현행 자유생성 유지** (§12 Error Flow의 [Needs Decision]를 "무회귀"로 확정).
- `estimated_time`/`estimated_budget`은 **모든 경로에서 앱이 결정론적으로 채운다** (§11). Claude는 두 필드를 생성하지 않는다. `DateCard` 타입·`date_cards` 컬럼은 그대로(하위호환, §17).
- `pick_for_me`/`light`/`next_meet` 모드 코드 삭제는 **범위 밖**(§22 Q11). Intent 해석 시 `make_course`만 course, 나머지는 `feeling`으로 매핑.

---

## 파일 구조

**신규:**
- `lib/recommendation.ts` — candidate 플로우 순수 로직: intent 모드 매핑, candidate/course 프롬프트 빌드, Validation, Deterministic Fallback, 카드 조립, 결정론 필드 merge. (Phase 4·5)
- `lib/recommendationConfig.ts` — 중앙 Config (retrieval/ranking/claude 상수). (§19)
- `lib/recommendationSession.ts` — RecommendationSession 타입 + 경량 module-level store + React Context Provider/hook. (Phase 6)
- `__tests__/recommendation.test.ts` — Phase 4·5 순수 로직 테스트.
- `__tests__/recommendationSession.test.ts` — Phase 6 store 테스트.

**수정:**
- `supabase/functions/generate-ai/index.ts` — candidate 선택 스키마 2종(`feeling_select`/`course_select`) 추가, `cards` 스키마에서 estimated 필드 제거, `usage` 반환. (Phase 4·7)
- `supabase/functions/place-search/index.ts` — multi-query + pagination + allSettled + budget/early-stop. (Phase 2)
- `lib/place.ts` — `searchPlaces` 인자에 `queries` 추가(Phase 2), retrieval 결과 메타.
- `lib/ai.ts` — `generateDateCards` 재작성(candidate 플로우 배선), `invokeAI` usage 반환. (Phase 4·7)
- `lib/analytics.ts` — `EventName`에 recommendation 이벤트 추가. (Phase 7)
- `app/mode-flow/generating.tsx` — session 생성/저장, sessionId 전달. (Phase 6)
- `app/mode-flow/result.tsx`·`course-result.tsx` — 재추천을 session 재사용으로. (Phase 6)
- `app/card/[id].tsx` — `handleGenerateAlt` input_json override(location/coords 보존). (Phase 6)
- `app/_layout.tsx` — `RecommendationProvider` 래핑. (Phase 6)

---

## Phase 4·5 — Claude Candidate Selection + Validation/Fallback

의존: Phase 0·3(완료). 두 페이즈는 한 모듈에서 함께 구현.

### Task 1: 중앙 Config 모듈

**Files:**
- Create: `lib/recommendationConfig.ts`
- Test: `__tests__/recommendation.test.ts`

- [ ] **Step 1: 실패 테스트**

```ts
import { RECOMMENDATION_CONFIG } from '../lib/recommendationConfig';
describe('RECOMMENDATION_CONFIG', () => {
  it('exposes claude/final limits', () => {
    expect(RECOMMENDATION_CONFIG.haikuCandidateLimit).toBe(15);
    expect(RECOMMENDATION_CONFIG.finalRecommendationCount).toBe(3);
    expect(RECOMMENDATION_CONFIG.rankedCandidateLimit).toBe(20);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest recommendation` → Cannot find module.

- [ ] **Step 3: 구현**

```ts
// 추천 파이프라인 중앙 Config (§19). 코드 곳곳 하드코딩 금지.
export type RecommendationConfig = {
  // retrieval (Phase 2에서 place-search가 소비)
  minCandidateCount: number;
  maxCandidateCount: number;
  initialPageSize: number;
  maxPagesPerQuery: number;
  maxKakaoRequests: number;
  minIntentQueriesExecuted: number;
  // ranking / claude
  rankedCandidateLimit: number;
  haikuCandidateLimit: number;
  finalRecommendationCount: number;
};

export const RECOMMENDATION_CONFIG: RecommendationConfig = {
  minCandidateCount: 30,
  maxCandidateCount: 80,
  initialPageSize: 15,
  maxPagesPerQuery: 2,
  maxKakaoRequests: 8,
  minIntentQueriesExecuted: 2,
  rankedCandidateLimit: 20,
  haikuCandidateLimit: 15,
  finalRecommendationCount: 3,
};
```

- [ ] **Step 4: 통과 확인** — `npx jest recommendation`.
- [ ] **Step 5: 커밋** — `feat(reco): central recommendation config`

### Task 2: intent 모드 매핑

**Files:** Create `lib/recommendation.ts`; Test `__tests__/recommendation.test.ts`

- [ ] **Step 1: 실패 테스트**

```ts
import { resolveIntentMode } from '../lib/recommendation';
describe('resolveIntentMode', () => {
  it('maps make_course to course', () => {
    expect(resolveIntentMode('make_course')).toBe('make_course');
  });
  it.each(['feeling', 'pick_for_me', 'light', 'next_meet', 'anything'])(
    'maps %s to feeling', (m) => expect(resolveIntentMode(m)).toBe('feeling'),
  );
});
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** (파일 상단)

```ts
// Phase 4·5 — Claude candidate 선택 플로우 순수 로직.
// 위치가 있을 때만 쓰인다. Kakao 검색·Claude 호출은 lib/ai.ts가 담당.
import type { AppLanguage } from './i18n';
import type { FeelingInput, UserPreferences, DateCard } from './ai';
import type { Candidate } from './candidate';
import type { PlanIntent } from './intent';
import { RECOMMENDATION_CONFIG } from './recommendationConfig';
import { BUDGET_MAP, BUDGET_MAP_EN, DURATION_MAP, DURATION_MAP_EN } from './prompt';

export type IntentMode = 'feeling' | 'make_course';

// make_course만 course. 나머지 모드(pick_for_me/light/feeling/next_meet)는 단일 장소 카드 → feeling.
export function resolveIntentMode(mode: string): IntentMode {
  return mode === 'make_course' ? 'make_course' : 'feeling';
}
```

- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `feat(reco): intent mode mapping`

### Task 3: 결정론 필드 merge (§11·17)

**Files:** Modify `lib/recommendation.ts`; Test same.

- [ ] **Step 1: 실패 테스트**

```ts
import { deterministicFields } from '../lib/recommendation';
describe('deterministicFields', () => {
  const base = { energy:'medium', distance:'any', mood:'comfortable', avoid:[] } as any;
  it('fills estimated from budget/duration maps (ko)', () => {
    const f = deterministicFields({ ...base, budget:'low', duration:'2-3h' }, 'ko');
    expect(f.estimated_budget).toBe('저예산 (1~3만 원)');
    expect(f.estimated_time).toBe('2~3시간');
  });
  it('falls back to raw value for unknown keys', () => {
    const f = deterministicFields({ ...base, budget:'weird', duration:'x' }, 'ko');
    expect(f.estimated_budget).toBe('weird');
    expect(f.estimated_time).toBe('x');
  });
  it('uses EN maps', () => {
    const f = deterministicFields({ ...base, budget:'high', duration:'1h' }, 'en');
    expect(f.estimated_time).toBe('About 1 hour');
  });
});
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현**

```ts
// estimated_time/budget은 실제 장소 가격이 아니라 "사용자가 고른 플랜 범위"다 (§11).
export function deterministicFields(
  input: FeelingInput,
  language: AppLanguage,
): { estimated_time: string; estimated_budget: string } {
  const budgetMap = language === 'en' ? BUDGET_MAP_EN : BUDGET_MAP;
  const durationMap = language === 'en' ? DURATION_MAP_EN : DURATION_MAP;
  return {
    estimated_budget: budgetMap[input.budget] ?? input.budget,
    estimated_time: durationMap[input.duration] ?? input.duration,
  };
}
```

- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `feat(reco): deterministic estimated fields`

### Task 4: Candidate 블록 & feeling/course 프롬프트

**Files:** Modify `lib/recommendation.ts`; Test same.

- [ ] **Step 1: 실패 테스트**

```ts
import { buildCandidatesBlock, buildFeelingSelectPrompt, buildCourseSelectPrompt } from '../lib/recommendation';
const cands = [
  { candidateId:'candidate_001', placeId:'p1', name:'A카페', category:'카페', address:'서울 성수', x:'127', y:'37', mapUrl:'http://a', matchedQueries:['카페'], matchedIntentSignals:[], score:6 },
  { candidateId:'candidate_002', placeId:'p2', name:'B식당', category:'음식점', address:'서울 성수', x:'127', y:'37', mapUrl:'http://b', matchedQueries:['맛집'], matchedIntentSignals:[], score:3 },
] as any;
const intent = { purpose:'meal', placeTypes:['cafe'], atmosphere:['quiet'], budgetLevel:'low', duration:'2-3h', searchQueries:['카페'], positiveSignals:[], negativeSignals:[] } as any;

describe('candidate prompts', () => {
  it('block lists candidate_id + name + category, never leaks score internals as facts', () => {
    const b = buildCandidatesBlock(cands, 'ko');
    expect(b).toContain('candidate_001');
    expect(b).toContain('A카페');
    expect(b).toContain('카페');
  });
  it('feeling prompt asks JSON recommendations w/ candidate_id and forbids inventing places', () => {
    const p = buildFeelingSelectPrompt(cands, intent, {} as any, undefined, 'ko');
    expect(p).toContain('candidate_id');
    expect(p).toContain('recommendations');
    expect(p).not.toContain('estimated_time'); // 앱이 채움
    expect(p).not.toContain('estimated_budget');
  });
  it('course prompt requests steps with optional candidate_id', () => {
    const p = buildCourseSelectPrompt(cands, intent, {} as any, undefined, 'ko');
    expect(p).toContain('steps');
    expect(p).toContain('candidate_id');
  });
  it('caps candidates to haikuCandidateLimit', () => {
    const many = Array.from({length:20},(_,i)=>({...cands[0], candidateId:`candidate_${String(i+1).padStart(3,'0')}`, placeId:`p${i}`}));
    const b = buildCandidatesBlock(many as any, 'ko');
    expect((b.match(/candidate_/g) ?? []).length).toBeLessThanOrEqual(15);
  });
});
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** (핵심 프롬프트. §10 속성 사실 단정 금지 규칙 포함)

```ts
const clampCandidates = (c: Candidate[]) => c.slice(0, RECOMMENDATION_CONFIG.haikuCandidateLimit);

export function buildCandidatesBlock(candidates: Candidate[], language: AppLanguage): string {
  const list = clampCandidates(candidates)
    .map(c => `- ${c.candidateId} | ${c.name} | ${c.category} | ${c.address}`)
    .join('\n');
  return language === 'en'
    ? `【Candidate places (choose only from these)】\n${list}`
    : `【후보 장소 (반드시 이 중에서만 선택)】\n${list}`;
}

const NO_FACT_RULE_KO =
  '없는 속성(조용함/저렴함/혼잡도/분위기 등)을 사실로 단정하지 마세요. 카테고리·거리·검색어 일치 같은 확인 가능한 근거로만 설명하세요.';
const NO_FACT_RULE_EN =
  'Do not claim unsupported venue attributes (quiet/cheap/crowd/vibe) as facts. Explain only from available signals: category, distance, matched query.';

function prefsHint(prefs: UserPreferences | undefined, language: AppLanguage): string {
  if (!prefs) return '';
  const parts: string[] = [];
  if (prefs.preferred_tags?.length) parts.push(prefs.preferred_tags.join(', '));
  if (prefs.avoid_tags?.length) parts.push((language==='en'?'avoid: ':'피하기: ') + prefs.avoid_tags.join(', '));
  if (!parts.length) return '';
  return (language==='en'?'\n【Couple preferences】\n':'\n【커플 취향】\n') + parts.join(' / ');
}

export function buildFeelingSelectPrompt(
  candidates: Candidate[], intent: PlanIntent, input: FeelingInput,
  prefs: UserPreferences | undefined, language: AppLanguage,
): string {
  const block = buildCandidatesBlock(candidates, language);
  const note = input.freeText ? `\n${language==='en'?'Note':'메모'}: ${input.freeText}` : '';
  const n = RECOMMENDATION_CONFIG.finalRecommendationCount;
  if (language === 'en') {
    return `You recommend dates by SELECTING from real candidate places. Pick ${n} distinct candidates and write a warm card for each.
${block}${prefsHint(prefs,'en')}${note}

${NO_FACT_RULE_EN}
Reply with JSON only:
{ "recommendations": [ { "candidate_id": "candidate_001", "title": "<=15 chars", "summary": "<=40 chars", "why_recommended": "<=50 chars", "tags": ["t1","t2","t3"] } ] }`;
  }
  return `당신은 실제 후보 장소 중에서 선택해 데이트를 추천합니다. 서로 다른 후보 ${n}개를 골라 각각 따뜻한 카드를 작성하세요.
${block}${prefsHint(prefs,'ko')}${note}

${NO_FACT_RULE_KO}
반드시 아래 JSON으로만 답하세요:
{ "recommendations": [ { "candidate_id": "candidate_001", "title": "15자 이내", "summary": "40자 이내", "why_recommended": "50자 이내, 따뜻한 말투", "tags": ["태그1","태그2","태그3"] } ] }`;
}

export function buildCourseSelectPrompt(
  candidates: Candidate[], intent: PlanIntent, input: FeelingInput,
  prefs: UserPreferences | undefined, language: AppLanguage,
): string {
  const block = buildCandidatesBlock(candidates, language);
  const note = input.freeText ? `\n${language==='en'?'Idea':'아이디어'}: ${input.freeText}` : '';
  if (language === 'en') {
    return `Build ONE (max 2) ordered date course from the real candidates below.
${block}${prefsHint(prefs,'en')}${note}

Each place step MUST reference a candidate_id from the list. Pure-action steps (walk, movie) omit candidate_id.
${NO_FACT_RULE_EN}
Reply with JSON only:
{ "recommendations": [ { "title": "<=15 chars", "summary": "<=40 chars", "why_recommended": "<=50 chars", "tags": ["t1","t2"], "steps": [ { "candidate_id": "candidate_003", "label": "brunch", "desc": "<=20 chars" }, { "label": "river walk", "desc": "<=20 chars" } ] } ] }`;
  }
  return `아래 실제 후보들로 순서 있는 데이트 코스 1개(최대 2개)를 구성하세요.
${block}${prefsHint(prefs,'ko')}${note}

장소 단계는 반드시 목록의 candidate_id를 참조하세요. 순수 행동 단계(산책·영화 등)는 candidate_id 없이 label/desc만 작성하세요.
${NO_FACT_RULE_KO}
반드시 아래 JSON으로만 답하세요:
{ "recommendations": [ { "title": "15자 이내", "summary": "40자 이내", "why_recommended": "50자 이내", "tags": ["태그1","태그2"], "steps": [ { "candidate_id": "candidate_003", "label": "브런치", "desc": "20자 이내" }, { "label": "한강 산책", "desc": "20자 이내" } ] } ] }`;
}
```

- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `feat(reco): candidate-selection prompts`

### Task 5: feeling Validation + 조립

**Files:** Modify `lib/recommendation.ts`; Test same.

Claude 응답 타입:
```ts
export type FeelingRec = { candidate_id?: string; title?: string; summary?: string; why_recommended?: string; tags?: string[] };
export type CourseRec = { title?: string; summary?: string; why_recommended?: string; tags?: string[]; steps?: { candidate_id?: string; label?: string; desc?: string }[] };
```

- [ ] **Step 1: 실패 테스트**

```ts
import { assembleFeelingCards } from '../lib/recommendation';
const cands = [ /* candidate_001 p1, candidate_002 p2 as above */ ] as any;
const input = { energy:'medium', budget:'low', distance:'any', mood:'comfortable', duration:'2-3h', avoid:[] } as any;
describe('assembleFeelingCards', () => {
  it('keeps only recs whose candidate_id exists; merges place + deterministic fields', () => {
    const recs = [
      { candidate_id:'candidate_001', title:'조용한 카페', summary:'s', why_recommended:'w', tags:['a'] },
      { candidate_id:'ghost_999', title:'x', summary:'y', why_recommended:'z', tags:[] }, // 실재 안함 → 제거
    ];
    const cards = assembleFeelingCards(recs, cands, input, [], 'ko');
    expect(cards).toHaveLength(1);
    expect(cards[0].place_name).toBe('A카페');
    expect(cards[0].map_url).toBe('http://a');
    expect(cards[0].estimated_budget).toBe('저예산 (1~3만 원)');
  });
  it('drops duplicate candidate_id', () => {
    const recs = [
      { candidate_id:'candidate_001', title:'t1', summary:'s', why_recommended:'w', tags:[] },
      { candidate_id:'candidate_001', title:'t2', summary:'s', why_recommended:'w', tags:[] },
    ];
    expect(assembleFeelingCards(recs, cands, input, [], 'ko')).toHaveLength(1);
  });
  it('excludes candidate whose placeId is in previousPlaceIds', () => {
    const recs = [{ candidate_id:'candidate_001', title:'t', summary:'s', why_recommended:'w', tags:[] }];
    expect(assembleFeelingCards(recs, cands, input, ['p1'], 'ko')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현**

```ts
export type FeelingRec = { candidate_id?: string; title?: string; summary?: string; why_recommended?: string; tags?: string[] };

export function assembleFeelingCards(
  recs: FeelingRec[], candidates: Candidate[], input: FeelingInput,
  previousPlaceIds: string[], language: AppLanguage,
): DateCard[] {
  const byId = new Map(candidates.map(c => [c.candidateId, c]));
  const prev = new Set(previousPlaceIds);
  const seen = new Set<string>();
  const det = deterministicFields(input, language);
  const out: DateCard[] = [];
  for (const r of recs) {
    const id = r.candidate_id;
    if (!id || seen.has(id)) continue;
    const c = byId.get(id);
    if (!c || prev.has(c.placeId)) continue;
    seen.add(id);
    out.push({
      title: r.title ?? c.name,
      summary: r.summary ?? '',
      why_recommended: r.why_recommended ?? '',
      tags: Array.isArray(r.tags) ? r.tags : [],
      estimated_time: det.estimated_time,
      estimated_budget: det.estimated_budget,
      place_name: c.name,
      place_address: c.address,
      map_url: c.mapUrl,
    });
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `feat(reco): feeling validation + assembly`

### Task 6: course Validation + 조립

**Files:** Modify `lib/recommendation.ts`; Test same.

- [ ] **Step 1: 실패 테스트**

```ts
import { assembleCourseCards } from '../lib/recommendation';
describe('assembleCourseCards', () => {
  it('resolves place steps to real place fields, keeps action steps, drops ghost place steps', () => {
    const recs = [{ title:'코스', summary:'s', why_recommended:'w', tags:['t'], steps:[
      { candidate_id:'candidate_001', label:'카페', desc:'d1' },
      { label:'산책', desc:'d2' },              // 행동 단계 유지
      { candidate_id:'ghost', label:'x', desc:'d3' }, // 실재 안함 → 제거
    ] }];
    const cards = assembleCourseCards(recs as any, cands, input, [], 'ko');
    expect(cards).toHaveLength(1);
    expect(cards[0].steps).toHaveLength(2);
    expect(cards[0].steps![0].place_name).toBe('A카페');
    expect(cards[0].steps![1].label).toBe('산책');
  });
  it('drops a course that has zero valid place steps', () => {
    const recs = [{ title:'c', summary:'s', why_recommended:'w', tags:[], steps:[{ candidate_id:'ghost', label:'x' }] }];
    expect(assembleCourseCards(recs as any, cands, input, [], 'ko')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — `CourseStep` 타입을 place 필드로 확장.

먼저 `lib/course.ts`의 `CourseStep`을 확장(하위호환, 전부 optional):
```ts
export type CourseStep = { label: string; desc?: string; place_name?: string; place_address?: string; map_url?: string };
```
그다음 `lib/recommendation.ts`:
```ts
export type CourseRec = { title?: string; summary?: string; why_recommended?: string; tags?: string[]; steps?: { candidate_id?: string; label?: string; desc?: string }[] };

export function assembleCourseCards(
  recs: CourseRec[], candidates: Candidate[], input: FeelingInput,
  previousPlaceIds: string[], language: AppLanguage,
): DateCard[] {
  const byId = new Map(candidates.map(c => [c.candidateId, c]));
  const prev = new Set(previousPlaceIds);
  const det = deterministicFields(input, language);
  const out: DateCard[] = [];
  for (const r of recs.slice(0, 2)) {
    const steps: import('./course').CourseStep[] = [];
    let placeCount = 0;
    for (const st of r.steps ?? []) {
      if (st.candidate_id) {
        const c = byId.get(st.candidate_id);
        if (!c || prev.has(c.placeId)) continue; // ghost/제외 place step 제거
        placeCount++;
        steps.push({ label: st.label ?? c.name, desc: st.desc, place_name: c.name, place_address: c.address, map_url: c.mapUrl });
      } else {
        steps.push({ label: st.label ?? '', desc: st.desc }); // 행동 단계 유지
      }
    }
    if (placeCount === 0) continue; // 유효 장소 단계 0 → 코스 폐기 (§12)
    out.push({
      title: r.title ?? '', summary: r.summary ?? '', why_recommended: r.why_recommended ?? '',
      tags: Array.isArray(r.tags) ? r.tags : [], estimated_time: det.estimated_time,
      estimated_budget: det.estimated_budget, steps,
    });
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인** — course.test.ts 회귀 없음도 확인(`npx jest course recommendation`).
- [ ] **Step 5: 커밋** — `feat(reco): course validation + assembly`

### Task 7: Deterministic Fallback (재호출 없음, §12)

**Files:** Modify `lib/recommendation.ts`; Test same.

- [ ] **Step 1: 실패 테스트**

```ts
import { buildDeterministicFallback } from '../lib/recommendation';
describe('buildDeterministicFallback', () => {
  it('fills up to needed count from ranked candidates, skipping used/previous placeIds', () => {
    const cards = buildDeterministicFallback(cands, intent, input, ['p2'], new Set(['candidate_001']), 2, 'ko');
    // p2 previous 제외, candidate_001 already used → 남는 후보 없음
    expect(cards).toHaveLength(0);
  });
  it('produces cards with only data-verifiable copy (no vibe claims)', () => {
    const cards = buildDeterministicFallback(cands, intent, input, [], new Set(), 1, 'ko');
    expect(cards).toHaveLength(1);
    expect(cards[0].place_name).toBe('A카페');
    expect(cards[0].summary).not.toMatch(/조용|저렴/); // 금지 문구
  });
});
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현**

```ts
export function buildDeterministicFallback(
  candidates: Candidate[], intent: PlanIntent, input: FeelingInput,
  previousPlaceIds: string[], usedCandidateIds: Set<string>, needed: number, language: AppLanguage,
): DateCard[] {
  if (needed <= 0) return [];
  const prev = new Set(previousPlaceIds);
  const det = deterministicFields(input, language);
  const en = language === 'en';
  const out: DateCard[] = [];
  for (const c of candidates) {
    if (out.length >= needed) break;
    if (usedCandidateIds.has(c.candidateId) || prev.has(c.placeId)) continue;
    out.push({
      title: c.name,
      summary: en ? 'A place matching your search conditions and location.' : '검색 조건과 위치를 고려한 추천 장소예요.',
      why_recommended: en ? 'Selected by category, distance, and matched query.' : '검색 조건, 장소 유형, 거리 기준으로 선정되었어요.',
      tags: c.matchedQueries.slice(0, 3),
      estimated_time: det.estimated_time, estimated_budget: det.estimated_budget,
      place_name: c.name, place_address: c.address, map_url: c.mapUrl,
    });
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `feat(reco): deterministic fallback`

### Task 8: Edge `generate-ai` 스키마 2종 + estimated 제거 + usage

**Files:** Modify `supabase/functions/generate-ai/index.ts` (배포는 Task 12에서 게이트)

- [ ] **Step 1:** `cards` 스키마에서 `estimated_time`/`estimated_budget` 제거(properties+required 둘 다). 자유생성 경로도 앱이 채우므로.
- [ ] **Step 2:** 신규 스키마 추가:

```ts
const FEELING_SELECT_SCHEMA = {
  type:'object', properties:{ recommendations:{ type:'array', items:{ type:'object',
    properties:{ candidate_id:{type:'string'}, title:{type:'string'}, summary:{type:'string'},
      why_recommended:{type:'string'}, tags:{type:'array',items:{type:'string'}} },
    required:['candidate_id','title','summary','why_recommended','tags'], additionalProperties:false }}},
  required:['recommendations'], additionalProperties:false,
};
const COURSE_SELECT_SCHEMA = {
  type:'object', properties:{ recommendations:{ type:'array', items:{ type:'object',
    properties:{ title:{type:'string'}, summary:{type:'string'}, why_recommended:{type:'string'},
      tags:{type:'array',items:{type:'string'}},
      steps:{ type:'array', items:{ type:'object',
        properties:{ candidate_id:{type:'string'}, label:{type:'string'}, desc:{type:'string'} },
        required:['label'], additionalProperties:false }}},
    required:['title','summary','why_recommended','tags','steps'], additionalProperties:false }}},
  required:['recommendations'], additionalProperties:false,
};
```

- [ ] **Step 3:** `ACTION_CONFIG`에 추가:
```ts
feeling_select: { schema: FEELING_SELECT_SCHEMA, maxTokens: 1536, temperature: 0.7 },
course_select: { schema: COURSE_SELECT_SCHEMA, maxTokens: 2048, temperature: 0.7 },
```
- [ ] **Step 4:** 응답에 usage 포함 (§7 Q6):
```ts
const parsed = JSON.parse(text);
return json({ ...parsed, _usage: { input_tokens: data.usage?.input_tokens, output_tokens: data.usage?.output_tokens } });
```
- [ ] **Step 5: 커밋** — `feat(edge): candidate-select schemas + usage (generate-ai)` (배포 X)

### Task 9: `generateDateCards` 재작성 — candidate 플로우 배선

**Files:** Modify `lib/ai.ts`; Test `__tests__/recommendation.test.ts`(순수 조립은 Task 5·6·7이 커버). `generateDateCards`는 supabase 의존이라 단위테스트 대신 tsc+런타임 검증.

- [ ] **Step 1:** `invokeAI` 액션 유니온 확장: `'cards' | 'soft_message' | 'feeling_select' | 'course_select'`. 반환에서 `_usage`는 분리해 optional 로깅(Phase 7).
- [ ] **Step 2:** `searchPlaces`는 Phase 2 전까지 현행 유지(focus 기반). candidate 플로우용으로 KakaoPlace[] 그대로 사용.
- [ ] **Step 3:** `generateDateCards` 재작성:

```ts
export async function generateDateCards(
  input: FeelingInput, mode: string, prefs?: UserPreferences, language: AppLanguage = 'ko',
  opts?: { previousPlaceIds?: string[]; onSession?: (s: { intent: PlanIntent; candidates: Candidate[]; usedPlaceIds: string[] }) => void },
): Promise<DateCard[]> {
  const previousPlaceIds = opts?.previousPlaceIds ?? [];
  try {
    if (input.location || input.coords) {
      const intentMode = resolveIntentMode(mode);
      const intent = resolveIntent({ mode: intentMode, freeText: input.freeText, mood: input.mood, budget: input.budget, duration: input.duration });
      const focus = detectPlaceFocus(input.freeText); // Phase 2 전까지 현행 검색 재사용
      const places = await searchPlaces({ location: input.location, coords: input.coords }, distanceToRadius(input.distance), focus);
      const candidates = buildCandidates(places, intent);
      if (candidates.length > 0) {
        const cards = await runCandidateFlow(intentMode, candidates, intent, input, prefs, language, previousPlaceIds);
        if (cards.length > 0) {
          opts?.onSession?.({ intent, candidates, usedPlaceIds: collectPlaceIds(cards, candidates) });
          return cards;
        }
      }
    }
    return await runFreeGenFlow(input, mode, prefs, language);
  } catch {
    return FALLBACK_CARDS_BY_LANGUAGE[language];
  }
}
```

`runCandidateFlow`:
```ts
async function runCandidateFlow(intentMode, candidates, intent, input, prefs, language, previousPlaceIds): Promise<DateCard[]> {
  const action = intentMode === 'make_course' ? 'course_select' : 'feeling_select';
  const prompt = intentMode === 'make_course'
    ? buildCourseSelectPrompt(candidates, intent, input, prefs, language)
    : buildFeelingSelectPrompt(candidates, intent, input, prefs, language);
  const data = (await invokeAI(action, prompt)) as { recommendations?: unknown[] };
  const recs = Array.isArray(data?.recommendations) ? data.recommendations : [];
  const n = RECOMMENDATION_CONFIG.finalRecommendationCount;
  if (intentMode === 'make_course') {
    return assembleCourseCards(recs as CourseRec[], candidates, input, previousPlaceIds, language);
  }
  const valid = assembleFeelingCards(recs as FeelingRec[], candidates, input, previousPlaceIds, language);
  if (valid.length >= n) return valid.slice(0, n);
  const usedIds = new Set(usedCandidateIds(recs as FeelingRec[]));
  return [...valid, ...buildDeterministicFallback(candidates, intent, input, previousPlaceIds, usedIds, n - valid.length, language)];
}
```

`runFreeGenFlow` (현행 자유생성, estimated는 앱이 채움):
```ts
async function runFreeGenFlow(input, mode, prefs, language): Promise<DateCard[]> {
  let placesBlock = '';
  if (input.location || input.coords) {
    const focus = detectPlaceFocus(input.freeText);
    const places = await searchPlaces({ location: input.location, coords: input.coords }, distanceToRadius(input.distance), focus);
    placesBlock = formatPlacesBlock(places, language, focus?.label);
  }
  const prompt = buildPrompt(input, mode, prefs, language, placesBlock);
  const data = (await invokeAI('cards', prompt)) as { cards?: DateCard[] };
  if (!Array.isArray(data?.cards) || data.cards.length === 0) throw new Error('No cards');
  const det = deterministicFields(input, language);
  return data.cards.slice(0, 3).map(c => ({ ...c, estimated_time: det.estimated_time, estimated_budget: det.estimated_budget }));
}
```
헬퍼 `collectPlaceIds`/`usedCandidateIds`도 `lib/recommendation.ts`에 추가하고 테스트.

- [ ] **Step 4:** `npm run validate` (tsc) 통과.
- [ ] **Step 5: 커밋** — `feat(reco): wire candidate flow into generateDateCards`

### Task 10: 자유생성 경로 estimated merge 회귀 테스트

- [ ] `__tests__/recommendation.test.ts`에 `mergeFreeGenEstimated` 순수화(선택) 또는 `deterministicFields`가 free-gen 매핑에서 동일하게 쓰이는지 확인 테스트 추가. 통과 후 커밋.

### Task 11: 전체 검증

- [ ] `npm run validate` (tsc) — 에러 0.
- [ ] `npx jest` — 전체 통과 (place/candidate/intent/recommendation 포함).
- [ ] `__tests__/place.test.ts`·`candidate.test.ts` 회귀 없음 확인.

### Task 12: Edge 배포 (게이트 — 사용자 승인 필요)

> ⚠️ 프로덕션 변경. 배포 전 사용자에게 리스크 안내(구 스키마→신 스키마 전환, 앱 클라이언트가 신 액션 전송). 메모리 [[user-profile-date-navi-dev]] 원칙.

- [ ] `generate-ai` v? 배포 (MCP `deploy_edge_function`).
- [ ] iOS 시뮬레이터: feeling(위치 입력)·make_course·위치 없음(자유생성) 3경로 육안 검증.

---

## Phase 2 — Adaptive Retrieval (place-search Edge)

의존: Phase 0(완료), Phase 1(queries). Edge 오케스트레이션(§8·§22 Q5 권장: Edge 내부).

### Task 13: place-search 계약 확장 (queries + config)

**Files:** Modify `supabase/functions/place-search/index.ts`, `lib/place.ts`, `lib/ai.ts`

- [ ] **Step 1:** place-search Request에 `queries?: string[]`, `categoryCodes?: string[]`, `page`/budget 내부 관리 추가. focus 하위호환 유지.
- [ ] **Step 2:** 다중 쿼리 실행을 `Promise.allSettled`로 — 부분 실패 허용(§8). 각 쿼리 page 1 → merge → dedup(by `id`) → early stop 판정(minCandidateCount + minIntentQueriesExecuted) → 부족 시 우선순위 쿼리 page 2. `maxKakaoRequests` 상한.
- [ ] **Step 3:** dedup 키를 name → **doc.id(placeId)** 로 변경. 응답 `places` 최대 `maxCandidateCount`. 응답에 `_meta: { successfulQueryCount, failedQueryCount, kakaoRequestCount }` 포함(§18).
- [ ] **Step 4:** `lib/ai.ts`의 candidate 플로우가 `intent.searchQueries`를 place-search에 전달하도록 `searchPlaces` 시그니처 확장. 자유생성 경로는 focus 유지.
- [ ] **Step 5:** Edge 로컬 로직 단위테스트 어려움 → merge/dedup/early-stop 순수 함수를 별도 추출해 테스트(가능하면). tsc 통과.
- [ ] **Step 6:** 커밋 `feat(edge): adaptive multi-query retrieval (place-search)` — 배포 게이트.

### Task 14: place-search 배포 (게이트)

- [ ] MCP `deploy_edge_function` place-search. 시뮬레이터로 후보 recall 향상·중복 제거 확인.

---

## Phase 6 — RecommendationSession & Regeneration

의존: Phase 0·3·5. 저장=경량 module store + Context(§13·§22 Q1).

### Task 15: Session store + 타입

**Files:** Create `lib/recommendationSession.ts`; Test `__tests__/recommendationSession.test.ts`

- [ ] **Step 1: 실패 테스트** — `createSession`/`getSession`/`addPreviousPlaceIds` 라운드트립, sessionId 유니크.
- [ ] **Step 2: 구현** (module-level Map + Context 훅). `Math.random` 미사용(카운터 기반 id, 예: `sess_${++counter}`; 테스트 결정론).

```ts
export type RecommendationSession = {
  sessionId: string; input: FeelingInput; intent: PlanIntent;
  candidates: Candidate[]; previousPlaceIds: string[]; mode: string;
};
```
- [ ] **Step 3: 통과 + 커밋** `feat(reco): recommendation session store`

### Task 16: generating.tsx에서 session 생성 + sessionId 전달

**Files:** Modify `app/mode-flow/generating.tsx`, `app/_layout.tsx`(Provider)

- [ ] `generateDateCards`에 `onSession` 콜백으로 intent/candidates/usedPlaceIds 회수 → `createSession` → sessionId를 result params로 전달. Candidate Pool은 URL params로 직렬화하지 않는다(§13).
- [ ] `_layout.tsx`에 `RecommendationProvider` 래핑.
- [ ] tsc 통과, 커밋.

### Task 17: 재추천 = session 재사용 (result/course-result)

**Files:** Modify `app/mode-flow/result.tsx`, `course-result.tsx`

- [ ] "다시 추천받기"가 generating 전체 재실행 대신, sessionId로 기존 candidates 재사용 + `previousPlaceIds` 제외 → `runCandidateFlow` 재선택. 후보 부족 시에만 추가 retrieval. previousPlaceIds에 새 선택 추가(§14, soft 제외 §16).
- [ ] 커밋.

### Task 18: handleGenerateAlt input_json override (§15)

**Files:** Modify `app/card/[id].tsx`

- [ ] 원본 `card.input_json`을 파싱해 base로 쓰고 조건만 override: `closer`→distance='near', `budget_adjust`→budget='low', `indoor`→avoid에 'outdoor' 추가. **location/coords 보존.** 하드코딩 FeelingInput 생성 제거.
- [ ] `card.input_json` 없으면 현행 하드코딩 fallback 유지.
- [ ] tsc 통과, 커밋. (input_json에 coords 실재 여부는 시뮬레이터 검증 §22 Q8.)

---

## Phase 7 — Observability

의존: 파이프라인 존재. analytics_events.params(jsonb) 재사용(§18·§22 Q7).

### Task 19: analytics EventName 확장 + RecommendationAnalytics 로깅

**Files:** Modify `lib/analytics.ts`, `lib/ai.ts`

- [ ] **Step 1:** `EventName`에 추가: `'recommendation_generated' | 'recommendation_regenerated' | 'recommendation_fallback'`.
- [ ] **Step 2:** `generateDateCards`에서 계측 수집(순수 카운트만, latency는 `Date.now` 사용 가능 — 런타임 코드라 허용): rawCandidateCount, rankedCandidateCount, haikuCandidateCount, finalRecommendationCount, fallbackRecommendationCount, retrieval/claude latency, claude usage(_usage). `logEvent('recommendation_generated', {...})`.
- [ ] **Step 3:** 실패는 앱 흐름 무영향(logEvent 기존 try/catch). tsc 통과, 커밋.

### Task 20: 최종 통합 검증

- [ ] `npm run validate` + `npx jest` 전체 통과.
- [ ] 시뮬레이터 종단 검증: 최초 추천 → 재추천(placeId 제외 확인) → 조건 재생성 → 위치 없음 자유생성. Analytics 로우 생성 확인(Supabase).
- [ ] PLAN.md·RESULT.md 갱신, AGENTS.md ratchet(발견한 함정 1줄).

---

## Self-Review 메모

- **Spec 커버리지:** §10(Claude 선택+설명)=Task4·5·6, §11(결정론 필드)=Task3·9, §12(Validation/Fallback)=Task5·6·7, §16(course B-hybrid)=Task6, §17(DB 하위호환)=Task3·8(estimated 유지), §8(Adaptive)=Task13, §13·14(Session/재추천)=Task15·16·17, §15(handleGenerateAlt)=Task18, §18(Observability)=Task19, §19(Config)=Task1.
- **타입 일관성:** `Candidate`(candidateId/placeId/mapUrl), `DateCard`(estimated_time/budget/place_name/place_address/map_url/steps), `CourseStep`(place_name 확장) 전 태스크 일치.
- **비결정 API 주의:** 순수 테스트 대상 함수는 `Date.now`/`Math.random` 미사용. 런타임 코드(latency/session id)는 허용하되 테스트는 순수 함수만 검증.
- **하위호환:** `cards` 액션·`DateCard` 필드·`date_cards` 컬럼 유지. 신규 액션만 추가.
