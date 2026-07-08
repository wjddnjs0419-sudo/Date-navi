# 예산 제거 · 시간 옵셔널화 · 후보 검색 매칭 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **이 프로젝트 실행 방식 관련 사용자 지시:** 단계별로 subagent를 불러 리뷰하지 말 것. 모든 태스크가 끝난 뒤 한 번에 리뷰한다 (executing-plans의 inline 방식, 태스크마다 멈추지 않고 끝까지 진행 후 최종 리뷰).

**Goal:** 예산(budget)을 AI 추천 경로(프롬프트·후보 검색·입력 UI)에서 완전히 제거하고, 시간(duration)을 옵셔널로 바꾸면서 `course_select`의 코스 단계 수 조절에 실제로 반영하며, 후보 검색이 사용자의 자유 입력 키워드(특히 음식 종류·"영화")를 훨씬 잘 찾아내게 한다.

**Architecture:** `FeelingInput`에서 `budget` 필드를 제거하고 `duration`을 optional로 바꾼다. `lib/intent.ts`/`lib/place.ts`의 키워드 매칭 규칙을 고치고, `resolveIntent()`가 freeText 원문을 검색어에 항상 추가하게 한다. `lib/recommendation.ts`의 `buildCourseSelectPrompt()`에 duration 기반 단계 수 지침을 추가한다. UI(`feeling.tsx`/`course.tsx`)에서 예산 질문을 없애고 시간 선택을 옵셔널로 만들며, 자유 입력창에 키워드 힌트를 추가한다. 카드 표시 화면들은 예산/시간이 빈 값일 때 조건부로 숨긴다.

**Tech Stack:** TypeScript/React Native(Expo), Jest.

**참고 스펙:** [docs/superpowers/specs/2026-07-08-budget-duration-retrieval-rework-design.md](../specs/2026-07-08-budget-duration-retrieval-rework-design.md)

---

### Task 1: `FeelingInput`/`FeelingArgs`/`CourseArgs` 타입 정리 (TDD)

**Files:**
- Modify: `lib/ai.ts:90-102`
- Modify: `lib/modeForm.ts` (전체)
- Test: `__tests__/modeForm.test.ts`

- [ ] **Step 1: 실패하는 테스트로 갱신**

`__tests__/modeForm.test.ts` 전체를 다음으로 교체:

```ts
import { buildFeelingInput, buildCourseInput } from '../lib/modeForm';

describe('mode별 FeelingInput 빌더', () => {
  it('feeling: 분위기 mood + freeText 반영', () => {
    const input = buildFeelingInput({ mood: 'quiet', freeText: '조용한 데이트', duration: '1h' });
    expect(input.mood).toBe('quiet');
    expect(input.freeText).toBe('조용한 데이트');
  });
  it('모든 빌더가 location을 전달한다', () => {
    expect(buildFeelingInput({ mood: 'quiet', duration: '1h', location: '연남동' }).location).toBe('연남동');
    expect(buildCourseInput({ idea: '한강', duration: '', location: '여의도' }).location).toBe('여의도');
  });
  it('location 공백/미입력은 undefined로 정규화', () => {
    expect(buildFeelingInput({ mood: 'quiet', duration: '1h' }).location).toBeUndefined();
    expect(buildCourseInput({ idea: '한강', duration: '', location: '  ' }).location).toBeUndefined();
  });
  it('모든 빌더가 coords를 전달한다', () => {
    const coords = { x: '127.05', y: '37.54' };
    expect(buildFeelingInput({ mood: 'quiet', duration: '1h', coords }).coords).toEqual(coords);
    expect(buildCourseInput({ idea: '한강', duration: '', coords }).coords).toEqual(coords);
  });
  it('coords 미지정 시 undefined', () => {
    expect(buildFeelingInput({ mood: 'quiet', duration: '1h' }).coords).toBeUndefined();
    expect(buildCourseInput({ idea: '한강', duration: '' }).coords).toBeUndefined();
  });
  it('coords가 있으면 location 텍스트는 버린다 (GPS placeholder 저장 방지)', () => {
    const coords = { x: '127.05', y: '37.54' };
    expect(buildFeelingInput({ mood: 'quiet', duration: '1h', location: '내 위치 사용 중', coords }).location).toBeUndefined();
    expect(buildCourseInput({ idea: '한강', duration: '', location: '내 위치 사용 중', coords }).location).toBeUndefined();
  });

  it('feeling: budget 필드가 결과 객체에 없다', () => {
    const input = buildFeelingInput({ mood: 'quiet', duration: '1h' });
    expect('budget' in input).toBe(false);
  });

  it('course: 아이디어 freeText 반영, duration 빈 값은 undefined', () => {
    const input = buildCourseInput({ idea: '한강 피크닉', duration: '' });
    expect(input.freeText).toBe('한강 피크닉');
    expect(input.duration).toBeUndefined();
    const input2 = buildCourseInput({ idea: ' 야경 ', duration: 'half_day' });
    expect(input2.freeText).toBe('야경');
    expect(input2.duration).toBe('half_day');
  });

  it('feeling: duration 미지정이면 undefined', () => {
    const input = buildFeelingInput({ mood: 'quiet' });
    expect(input.duration).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest __tests__/modeForm.test.ts`
Expected: FAIL — `FeelingArgs`/`CourseArgs`에 아직 `budget`이 필수라 타입 에러가 나거나(테스트가 컴파일 안 됨), `duration`이 빈 문자열일 때 여전히 `'2-3h'` 기본값으로 채워져 있어 `toBeUndefined()` assertion이 깨짐.

- [ ] **Step 3: `lib/ai.ts`의 `FeelingInput` 타입 수정**

`lib/ai.ts:90-102`을 다음으로 교체:

```ts
export type FeelingInput = {
  energy: string;
  distance: string;
  mood: string;
  duration?: string;
  avoid: string[];
  freeText?: string;
  // 사용자가 입력한 동네/지역 텍스트 (예: "성수동"). 있으면 카카오 로컬로 실제 장소를 붙인다.
  location?: string;
  // GPS 현재 위치 (LocationField의 내 위치 토글 사용 시에만 채워진다)
  coords?: GeoCoords;
};
```

- [ ] **Step 4: `lib/modeForm.ts` 전체 교체**

```ts
import type { FeelingInput, GeoCoords } from './ai';

const norm = (v?: string) => v?.trim() || undefined;

type FeelingArgs = { mood: string; duration?: string; freeText?: string; location?: string; coords?: GeoCoords };

export function buildFeelingInput(a: FeelingArgs): FeelingInput {
  return {
    energy: 'medium',
    distance: 'any',
    mood: a.mood,
    duration: norm(a.duration),
    avoid: [],
    freeText: norm(a.freeText),
    location: a.coords ? undefined : norm(a.location),
    coords: a.coords,
  };
}

type CourseArgs = { idea: string; duration?: string; location?: string; coords?: GeoCoords };

export function buildCourseInput(a: CourseArgs): FeelingInput {
  return {
    energy: 'medium',
    distance: 'any',
    mood: 'comfortable',
    duration: norm(a.duration),
    avoid: [],
    freeText: a.idea.trim() || undefined,
    location: a.coords ? undefined : norm(a.location),
    coords: a.coords,
  };
}
```

(`norm()`으로 빈 문자열을 `undefined`로 정규화 — `course.tsx`가 넘기던 `budget || 'medium'`/`duration || '2-3h'` 기본값 로직은 삭제. `course`의 "예산/시간 빈 값이면 기본값" 테스트 케이스는 Step 1에서 이미 "duration undefined" 기대값으로 바꿔뒀다.)

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx jest __tests__/modeForm.test.ts`
Expected: PASS

- [ ] **Step 6: 타입체크** (다른 파일들이 아직 `budget`을 참조해 에러가 날 수 있음 — 이 태스크에서는 `lib/ai.ts`/`lib/modeForm.ts` 관련 에러만 없으면 됨, 나머지는 이후 태스크에서 해소)

Run: `npm run validate 2>&1 | grep -E "lib/ai.ts|lib/modeForm.ts"`
Expected: 출력 없음(두 파일 관련 에러 없음). 다른 파일 에러는 이후 태스크에서 순차적으로 없어짐 — 지금 단계에서는 정상.

- [ ] **Step 7: 커밋**

```bash
git add lib/ai.ts lib/modeForm.ts __tests__/modeForm.test.ts
git commit -m "feat(types): drop budget from FeelingInput, make duration optional"
```

---

### Task 2: `lib/intent.ts` — budget 제거, "영화" 분리, 음식 키워드 확장, freeText 원문 검색어 추가 (TDD)

**Files:**
- Modify: `lib/intent.ts`
- Modify: `__tests__/candidate.test.ts:16` (fixture만 수정)
- Test: `__tests__/intent.test.ts`

- [ ] **Step 1: 실패하는 테스트로 갱신**

`__tests__/intent.test.ts` 전체를 다음으로 교체:

```ts
import { resolveIntent, type PlanIntent } from '../lib/intent';

describe('resolveIntent — feeling 모드', () => {
  it('"공부하기 좋은 조용한 카페" → study purpose + cafe + 확장 쿼리 + 부정 신호', () => {
    const intent = resolveIntent({
      mode: 'feeling',
      freeText: '공부하기 좋은 조용한 카페',
      mood: 'quiet',
      duration: '2-3h',
    });
    expect(intent.purpose).toBe('study');
    expect(intent.placeTypes).toContain('cafe');
    expect(intent.searchQueries).toContain('스터디카페');
    expect(intent.searchQueries).toContain('북카페');
    expect(intent.negativeSignals).toContain('술집');
    expect(intent.duration).toBe('2-3h');
  });

  it('"술 한잔 하고 싶어" → drink purpose + bar + 술집 쿼리', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '술 한잔 하고 싶어', mood: 'fun', duration: '2-3h' });
    expect(intent.purpose).toBe('drink');
    expect(intent.placeTypes).toContain('bar');
    expect(intent.searchQueries).toContain('술집');
  });

  it('freeText 없으면 general_date + 폭넓은 placeTypes (2종 이상)', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: undefined, mood: 'romantic', duration: '2-3h' });
    expect(intent.purpose).toBe('general_date');
    expect(intent.placeTypes.length).toBeGreaterThanOrEqual(2);
  });

  it('mood를 atmosphere로 매핑한다 (quiet)', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '카페', mood: 'quiet', duration: '1h' });
    expect(intent.atmosphere).toContain('quiet');
  });

  it('"영화보고 싶어"는 액티비티가 아니라 영화관으로 감지된다', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '영화보고 싶어', mood: 'comfortable', duration: '2-3h' });
    expect(intent.searchQueries).toContain('영화관');
    expect(intent.searchQueries).not.toContain('액티비티');
  });

  it('"방탈출"은 여전히 액티비티로 감지된다 ("영화" 분리가 다른 액티비티 키워드에 영향 없음)', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '방탈출 가고 싶어', mood: 'fun', duration: '2-3h' });
    expect(intent.searchQueries).toContain('액티비티');
  });

  it('"일식 먹고 싶어"는 meal purpose로 감지된다 (구체 음식 키워드)', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '일식 먹고 싶어', mood: 'comfortable', duration: '2-3h' });
    expect(intent.purpose).toBe('meal');
    expect(intent.placeTypes).toContain('restaurant');
  });

  it('freeText 원문이 searchQueries에 항상 포함된다 (하드코딩 목록에 없는 키워드 대비)', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '브라질리언 바베큐 먹고 싶어', mood: 'comfortable', duration: '2-3h' });
    expect(intent.searchQueries).toContain('브라질리언 바베큐 먹고 싶어');
  });

  it('freeText가 없으면 원문 추가도 없다', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: undefined, mood: 'comfortable', duration: '2-3h' });
    expect(intent.searchQueries).not.toContain(undefined);
    expect(intent.searchQueries.every(q => typeof q === 'string' && q.length > 0)).toBe(true);
  });
});

describe('resolveIntent — make_course 모드', () => {
  it('단일 카테고리로 좁히지 않는다 — "카페 가고 싶어"여도 placeTypes 2종 이상', () => {
    const intent = resolveIntent({ mode: 'make_course', freeText: '카페 가고 싶어', mood: 'comfortable', duration: 'half_day' });
    expect(intent.placeTypes).toContain('cafe');
    expect(intent.placeTypes.length).toBeGreaterThanOrEqual(2);
  });

  it('여러 활동을 언급하면 해당 placeType들을 모두 확보한다 — "브런치 먹고 산책"', () => {
    const intent = resolveIntent({ mode: 'make_course', freeText: '브런치 먹고 산책', mood: 'comfortable', duration: 'half_day' });
    expect(intent.placeTypes).toContain('restaurant');
    expect(intent.placeTypes).toContain('attraction');
  });

  it('searchQueries에 중복이 없다', () => {
    const intent: PlanIntent = resolveIntent({ mode: 'make_course', freeText: '카페 카페 브런치', mood: 'comfortable', duration: 'half_day' });
    const unique = new Set(intent.searchQueries);
    expect(unique.size).toBe(intent.searchQueries.length);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest __tests__/intent.test.ts`
Expected: FAIL — `budgetLevel` 관련 필드가 타입에 남아있어도 무해하지만, "영화보고 싶어" 테스트와 "일식" 테스트, freeText 원문 포함 테스트가 아직 로직이 없어 실패.

- [ ] **Step 3: `lib/intent.ts` 수정**

`lib/intent.ts` 전체를 다음으로 교체:

```ts
// Phase 1 — Intent Resolution + Query Expansion (순수 로직).
// Mode + freeText + UI Selection(mood/duration)을 종합해 "추천 검색 계획"(PlanIntent)을 만든다.
// Kakao 검색·Claude 호출과 무관한 결정론 영역. (PLAN_GENERATION_ARCHITECTURE_V2.md §4·§5·§7)

export type PlaceType = 'cafe' | 'restaurant' | 'bar' | 'culture' | 'attraction' | 'activity' | 'sports';

export type Purpose =
  | 'study' | 'date' | 'meal' | 'drink' | 'walk'
  | 'activity' | 'culture' | 'rest' | 'general_date';

// mood → 표현 힌트(atmosphere). 사실 단정이 아니라 톤 힌트일 뿐 (§10).
export type Atmosphere = 'comfortable' | 'lively' | 'romantic' | 'quiet' | 'novel';

export type PlanIntent = {
  purpose: Purpose;
  placeTypes: PlaceType[];
  atmosphere: Atmosphere[];
  duration?: string;
  searchQueries: string[];
  positiveSignals: string[];
  negativeSignals: string[];
};

export type ResolveIntentArgs = {
  mode: 'feeling' | 'make_course';
  freeText?: string;
  mood?: string;
  duration?: string;
};

type IntentRule = {
  purpose: Purpose;
  pattern: RegExp;
  placeTypes: PlaceType[];
  searchQueries: string[];
  positiveSignals: string[];
  negativeSignals: string[];
};

// 배열 순서 = 매칭 우선순위. 복합어("보드게임카페")에서 일반 카테고리 단어가 부분 문자열로 잡히는 걸
// 막기 위해 activity/sports 같은 구체 키워드를 일반 카테고리보다 먼저 검사한다. (기존 detectPlaceFocus 계승)
export const INTENT_RULES: IntentRule[] = [
  {
    purpose: 'study',
    pattern: /공부|작업|과제|노트북|집중/,
    placeTypes: ['cafe'],
    searchQueries: ['카페', '스터디카페', '북카페', '작업 카페', '조용한 카페'],
    positiveSignals: ['스터디', '북카페', '작업'],
    negativeSignals: ['술집', '포차', '클럽', '라운지'],
  },
  {
    purpose: 'culture',
    pattern: /영화/,
    placeTypes: ['culture'],
    searchQueries: ['영화관'],
    positiveSignals: ['영화관'],
    negativeSignals: [],
  },
  {
    purpose: 'activity',
    pattern: /액티비티|방탈출|보드게임|클라이밍|VR|노래방|볼링|피크닉/,
    placeTypes: ['activity'],
    searchQueries: ['액티비티', '방탈출', '보드게임카페', '노래방'],
    positiveSignals: ['액티비티', '방탈출', '보드게임'],
    negativeSignals: [],
  },
  {
    purpose: 'activity',
    pattern: /스포츠|당구|골프|테니스|헬스|축구|야구|농구|배드민턴|수영|탁구/,
    placeTypes: ['sports'],
    searchQueries: ['스포츠', '당구장', '볼링장'],
    positiveSignals: ['스포츠'],
    negativeSignals: [],
  },
  {
    purpose: 'drink',
    pattern: /술|이자카야|호프|포차|포장마차|와인|맥주|칵테일/,
    placeTypes: ['bar'],
    searchQueries: ['술집', '이자카야', '와인바', '포차'],
    positiveSignals: ['이자카야', '와인바', '포차'],
    negativeSignals: [],
  },
  {
    purpose: 'meal',
    pattern: /맛집|음식점|식당|밥집|브런치|저녁식사|점심|디너|밥|일식|양식|한식|중식|초밥|파스타|고기|삼겹살/,
    placeTypes: ['restaurant'],
    searchQueries: ['맛집', '음식점', '레스토랑', '브런치'],
    positiveSignals: ['맛집', '레스토랑'],
    negativeSignals: [],
  },
  {
    purpose: 'culture',
    pattern: /전시|박물관|미술관|문화시설|공연|연극/,
    placeTypes: ['culture'],
    searchQueries: ['전시', '미술관', '박물관', '공연장'],
    positiveSignals: ['전시', '미술관'],
    negativeSignals: [],
  },
  {
    purpose: 'meal',
    pattern: /카페|커피|디저트|베이커리/,
    placeTypes: ['cafe'],
    searchQueries: ['카페', '디저트카페', '베이커리카페'],
    positiveSignals: ['디저트', '베이커리'],
    negativeSignals: [],
  },
  {
    purpose: 'walk',
    pattern: /관광|산책|공원|나들이|명소|드라이브/,
    placeTypes: ['attraction'],
    searchQueries: ['공원', '산책로', '관광명소'],
    positiveSignals: ['공원', '산책'],
    negativeSignals: [],
  },
];

const MOOD_ATMOSPHERE: Record<string, Atmosphere> = {
  comfortable: 'comfortable',
  fun: 'lively',
  romantic: 'romantic',
  quiet: 'quiet',
  new: 'novel',
};

// 코스는 단일 카테고리로 좁히지 않는다 (§16). 감지된 것이 없거나 하나뿐이어도 동선이 나오도록 기본 스프레드를 보강.
const COURSE_BASE_PLACE_TYPES: PlaceType[] = ['cafe', 'restaurant', 'attraction'];
const COURSE_BASE_QUERIES: string[] = ['카페', '맛집', '공원'];

// freeText 없는 feeling의 폭넓은 폴백.
const GENERAL_PLACE_TYPES: PlaceType[] = ['cafe', 'restaurant', 'attraction'];
const GENERAL_QUERIES: string[] = ['카페', '맛집', '관광명소'];

const uniq = <T,>(arr: T[]): T[] => [...new Set(arr)];

function matchRules(freeText: string): IntentRule[] {
  return INTENT_RULES.filter(r => r.pattern.test(freeText));
}

export function resolveIntent(args: ResolveIntentArgs): PlanIntent {
  const { mode, freeText, mood, duration } = args;
  const text = freeText?.trim() ?? '';
  const matches = text ? matchRules(text) : [];
  // 하드코딩 규칙에 없는 키워드("일식", "이자카야", "브라질리언 바베큐" 등)도 카카오가
  // 직접 풀텍스트로 찾을 수 있도록, freeText 원문을 항상 검색어에 추가한다.
  const freeTextQuery = text ? [text] : [];

  const atmosphere: Atmosphere[] = mood && MOOD_ATMOSPHERE[mood] ? [MOOD_ATMOSPHERE[mood]] : [];

  if (mode === 'make_course') {
    // 백본은 feeling과 공유하되, 코스는 다카테고리 후보를 확보해야 동선이 나온다.
    const placeTypes = uniq([...matches.flatMap(m => m.placeTypes), ...COURSE_BASE_PLACE_TYPES]);
    const searchQueries = uniq([...matches.flatMap(m => m.searchQueries), ...COURSE_BASE_QUERIES, ...freeTextQuery]);
    const positiveSignals = uniq(matches.flatMap(m => m.positiveSignals));
    const negativeSignals = uniq(matches.flatMap(m => m.negativeSignals));
    const purpose: Purpose = matches[0]?.purpose ?? 'general_date';
    return { purpose, placeTypes, atmosphere, duration, searchQueries, positiveSignals, negativeSignals };
  }

  // feeling: 첫 매치를 주 purpose로 채택. 없으면 general_date + 폭넓은 후보.
  if (matches.length === 0) {
    return {
      purpose: 'general_date',
      placeTypes: [...GENERAL_PLACE_TYPES],
      atmosphere,
      duration,
      searchQueries: uniq([...GENERAL_QUERIES, ...freeTextQuery]),
      positiveSignals: [],
      negativeSignals: [],
    };
  }

  const primary = matches[0];
  return {
    purpose: primary.purpose,
    placeTypes: uniq(primary.placeTypes),
    atmosphere,
    duration,
    searchQueries: uniq([...primary.searchQueries, ...freeTextQuery]),
    positiveSignals: uniq(primary.positiveSignals),
    negativeSignals: uniq(primary.negativeSignals),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest __tests__/intent.test.ts`
Expected: PASS

- [ ] **Step 5: `__tests__/candidate.test.ts:16`의 fixture에서 `budget` 제거**

`__tests__/candidate.test.ts:16`:

```ts
const studyIntent = resolveIntent({ mode: 'feeling', freeText: '공부하기 좋은 카페', mood: 'quiet', duration: '2-3h' });
```

- [ ] **Step 6: 관련 테스트 통과 확인**

Run: `npx jest __tests__/candidate.test.ts`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/intent.ts __tests__/intent.test.ts __tests__/candidate.test.ts
git commit -m "feat(intent): drop budget, separate 영화 from activity, add cuisine keywords, always include raw freeText as a search query"
```

---

### Task 3: `lib/place.ts` — `FOCUS_KEYWORD_MAP`에서 "영화" 분리 (TDD)

**Files:**
- Modify: `lib/place.ts:51-60`
- Test: `__tests__/place.test.ts`

- [ ] **Step 1: 실패하는 테스트로 갱신**

`__tests__/place.test.ts:142-144`(`"영화" 언급 시 액티비티 키워드 검색으로 감지` 테스트)을 다음으로 교체:

```ts
  it('"영화" 언급 시 영화관 카테고리로 감지된다 (액티비티 아님)', () => {
    expect(detectPlaceFocus('영화 보고 싶어')).toEqual({ query: '영화관', label: '영화관' });
  });
```

`__tests__/place.test.ts:72-75`의 `intent()` 헬퍼에서 `budgetLevel: 'medium',`을 제거:

```ts
  const intent = (over: Partial<PlanIntent>): PlanIntent => ({
    purpose: 'meal', placeTypes: [], atmosphere: [], duration: '2-3h',
    searchQueries: [], positiveSignals: [], negativeSignals: [], ...over,
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest __tests__/place.test.ts -t "영화"`
Expected: FAIL — 아직 `{ query: '액티비티', label: '액티비티' }`를 반환.

- [ ] **Step 3: `lib/place.ts:51-60`의 `FOCUS_KEYWORD_MAP` 수정**

```ts
const FOCUS_KEYWORD_MAP: { pattern: RegExp; focus: PlaceFocus }[] = [
  // 카카오 로컬에 전용 카테고리 코드가 없어 술집처럼 키워드 검색으로 처리.
  { pattern: /영화/, focus: { query: '영화관', label: '영화관' } },
  { pattern: /액티비티|방탈출|보드게임|클라이밍|VR|노래방|볼링|피크닉/, focus: { query: '액티비티', label: '액티비티' } },
  { pattern: /스포츠|당구|골프|테니스|헬스|축구|야구|농구|배드민턴|수영|탁구/, focus: { query: '스포츠', label: '스포츠' } },
  { pattern: /카페|커피|디저트|베이커리/, focus: { code: 'CE7', label: '카페' } },
  { pattern: /맛집|음식점|식당|밥집/, focus: { code: 'FD6', label: '음식점' } },
  { pattern: /술집|이자카야|호프|포장마차/, focus: { query: '술집', label: '술집' } },
  { pattern: /전시|박물관|미술관|문화시설|공연/, focus: { code: 'CT1', label: '문화시설' } },
  { pattern: /관광|산책|공원|나들이|명소/, focus: { code: 'AT4', label: '관광명소' } },
];
```

(순서 주의: "영화"를 액티비티 규칙보다 먼저 검사해야 한다 — 기존 액티비티 정규식에서 `영화`를 빼는 것과 별개로, 새 규칙이 먼저 매치돼야 함.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest __tests__/place.test.ts`
Expected: PASS

- [ ] **Step 5: 타입체크**

Run: `npm run validate 2>&1 | grep -E "lib/place.ts|__tests__/place.test.ts"`
Expected: 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/place.ts __tests__/place.test.ts
git commit -m "fix(place): separate 영화 from activity focus keyword, fix stale budgetLevel test fixture"
```

---

### Task 4: `lib/prompt.ts` — 예산 제거, 시간 있을 때만 프롬프트에 포함 (TDD)

**Files:**
- Modify: `lib/prompt.ts`
- Test: `__tests__/prompt.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`__tests__/prompt.test.ts`의 `base` fixture(L4-7)를 다음으로 교체(budget 제거):

```ts
const base: FeelingInput = {
  energy: 'low', distance: 'near',
  mood: 'comfortable', duration: '1h', avoid: [],
};
```

파일 끝(`PROMPT_VERSION` describe 블록 뒤)에 추가:

```ts
describe('buildPrompt 예산/시간', () => {
  it('예산 관련 텍스트를 포함하지 않는다', () => {
    const p = buildPrompt(base, 'feeling');
    expect(p).not.toMatch(/예산|Budget/);
  });
  it('duration이 있으면 가능 시간 텍스트를 포함한다', () => {
    const p = buildPrompt(base, 'feeling');
    expect(p).toContain('가능 시간');
  });
  it('duration이 없으면 가능 시간 텍스트를 생략한다', () => {
    const p = buildPrompt({ ...base, duration: undefined }, 'feeling');
    expect(p).not.toContain('가능 시간');
  });
  it('en: duration이 없으면 Time available 텍스트를 생략한다', () => {
    const p = buildPrompt({ ...base, duration: undefined }, 'feeling', undefined, 'en');
    expect(p).not.toContain('Time available');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest __tests__/prompt.test.ts -t "예산/시간"`
Expected: FAIL — 예산 텍스트가 여전히 포함되고, duration 없어도 `가능 시간: undefined` 같은 텍스트가 나옴.

- [ ] **Step 3: `lib/prompt.ts` 수정**

`lib/prompt.ts:12-22`(`BUDGET_MAP`, `BUDGET_LABEL`)와 `lib/prompt.ts:54-63`(`BUDGET_MAP_EN`, `BUDGET_LABEL_EN`) 삭제.

`buildPrompt()`(`lib/prompt.ts:170-256`) 내부 수정 — 먼저 duration 텍스트 줄을 조건부로 만드는 헬퍼를 함수 상단에 추가하고, EN/KO 템플릿 리터럴에서 예산 줄을 제거하고 시간 줄을 변수로 치환:

```ts
export function buildPrompt(
  input: FeelingInput,
  mode: string,
  prefs?: UserPreferences,
  language: AppLanguage = 'ko',
  placesBlock = '',
): string {
  const isEnglish = language === 'en';
  const hasPlaces = placesBlock.length > 0;
  // 실제 장소가 주입될 때만 카드 JSON 골격에 place 필드를 노출한다.
  const placesSchema = hasPlaces
    ? (isEnglish
      ? `,\n      "place_name": "Real place name from the list",\n      "place_address": "Its address",\n      "map_url": "Its map link"`
      : `,\n      "place_name": "목록의 실제 장소명",\n      "place_address": "그 장소 주소",\n      "map_url": "그 장소 지도 링크"`)
    : '';
  const avoidText = input.avoid.length > 0
    ? (isEnglish
      ? `Things to avoid: ${input.avoid.map(a => AVOID_MAP_EN[a] ?? a).join(', ')}`
      : `피하고 싶은 것: ${input.avoid.map(a => AVOID_MAP[a] ?? a).join(', ')}`)
    : '';
  const freeTextPart = input.freeText ? `\n${isEnglish ? 'Additional note' : '추가 메모'}: ${input.freeText}` : '';
  const durationLine = input.duration
    ? (isEnglish
      ? `\n- Time available: ${DURATION_MAP_EN[input.duration] ?? input.duration}`
      : `\n- 가능 시간: ${DURATION_MAP[input.duration] ?? input.duration}`)
    : '';
  const modeContext = (isEnglish ? MODE_CONTEXT_EN[mode] : MODE_CONTEXT[mode]) ?? (isEnglish ? 'A couple that needs help planning a date' : '데이트 계획이 필요한 커플');
  const emphasisBlock = (isEnglish ? MODE_EMPHASIS_EN[mode] : MODE_EMPHASIS[mode]) ?? '';
  const prefsBlock = prefs ? buildPreferencesBlock(prefs, language) : '';
  // make_course만 JSON 골격에 steps 배열을 명시해야 모델이 단계를 채운다.
  const stepsSchema = mode === 'make_course'
    ? (isEnglish
      ? `,\n      "steps": [{ "label": "place/action (<=12 chars)", "desc": "one-line note (<=20 chars)" }]`
      : `,\n      "steps": [{ "label": "장소/행동 (12자 이내)", "desc": "한 줄 보충 (20자 이내)" }]`)
    : '';

  if (isEnglish) {
    return `You are an expert at planning dates for couples. Based on the situation below, recommend 3 date ideas.

【Situation】 ${modeContext}
- Energy: ${ENERGY_MAP_EN[input.energy] ?? input.energy}
- Distance: ${DISTANCE_MAP_EN[input.distance] ?? input.distance}
- Vibe: ${MOOD_MAP_EN[input.mood] ?? input.mood}${durationLine}
${avoidText}${freeTextPart}${emphasisBlock}${prefsBlock}${placesBlock}

Reply with JSON only. Do not include any other text.

{
  "cards": [
    {
      "title": "Date title (within 15 characters)",
      "summary": "One-line summary (within 40 characters)",
      "estimated_time": "Estimated time",
      "estimated_budget": "Estimated cost per person",
      "tags": ["Tag 1", "Tag 2", "Tag 3"],
      "why_recommended": "Why this fits well (within 50 characters, warm tone)"${stepsSchema}${placesSchema}
    }
  ]
}

Tag examples: low travel, good when tired, cheap, low risk, indoor, outdoor, romantic, fun, quiet, good for photos`;
  }

  return `당신은 커플 데이트 계획 전문가입니다. 아래 커플의 상황을 보고 데이트 후보 3개를 추천해주세요.

【상황】 ${modeContext}
- 컨디션: ${ENERGY_MAP[input.energy] ?? input.energy}
- 이동 거리: ${DISTANCE_MAP[input.distance] ?? input.distance}
- 분위기: ${MOOD_MAP[input.mood] ?? input.mood}${durationLine}
${avoidText}${freeTextPart}${emphasisBlock}${prefsBlock}${placesBlock}

반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트는 출력하지 마세요.

{
  "cards": [
    {
      "title": "데이트 제목 (15자 이내)",
      "summary": "한 줄 설명 (40자 이내)",
      "estimated_time": "예상 소요 시간",
      "estimated_budget": "1인 예상 비용",
      "tags": ["태그1", "태그2", "태그3"],
      "why_recommended": "이 데이트가 잘 맞는 이유 (50자 이내, 따뜻한 말투)"${stepsSchema}${placesSchema}
    }
  ]
}

태그 예시: 이동 적음, 피곤한 날 가능, 돈 적게 듦, 실패 확률 낮음, 실내, 야외, 로맨틱, 재밌음, 조용함, 사진 찍기 좋음`;
}
```

(`estimated_time`/`estimated_budget`은 JSON 스키마 설명 텍스트에 여전히 남아있지만, 실제 `generate-ai`의 `CARDS_SCHEMA`에는 이 필드가 없어 모델이 무시한다 — 기존부터 있던 불일치라 이번 스펙 범위 밖. `DURATION_MAP`/`DURATION_MAP_EN`은 그대로 유지.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest __tests__/prompt.test.ts`
Expected: PASS

- [ ] **Step 5: 타입체크**

Run: `npm run validate 2>&1 | grep -E "lib/prompt.ts|__tests__/prompt.test.ts"`
Expected: 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/prompt.ts __tests__/prompt.test.ts
git commit -m "feat(prompt): drop budget from buildPrompt, make duration line conditional"
```

---

### Task 5: `lib/recommendation.ts` — 예산 제거, 코스 단계 수 조절, feeling 참고 문맥 (TDD)

**Files:**
- Modify: `lib/recommendation.ts`
- Modify: `__tests__/recommendationSession.test.ts:11-12` (fixture만 수정)
- Test: `__tests__/recommendation.test.ts`

- [ ] **Step 1: 실패하는 테스트로 갱신**

`__tests__/recommendation.test.ts:18-23`의 fixture를 다음으로 교체:

```ts
const cands: Candidate[] = [
  { candidateId: 'candidate_001', placeId: 'p1', name: 'A카페', category: '카페', address: '서울 성수', x: '127', y: '37', mapUrl: 'http://a', matchedQueries: ['카페'], matchedIntentSignals: [], score: 6 },
  { candidateId: 'candidate_002', placeId: 'p2', name: 'B식당', category: '음식점', address: '서울 성수', x: '127', y: '37', mapUrl: 'http://b', matchedQueries: ['맛집'], matchedIntentSignals: [], score: 3 },
];
const intent: PlanIntent = { purpose: 'meal', placeTypes: ['cafe'], atmosphere: ['quiet'], duration: '2-3h', searchQueries: ['카페'], positiveSignals: [], negativeSignals: [] };
const input: FeelingInput = { energy: 'medium', distance: 'any', mood: 'comfortable', duration: '2-3h', avoid: [] };
```

`__tests__/recommendation.test.ts:42-57`(`describe('deterministicFields', ...)`)를 다음으로 교체:

```ts
describe('deterministicFields', () => {
  it('estimated_budget은 항상 빈 문자열 (예산은 AI 추천 근거에서 제외)', () => {
    const f = deterministicFields(input, 'ko');
    expect(f.estimated_budget).toBe('');
  });
  it('duration이 있으면 duration map으로 estimated_time을 채운다', () => {
    const f = deterministicFields({ ...input, duration: '2-3h' }, 'ko');
    expect(f.estimated_time).toBe('2~3시간');
  });
  it('duration이 없으면 estimated_time도 빈 문자열', () => {
    const f = deterministicFields({ ...input, duration: undefined }, 'ko');
    expect(f.estimated_time).toBe('');
  });
  it('알 수 없는 duration 값은 원본 그대로 폴백', () => {
    const f = deterministicFields({ ...input, duration: 'x' }, 'ko');
    expect(f.estimated_time).toBe('x');
  });
  it('uses EN maps', () => {
    const f = deterministicFields({ ...input, duration: '1h' }, 'en');
    expect(f.estimated_time).toBe('About 1 hour');
  });
});
```

`__tests__/recommendation.test.ts:85-96`(`assembleFeelingCards` 첫 테스트)에서 `estimated_budget` assertion을 수정:

```ts
  it('keeps only recs whose candidate_id exists; merges place + deterministic fields', () => {
    const recs = [
      { candidate_id: 'candidate_001', title: '조용한 카페', summary: 's', why_recommended: 'w', tags: ['a'] },
      { candidate_id: 'ghost_999', title: 'x', summary: 'y', why_recommended: 'z', tags: [] },
    ];
    const cards = assembleFeelingCards(recs, cands, input, [], 'ko');
    expect(cards).toHaveLength(1);
    expect(cards[0].place_name).toBe('A카페');
    expect(cards[0].map_url).toBe('http://a');
    expect(cards[0].estimated_budget).toBe('');
  });
```

`describe('candidate prompts', ...)` 블록(L59-83) 뒤에 새 describe 블록 추가:

```ts
describe('duration이 프롬프트에 미치는 영향', () => {
  it('course_select: duration=1h면 2단계 지침', () => {
    const p = buildCourseSelectPrompt(cands, intent, { ...input, duration: '1h' }, undefined, 'ko');
    expect(p).toContain('2단계');
  });
  it('course_select: duration=2-3h면 3단계 지침', () => {
    const p = buildCourseSelectPrompt(cands, intent, { ...input, duration: '2-3h' }, undefined, 'ko');
    expect(p).toContain('3단계');
  });
  it('course_select: duration=half_day/full_day면 4단계 지침', () => {
    const pHalf = buildCourseSelectPrompt(cands, intent, { ...input, duration: 'half_day' }, undefined, 'ko');
    const pFull = buildCourseSelectPrompt(cands, intent, { ...input, duration: 'full_day' }, undefined, 'ko');
    expect(pHalf).toContain('4단계');
    expect(pFull).toContain('4단계');
  });
  it('course_select: duration 없으면 단계 수 지침 생략', () => {
    const p = buildCourseSelectPrompt(cands, intent, { ...input, duration: undefined }, undefined, 'ko');
    expect(p).not.toMatch(/\d단계로 구성/);
  });
  it('feeling_select: duration이 있으면 참고 문맥으로만 포함', () => {
    const p = buildFeelingSelectPrompt(cands, intent, { ...input, duration: '2-3h' }, undefined, 'ko');
    expect(p).toContain('가능 시간: 2~3시간');
  });
  it('feeling_select: duration 없으면 생략', () => {
    const p = buildFeelingSelectPrompt(cands, intent, { ...input, duration: undefined }, undefined, 'ko');
    expect(p).not.toContain('가능 시간');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest __tests__/recommendation.test.ts`
Expected: FAIL — `deterministicFields`가 여전히 budget을 읽으려 하고(타입 에러 가능), duration 단계 수 지침이 아직 없음.

- [ ] **Step 3: `lib/recommendation.ts` 수정**

`lib/recommendation.ts:10`을 수정(더 이상 `BUDGET_LABEL`/`BUDGET_LABEL_EN` import 안 함):

```ts
import { DURATION_MAP, DURATION_MAP_EN } from './prompt';
```

`lib/recommendation.ts:22-33`(`deterministicFields`)을 다음으로 교체:

```ts
// estimated_time은 실제 장소 소요시간이 아니라 "사용자가 고른 시간 범위"다 (§11).
// estimated_budget은 항상 빈 문자열 — 예산은 실제 장소 데이터로 검증할 수 없어 AI 추천 근거에서 제외한다.
export function deterministicFields(
  input: FeelingInput,
  language: AppLanguage,
): { estimated_time: string; estimated_budget: string } {
  const durationMap = language === 'en' ? DURATION_MAP_EN : DURATION_MAP;
  return {
    estimated_budget: '',
    estimated_time: input.duration ? (durationMap[input.duration] ?? input.duration) : '',
  };
}
```

`lib/recommendation.ts:61-82`(`buildFeelingSelectPrompt`)를 다음으로 교체:

```ts
export function buildFeelingSelectPrompt(
  candidates: Candidate[], intent: PlanIntent, input: FeelingInput,
  prefs: UserPreferences | undefined, language: AppLanguage,
): string {
  const block = buildCandidatesBlock(candidates, language);
  const note = input.freeText ? `\n${language === 'en' ? 'Note' : '메모'}: ${input.freeText}` : '';
  const durationMap = language === 'en' ? DURATION_MAP_EN : DURATION_MAP;
  const durationNote = input.duration
    ? `\n${language === 'en' ? 'Time available' : '가능 시간'}: ${durationMap[input.duration] ?? input.duration}`
    : '';
  const n = RECOMMENDATION_CONFIG.finalRecommendationCount;
  if (language === 'en') {
    return `You recommend dates by SELECTING from real candidate places. Pick ${n} distinct candidates and write a warm card for each.
${block}${prefsHint(prefs, 'en')}${note}${durationNote}

${NO_FACT_RULE_EN}
Reply with JSON only:
{ "recommendations": [ { "candidate_id": "candidate_001", "title": "<=15 chars", "summary": "<=40 chars", "why_recommended": "<=50 chars", "tags": ["t1","t2","t3"] } ] }`;
  }
  return `당신은 실제 후보 장소 중에서 선택해 데이트를 추천합니다. 서로 다른 후보 ${n}개를 골라 각각 따뜻한 카드를 작성하세요.
${block}${prefsHint(prefs, 'ko')}${note}${durationNote}

${NO_FACT_RULE_KO}
반드시 아래 JSON으로만 답하세요:
{ "recommendations": [ { "candidate_id": "candidate_001", "title": "15자 이내", "summary": "40자 이내", "why_recommended": "50자 이내, 따뜻한 말투", "tags": ["태그1","태그2","태그3"] } ] }`;
}
```

`lib/recommendation.ts:84-106`(`buildCourseSelectPrompt`)를 다음으로 교체:

```ts
// duration이 짧을수록 코스 단계 수를 줄이라는 구조적 지침 — 사실 단정이 아니라 페이싱 지침이라 hallucination 위험이 없다.
const COURSE_STEP_COUNT_BY_DURATION: Record<string, number> = {
  '1h': 2,
  '2-3h': 3,
  half_day: 4,
  full_day: 4,
};

export function buildCourseSelectPrompt(
  candidates: Candidate[], intent: PlanIntent, input: FeelingInput,
  prefs: UserPreferences | undefined, language: AppLanguage,
): string {
  const block = buildCandidatesBlock(candidates, language);
  const note = input.freeText ? `\n${language === 'en' ? 'Idea' : '아이디어'}: ${input.freeText}` : '';
  const stepCount = input.duration ? COURSE_STEP_COUNT_BY_DURATION[input.duration] : undefined;
  const stepCountRule = stepCount
    ? (language === 'en' ? `\nAvailable time is limited — build the course with exactly ${stepCount} steps.` : `\n가능 시간이 제한적이니 코스를 정확히 ${stepCount}단계로 구성하세요.`)
    : '';
  if (language === 'en') {
    return `Build ONE (max 2) ordered date course from the real candidates below.
${block}${prefsHint(prefs, 'en')}${note}${stepCountRule}

Each place step MUST reference a candidate_id from the list. Pure-action steps (walk, movie) omit candidate_id.
${NO_FACT_RULE_EN}
Reply with JSON only:
{ "recommendations": [ { "title": "<=15 chars", "summary": "<=40 chars", "why_recommended": "<=50 chars", "tags": ["t1","t2"], "steps": [ { "candidate_id": "candidate_003", "label": "brunch", "desc": "<=20 chars" }, { "label": "river walk", "desc": "<=20 chars" } ] } ] }`;
  }
  return `아래 실제 후보들로 순서 있는 데이트 코스 1개(최대 2개)를 구성하세요.
${block}${prefsHint(prefs, 'ko')}${note}${stepCountRule}

장소 단계는 반드시 목록의 candidate_id를 참조하세요. 순수 행동 단계(산책·영화 등)는 candidate_id 없이 label/desc만 작성하세요.
${NO_FACT_RULE_KO}
반드시 아래 JSON으로만 답하세요:
{ "recommendations": [ { "title": "15자 이내", "summary": "40자 이내", "why_recommended": "50자 이내", "tags": ["태그1","태그2"], "steps": [ { "candidate_id": "candidate_003", "label": "브런치", "desc": "20자 이내" }, { "label": "한강 산책", "desc": "20자 이내" } ] } ] }`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest __tests__/recommendation.test.ts`
Expected: PASS

- [ ] **Step 5: `__tests__/recommendationSession.test.ts:11-12`의 fixture에서 `budget`/`budgetLevel` 제거**

```ts
const intent: PlanIntent = { purpose: 'meal', placeTypes: ['cafe'], atmosphere: [], duration: '2-3h', searchQueries: ['카페'], positiveSignals: [], negativeSignals: [] };
const input: FeelingInput = { energy: 'medium', distance: 'any', mood: 'comfortable', duration: '2-3h', avoid: [] };
```

- [ ] **Step 6: 관련 테스트 통과 확인**

Run: `npx jest __tests__/recommendationSession.test.ts`
Expected: PASS

- [ ] **Step 7: 타입체크**

Run: `npm run validate 2>&1 | grep -E "lib/recommendation.ts|lib/ai.ts|__tests__/recommendation"`
Expected: 출력 없음(단, `lib/ai.ts`가 아직 `input.budget`을 참조하는 곳이 있으면 다음 태스크에서 해소)

- [ ] **Step 8: 커밋**

```bash
git add lib/recommendation.ts __tests__/recommendation.test.ts __tests__/recommendationSession.test.ts
git commit -m "feat(recommendation): drop budget, add duration-based course step count, add feeling_select duration context"
```

---

### Task 6: `lib/ai.ts` 나머지 정리 — `resolveIntent` 호출부의 `budget` 제거

**Files:**
- Modify: `lib/ai.ts:365-382`

- [ ] **Step 1: `generateDateCards`의 `resolveIntent` 호출에서 `budget` 제거**

`lib/ai.ts:376-382`:

```ts
      const intent = resolveIntent({
        mode: intentMode,
        freeText: input.freeText,
        mood: input.mood,
        duration: input.duration,
      });
```

- [ ] **Step 2: 타입체크**

Run: `npm run validate 2>&1 | grep "lib/ai.ts"`
Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/ai.ts
git commit -m "fix(ai): drop budget from resolveIntent call site"
```

---

### Task 7: `components/ui.tsx` — `OptionCardPicker` value를 optional로

**Files:**
- Modify: `components/ui.tsx:199-209`

시간(duration) 선택을 옵셔널로 만들려면, 아무 옵션도 선택되지 않은 상태(`value`가 `undefined`)를 허용해야 한다. 이 컴포넌트는 `card/new.tsx`(시간 선택)에서도 재사용되므로 타입만 넓히고 동작은 그대로 유지한다(`selected = value === option.value`는 `value`가 `undefined`면 자연히 아무 옵션도 선택 안 된 것으로 보임).

- [ ] **Step 1: `value` prop 타입을 `string | undefined`로 변경**

`components/ui.tsx:199-209`:

```ts
export function OptionCardPicker({
  options,
  value,
  onChange,
  columns = 4,
}: {
  options: OptionCard[];
  value: string | undefined;
  onChange: (value: string) => void;
  columns?: number;
}) {
```

- [ ] **Step 2: 타입체크**

Run: `npm run validate 2>&1 | grep "components/ui.tsx"`
Expected: 출력 없음(기존 호출부들은 항상 `string`을 넘기므로 widening은 하위 호환)

- [ ] **Step 3: 커밋**

```bash
git add components/ui.tsx
git commit -m "feat(ui): allow OptionCardPicker value to be undefined (unselected state)"
```

---

### Task 8: `app/mode-flow/feeling.tsx` — 예산 UI 제거, 시간 옵셔널, 힌트 문구 추가

**Files:**
- Modify: `app/mode-flow/feeling.tsx`
- Modify: `locales/ko.json`, `locales/en.json`

이 화면은 RN 컴포넌트라 자동 테스트 하네스가 없다([2026-07-04-gps-location-design.md](../specs/2026-07-04-gps-location-design.md) 참고, 기존 관례) — 시뮬레이터에서 수동 확인한다.

- [ ] **Step 1: `locales/ko.json`에서 `modeFlow.option.budget`(L1060-1064), `modeFlow.feeling.budget`(L1084) 제거, 힌트 문구 키 추가**

`locales/ko.json:1060-1064` 삭제(그 앞뒤 키는 유지):

```json
      "duration": {
        "oneHour": "1시간",
        "twoThreeHours": "2~3시간",
        "halfDay": "반나절",
        "fullDay": "하루"
      },
```

(`"budget": { "low": "아끼기", "medium": "적당히", "high": "특별하게" },` 블록만 제거하고 나머지는 그대로.)

`locales/ko.json:1079-1087`(`modeFlow.feeling`)을 다음으로 교체:

```json
    "feeling": {
      "heading": "오늘 끌리는 느낌만\n알려주세요",
      "sub": "대충 말해도 괜찮아요. 분위기를 데이트 카드로 정리해드릴게요.",
      "placeholder": "예: 오늘은 조용히 대화하면서 분위기 있는 데가 좋아.",
      "freeTextHint": "일식, 삼겹살, 방탈출처럼 키워드 위주로 적으면 더 정확해요.",
      "mood": "분위기",
      "duration": "시간 (선택)",
      "generate": "데이트 후보 만들기"
    },
```

- [ ] **Step 2: `locales/en.json`도 같은 작업에서 함께 갱신**

`locales/en.json`의 동일 위치(`modeFlow.option.budget`, `modeFlow.feeling`)를 대응 영어로 동일하게 수정:

`locales/en.json:1060-1064`(`"budget": { "low": "Save money", "medium": "Moderate", "high": "Special" },` 블록) 삭제.

`locales/en.json:1079-1087`을 다음으로 교체:

```json
    "feeling": {
      "heading": "Just tell us the vibe\nyou want today",
      "sub": "A rough feeling is enough. We'll turn the mood into date cards.",
      "placeholder": "Ex: I want somewhere quiet with good conversation today.",
      "freeTextHint": "Keywords work best — try things like \"Japanese food\", \"BBQ\", \"escape room\".",
      "mood": "Mood",
      "duration": "Time (optional)",
      "generate": "Create date ideas"
    },
```

- [ ] **Step 3: `app/mode-flow/feeling.tsx` 수정**

`app/mode-flow/feeling.tsx` 전체를 다음으로 교체:

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { buildFeelingInput } from '../../lib/modeForm';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, Chip, LocationField, OptionCardPicker } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

const MOODS = [
  { v: 'comfortable', labelKey: 'modeFlow.option.mood.comfortable' },
  { v: 'fun', labelKey: 'modeFlow.option.mood.fun' },
  { v: 'romantic', labelKey: 'modeFlow.option.mood.romantic' },
  { v: 'quiet', labelKey: 'modeFlow.option.mood.quiet' },
  { v: 'new', labelKey: 'modeFlow.option.mood.new' },
];
const DURATIONS = [
  { value: '1h', labelKey: 'modeFlow.option.duration.oneHour' },
  { value: '2-3h', labelKey: 'modeFlow.option.duration.twoThreeHours' },
  { value: 'half_day', labelKey: 'modeFlow.option.duration.halfDay' },
  { value: 'full_day', labelKey: 'modeFlow.option.duration.fullDay' },
];

export default function FeelingScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [freeText, setFreeText] = useState('');
  const [mood, setMood] = useState('comfortable');
  const [duration, setDuration] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ x: string; y: string } | null>(null);

  function handleGenerate() {
    const input = buildFeelingInput({
      mood,
      freeText,
      location,
      duration,
      coords: coords ?? undefined,
    });
    router.replace({
      pathname: '/mode-flow/generating',
      params: { mode: 'feeling', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.body}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <BackBar />
          <View style={s.headerWrap}>
            <Text style={s.heading}>{t('modeFlow.feeling.heading')}</Text>
            <Text style={s.subText}>{t('modeFlow.feeling.sub')}</Text>
          </View>

          <View style={s.freeInputWrap}>
            <TextInput
              style={s.freeInput}
              placeholder={t('modeFlow.feeling.placeholder')}
              placeholderTextColor={C.textFaint}
              value={freeText}
              onChangeText={setFreeText}
              multiline
            />
          </View>
          <Text style={s.hint}>{t('modeFlow.feeling.freeTextHint')}</Text>

          <Text style={s.sectionLabel}>{t('modeFlow.feeling.mood')}</Text>
          <View style={s.chips}>
            {MOODS.map(m => (
              <Chip key={m.v} selected={mood === m.v} tone="pink" onPress={() => setMood(m.v)}>
                {t(m.labelKey)}
              </Chip>
            ))}
          </View>

          <Text style={s.sectionLabel}>{t('modeFlow.feeling.duration')}</Text>
          <OptionCardPicker
            options={DURATIONS.map((d) => ({ value: d.value, label: t(d.labelKey) }))}
            value={duration}
            onChange={setDuration}
          />

          <LocationField value={location} onChangeText={setLocation} coords={coords} onCoordsChange={setCoords} />

          <View style={s.footerSpacer} />
        </ScrollView>
        <View style={s.footer}>
          <BigButton onPress={handleGenerate}>{t('modeFlow.feeling.generate')}</BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  body: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  headerWrap: { marginTop: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  freeInputWrap: { backgroundColor: C.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, minHeight: 90, marginTop: 20 },
  freeInput: { fontSize: 13, color: C.text, lineHeight: 22 },
  hint: { fontSize: 12, color: C.textMuted, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footerSpacer: { height: 120 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 16, backgroundColor: C.bg },
});
```

- [ ] **Step 4: 타입체크**

Run: `npm run validate 2>&1 | grep -E "feeling.tsx|locales"`
Expected: 출력 없음

- [ ] **Step 5: 커밋**

```bash
git add app/mode-flow/feeling.tsx locales/ko.json locales/en.json
git commit -m "feat(feeling): remove budget question, make duration optional, add keyword hint"
```

---

### Task 9: `app/mode-flow/course.tsx` — 예산 UI 제거, 시간 옵셔널, 힌트 문구 갱신

**Files:**
- Modify: `app/mode-flow/course.tsx`
- Modify: `locales/ko.json`, `locales/en.json`

- [ ] **Step 1: `locales/ko.json:503-517`(`course.budgetLabel`/`budgetOptions`) 삭제, `ideaHint`/`durationLabel` 갱신**

`locales/ko.json:497-535`(`course` 섹션)을 다음으로 교체:

```json
  "course": {
    "modeLabel": "코스로 정리해줘",
    "title": "어떤 데이트를\n하고 싶어?",
    "ideaLabel": "하고 싶은 데이트 아이디어",
    "ideaPlaceholder": "예: 전시회 가고 싶어, 한강 피크닉 어때?",
    "ideaHint": "일식, 삼겹살, 방탈출처럼 키워드 위주로 적으면 더 정확해요.",
    "durationLabel": "시간은 얼마나? (선택)",
    "durationOptions": [
      {
        "label": "2~3시간",
        "value": "2-3h"
      },
      {
        "label": "반나절",
        "value": "half_day"
      },
      {
        "label": "하루종일",
        "value": "full_day"
      }
    ],
    "generateButton": "코스 만들기",
    "back": "←",
    "errorEmpty": "하고 싶은 아이디어를 입력해주세요."
  },
```

- [ ] **Step 2: `locales/en.json`도 같은 작업에서 함께 갱신**

`locales/en.json:497-536`(`course` 섹션)을 다음으로 교체(기존 `modeLabel`/`title`/`ideaLabel`/`ideaPlaceholder`/`generateButton`/`errorEmpty` 원문은 그대로 유지, `budgetLabel`/`budgetOptions` 삭제, `ideaHint`를 키워드 힌트로, `durationLabel`에 "(optional)" 추가):

```json
  "course": {
    "modeLabel": "Make it a plan",
    "title": "What kind of date\ndo you have in mind?",
    "ideaLabel": "Your date idea",
    "ideaPlaceholder": "e.g. I want to visit an exhibition, how about a picnic?",
    "ideaHint": "Keywords work best — try things like \"Japanese food\", \"BBQ\", \"escape room\".",
    "durationLabel": "How much time do you have? (optional)",
    "durationOptions": [
      {
        "label": "2-3 hours",
        "value": "2-3h"
      },
      {
        "label": "Half day",
        "value": "half_day"
      },
      {
        "label": "All day",
        "value": "full_day"
      }
    ],
    "generateButton": "Build a course",
    "back": "←",
    "errorEmpty": "Please enter a date idea first."
  },
```

- [ ] **Step 3: `app/mode-flow/course.tsx` 수정**

전체를 다음으로 교체:

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { buildCourseInput } from '../../lib/modeForm';
import { useI18n } from '../../lib/i18n';
import { C } from '../../constants/colors';
import { BackBar, BigButton, LocationField, OptionCardPicker } from '../../components/ui';

export default function CourseScreen() {
  const router = useRouter();
  const { strings: s } = useI18n();
  const c = s.course;

  const [idea, setIdea] = useState('');
  const [duration, setDuration] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ x: string; y: string } | null>(null);

  function handleGenerate() {
    if (!idea.trim()) {
      Alert.alert(c.errorEmpty);
      return;
    }
    const input = buildCourseInput({ idea, duration, location, coords: coords ?? undefined });
    router.replace({
      pathname: '/mode-flow/generating',
      params: { mode: 'make_course', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={s2.safe}>
      <BackBar />
      <ScrollView contentContainerStyle={s2.content} keyboardShouldPersistTaps="handled">
        <Text style={s2.modeLabel}>{c.modeLabel}</Text>
        <Text style={s2.title}>{c.title}</Text>

        <Text style={s2.sectionLabel}>{c.ideaLabel}</Text>
        <TextInput
          style={s2.ideaInput}
          placeholder={c.ideaPlaceholder}
          placeholderTextColor={C.textFaint}
          value={idea}
          onChangeText={setIdea}
          multiline
          maxLength={200}
        />
        <Text style={s2.hint}>{c.ideaHint}</Text>

        <Text style={s2.sectionLabel}>{c.durationLabel}</Text>
        <View style={s2.durationBlock}>
          <OptionCardPicker
            options={c.durationOptions.map((opt: { label: string; value: string }) => (
              { value: opt.value, label: opt.label }
            ))}
            value={duration}
            onChange={setDuration}
          />
        </View>

        <LocationField value={location} onChangeText={setLocation} coords={coords} onCoordsChange={setCoords} />

        <View style={s2.bottomSpacer} />
        <BigButton onPress={handleGenerate} variant={idea.trim() ? 'primary' : 'disabled'}>{c.generateButton}</BigButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const s2 = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 60 },
  bottomSpacer: { height: 24 },
  modeLabel: { fontSize: 13, color: C.pinkDeep, fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32, color: C.text, marginBottom: 28 },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 12 },
  ideaInput: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 16,
    fontSize: 15, color: C.text, minHeight: 96, textAlignVertical: 'top',
    marginBottom: 8, backgroundColor: C.white,
  },
  hint: { fontSize: 13, color: C.textMuted, marginBottom: 28 },
  durationBlock: { marginBottom: 28 },
});
```

(`TriOptionRow` import 및 `budgetBlock` 스타일 삭제.)

- [ ] **Step 4: 타입체크**

Run: `npm run validate 2>&1 | grep -E "course.tsx|locales"`
Expected: 출력 없음

- [ ] **Step 5: 커밋**

```bash
git add app/mode-flow/course.tsx locales/ko.json locales/en.json
git commit -m "feat(course): remove budget question, make duration optional, update idea hint to keyword guidance"
```

---

### Task 10: `app/(tabs)/candidates.tsx` — 하드코딩 budget 제거, budget_adjust 조건 라벨 제거

**Files:**
- Modify: `app/(tabs)/candidates.tsx`
- Modify: `locales/ko.json`, `locales/en.json`

- [ ] **Step 1: `locales/ko.json:655`(`candidates.conditionLabels.budget_adjust`) 삭제**

`locales/ko.json:651-656`을 다음으로 교체:

```json
    "conditionLabels": {
      "change_place": "📍 장소만 바꾸면",
      "closer": "🚶 가까우면",
      "indoor": "🏠 실내면"
    }
```

`locales/en.json:651-656`도 동일하게:

```json
    "conditionLabels": {
      "change_place": "📍 If we change the place",
      "closer": "🚶 If it's closer",
      "indoor": "🏠 If it's indoors"
    }
```

- [ ] **Step 2: `app/(tabs)/candidates.tsx`에서 `budget_adjust` 관련 코드 제거**

`ConditionTag` 타입(L19)에서 `'budget_adjust'` 제거:

```ts
type ConditionTag = 'change_place' | 'closer' | 'indoor';
```

L43(`budget_adjust: t('candidates.conditionLabels.budget_adjust'),` 부근 — conditionLabels 매핑 객체)에서 `budget_adjust` 항목 삭제.

- [ ] **Step 3: `handleConfirm`(L212-217)에서 `budget: 'medium',` 제거**

```ts
      const input: FeelingInput = {
        energy: 'high',
        distance: 'far',
        mood: 'romantic',
        duration: 'full_day',
        avoid: [],
        freeText: bucketItem.item,
      };
```

- [ ] **Step 4: 타입체크**

Run: `npm run validate 2>&1 | grep -E "candidates.tsx|locales"`
Expected: 출력 없음

- [ ] **Step 5: 커밋**

```bash
git add "app/(tabs)/candidates.tsx" locales/ko.json locales/en.json
git commit -m "fix(candidates): drop hardcoded budget, remove budget_adjust condition label"
```

---

### Task 11: `app/card/[id].tsx` — budget_adjust 조건태그 제거, 시간/예산 조건부 표시

**Files:**
- Modify: `app/card/[id].tsx`
- Modify: `locales/ko.json`, `locales/en.json`

- [ ] **Step 1: `locales/ko.json:846-849`(`card.conditionTags.budget_adjust`) 삭제**

`locales/ko.json:833-850`을 다음으로 교체:

```json
    "conditionTags": {
      "change_place": {
        "label": "장소만 바꾸면",
        "freeText": "비슷한 분위기, 더 가까운 장소로 바꿔서 추천해줘"
      },
      "closer": {
        "label": "가까우면",
        "freeText": "더 가까운 거리, 이동 10분 이내로 바꿔서 추천해줘"
      },
      "indoor": {
        "label": "실내면",
        "freeText": "실내 공간으로 바꿔서 추천해줘"
      }
    },
```

`locales/en.json:833-850`도 동일하게 `budget_adjust` 블록 삭제.

- [ ] **Step 2: `app/card/[id].tsx`에서 `budget_adjust` 관련 코드 제거**

`ConditionTag` 타입(L38)에서 `'budget_adjust'` 제거:

```ts
type ConditionTag = 'change_place' | 'closer' | 'indoor';
```

`CONDITION_TAGS` 배열(L52-57)에서 `budget_adjust` 항목(L56) 삭제:

```ts
  const CONDITION_TAGS: { tag: ConditionTag; label: string; emoji: string; freeText: string }[] = [
    { tag: 'change_place', label: t('card.conditionTags.change_place.label'), emoji: '📍', freeText: t('card.conditionTags.change_place.freeText') },
    { tag: 'closer', label: t('card.conditionTags.closer.label'), emoji: '🚶', freeText: t('card.conditionTags.closer.freeText') },
    { tag: 'indoor', label: t('card.conditionTags.indoor.label'), emoji: '🏠', freeText: t('card.conditionTags.indoor.freeText') },
  ];
```

- [ ] **Step 3: `handleGenerateAlt`(L144-163)에서 budget 관련 로직 제거**

`app/card/[id].tsx:151-163`을 다음으로 교체:

```ts
      const base: FeelingInput = card.input_json && typeof card.input_json === 'object'
        ? {
            energy: 'medium', distance: 'any', mood: 'comfortable', duration: '2-3h', avoid: [],
            ...card.input_json,
          }
        : { energy: 'medium', distance: 'any', mood: 'comfortable', duration: '2-3h', avoid: [] };
      const input: FeelingInput = {
        ...base,
        distance: condTag === 'closer' ? 'near' : base.distance,
        avoid: condTag === 'indoor' ? [...new Set([...(base.avoid ?? []), 'outdoor'])] : base.avoid,
        freeText: `${t('card.regeneratePromptPrefix', { title: card.title })}${condInfo?.freeText ?? t('card.regenerateFallbackText')}`,
      };
```

- [ ] **Step 4: 메타 표시(L234-244)를 조건부 렌더링으로 변경**

`app/card/[id].tsx:234-244`를 다음으로 교체:

```tsx
          {(!!card.estimated_time || !!card.estimated_budget) && (
            <View style={styles.metaRow}>
              {!!card.estimated_time && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>⏱</Text>
                  <Text style={styles.metaText}>{card.estimated_time}</Text>
                </View>
              )}
              {!!card.estimated_time && !!card.estimated_budget && <View style={styles.metaDivider} />}
              {!!card.estimated_budget && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>💰</Text>
                  <Text style={styles.metaText}>{card.estimated_budget}</Text>
                </View>
              )}
            </View>
          )}
```

- [ ] **Step 5: 타입체크**

Run: `npm run validate 2>&1 | grep -E "card/\[id\].tsx|locales"`
Expected: 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add "app/card/[id].tsx" locales/ko.json locales/en.json
git commit -m "fix(card-detail): remove budget_adjust condition tag, conditionally render time/budget meta"
```

---

### Task 12: `app/card/confirm.tsx` — 시간/예산 조건부 표시 (2곳)

**Files:**
- Modify: `app/card/confirm.tsx:172-176`, `app/card/confirm.tsx:231-235`

두 지점 모두 동일한 패턴(`⏱ {time}` · `💰 {budget}` 인라인 텍스트 + 가운데점 구분자)이라 같은 방식으로 고친다.

- [ ] **Step 1: `app/card/confirm.tsx:172-176` 수정**

```tsx
              <View style={styles.metaRow}>
                {!!card.estimated_time && <Text style={styles.metaText}>⏱ {card.estimated_time}</Text>}
                {!!card.estimated_time && !!card.estimated_budget && <Text style={styles.metaSep}>·</Text>}
                {!!card.estimated_budget && <Text style={styles.metaText}>💰 {card.estimated_budget}</Text>}
              </View>
```

- [ ] **Step 2: `app/card/confirm.tsx:231-235` 동일하게 수정**

```tsx
              <View style={styles.metaRow}>
                {!!card.estimated_time && <Text style={styles.metaText}>⏱ {card.estimated_time}</Text>}
                {!!card.estimated_time && !!card.estimated_budget && <Text style={styles.metaSep}>·</Text>}
                {!!card.estimated_budget && <Text style={styles.metaText}>💰 {card.estimated_budget}</Text>}
              </View>
```

- [ ] **Step 3: 타입체크**

Run: `npm run validate 2>&1 | grep "confirm.tsx"`
Expected: 출력 없음

- [ ] **Step 4: 커밋**

```bash
git add app/card/confirm.tsx
git commit -m "fix(card-confirm): conditionally render time/budget meta"
```

---

### Task 13: `app/mode-flow/result.tsx` — 시간/예산 조건부 표시 (2곳)

**Files:**
- Modify: `app/mode-flow/result.tsx:161-177`(featured 카드 3열 그리드), `app/mode-flow/result.tsx:235-243`(서브 카드)

- [ ] **Step 1: featured 카드 `metaGrid`(L161-177) 수정 — budget 박스만 조건부로**

```tsx
                <View style={s2.metaGrid}>
                  {!!card.estimated_time && (
                    <View style={s2.metaBox}>
                      <Clock size={14} color={C.creamFg} />
                      <Text style={s2.metaLabel}>{t('modeFlow.result.time')}</Text>
                      <Text style={s2.metaValue}>{card.estimated_time}</Text>
                    </View>
                  )}
                  {!!card.estimated_budget && (
                    <View style={s2.metaBox}>
                      <Wallet size={14} color={C.creamFg} />
                      <Text style={s2.metaLabel}>{t('modeFlow.result.budget')}</Text>
                      <Text style={s2.metaValue}>{card.estimated_budget}</Text>
                    </View>
                  )}
                  <View style={s2.metaBox}>
                    <MapPin size={14} color={C.creamFg} />
                    <Text style={s2.metaLabel}>{t('modeFlow.result.movement')}</Text>
                    <Text style={s2.metaValue}>{t('modeFlow.result.walk')}</Text>
                  </View>
                </View>
```

- [ ] **Step 2: 서브 카드 메타(L235-243) 수정**

```tsx
                  <View style={s2.subMetaRow}>
                    {!!card.estimated_time && (
                      <View style={s2.subMetaItem}>
                        <Clock size={11} color={C.textMuted} />
                        <Text style={s2.subMeta}>{card.estimated_time}</Text>
                      </View>
                    )}
                    {!!card.estimated_budget && (
                      <View style={s2.subMetaItem}>
                        <Wallet size={11} color={C.textMuted} />
                        <Text style={s2.subMeta}>{card.estimated_budget}</Text>
                      </View>
                    )}
```

(이 블록 바로 뒤에 이어지는 `{!!card.place_name && (...)}` 블록은 그대로 둔다 — 위 두 조건부 블록만 교체.)

- [ ] **Step 3: 타입체크**

Run: `npm run validate 2>&1 | grep "result.tsx"`
Expected: 출력 없음

- [ ] **Step 4: 커밋**

```bash
git add app/mode-flow/result.tsx
git commit -m "fix(mode-flow-result): conditionally render time/budget meta"
```

---

### Task 14: `app/mode-flow/course-result.tsx` — 시간/예산 조건부 표시

**Files:**
- Modify: `app/mode-flow/course-result.tsx:210-213`

- [ ] **Step 1: `metaRow`(L210-213) 수정**

```tsx
              <View style={s.metaRow}>
                {!!card.estimated_time && <View style={s.metaItem}><Clock size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_time}</Text></View>}
                {!!card.estimated_budget && <View style={s.metaItem}><Wallet size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_budget}</Text></View>}
              </View>
```

- [ ] **Step 2: 타입체크**

Run: `npm run validate 2>&1 | grep "course-result.tsx"`
Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add app/mode-flow/course-result.tsx
git commit -m "fix(course-result): conditionally render time/budget meta"
```

---

### Task 15: 전체 검증 + 실제 앱 수동 테스트

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 테스트 스위트**

Run: `npm test`
Expected: 전체 테스트 스위트 통과(기존 153개 + 이번에 추가/수정된 테스트 모두 포함)

- [ ] **Step 2: 전체 타입체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 3: 실제 앱에서 수동 확인**

Metro가 이미 떠 있으면 시뮬레이터에서 앱을 리로드(Cmd+R). 다음을 확인:
1. "느낌만 말할게" 화면 — 예산 질문이 사라졌고, 시간은 아무것도 선택 안 해도 "데이트 후보 만들기" 버튼이 활성화되는지.
2. "코스로 정리해줘" 화면 — 동일하게 예산 질문 없음, 시간 선택 없이도 진행 가능한지, 아이디어 입력창 아래 힌트 문구("일식, 삼겹살, 방탈출처럼...")가 보이는지.
3. "영화보고 싶어"로 "느낌만 말할게" 실행 → 결과 카드가 영화관 관련 장소를 포함하는지(카카오에 실제 영화관이 있는 지역이어야 확인 가능 — 없으면 최소한 액티비티/방탈출로 안 새는지만 확인).
4. 결과 카드에 💰 예산 아이콘이 더 이상 안 보이는지, ⏱ 시간은 선택했을 때만 보이는지.
5. 카드 상세 화면의 반응 옵션에 "💰 예산 조정되면"이 더 이상 없는지(📍🚶🏠 3개만).

- [ ] **Step 4: DB에서 새 로그의 duration 반영 확인**

`mcp__plugin_supabase_supabase__execute_sql` (`project_id: wqjguifsmtblgrhdfnji`):

```sql
select action, prompt_version, prompt
from public.ai_recommendation_logs
order by created_at desc
limit 3;
```

Expected: 방금 생성한 호출의 `prompt` 텍스트에 "예산" 문구가 없고(course_select라면), duration을 선택했을 경우 "가능 시간" 또는 "N단계로 구성하세요" 지침이 포함되어 있는지 확인.

---

## 완료 후 리뷰

사용자 지시에 따라 태스크별 subagent 리뷰 없이 Task 1~15를 끝까지 진행한 뒤, 마지막에 한 번 `/code-review`(또는 동등한 코드 리뷰 subagent)로 전체 변경사항을 리뷰한다.
