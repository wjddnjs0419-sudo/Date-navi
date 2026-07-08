// Phase 1 — Intent Resolution + Query Expansion (순수 로직).
// Mode + freeText + UI Selection(mood/budget/duration)을 종합해 "추천 검색 계획"(PlanIntent)을 만든다.
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
  budgetLevel: 'low' | 'medium' | 'high';
  duration: string;
  searchQueries: string[];
  positiveSignals: string[];
  negativeSignals: string[];
};

export type ResolveIntentArgs = {
  mode: 'feeling' | 'make_course';
  freeText?: string;
  mood?: string;
  budget?: string;
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
    purpose: 'activity',
    pattern: /액티비티|방탈출|보드게임|클라이밍|VR|노래방|볼링|피크닉|영화/,
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
    pattern: /맛집|음식점|식당|밥집|브런치|저녁식사|점심|디너|밥/,
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
  const { mode, freeText, mood, budget, duration } = args;
  const text = freeText?.trim() ?? '';
  const matches = text ? matchRules(text) : [];

  const budgetLevel: PlanIntent['budgetLevel'] =
    budget === 'low' || budget === 'high' ? budget : 'medium';
  const atmosphere: Atmosphere[] = mood && MOOD_ATMOSPHERE[mood] ? [MOOD_ATMOSPHERE[mood]] : [];

  if (mode === 'make_course') {
    // 백본은 feeling과 공유하되, 코스는 다카테고리 후보를 확보해야 동선이 나온다.
    const placeTypes = uniq([...matches.flatMap(m => m.placeTypes), ...COURSE_BASE_PLACE_TYPES]);
    const searchQueries = uniq([...matches.flatMap(m => m.searchQueries), ...COURSE_BASE_QUERIES]);
    const positiveSignals = uniq(matches.flatMap(m => m.positiveSignals));
    const negativeSignals = uniq(matches.flatMap(m => m.negativeSignals));
    const purpose: Purpose = matches[0]?.purpose ?? 'general_date';
    return { purpose, placeTypes, atmosphere, budgetLevel, duration: duration ?? '2-3h', searchQueries, positiveSignals, negativeSignals };
  }

  // feeling: 첫 매치를 주 purpose로 채택. 없으면 general_date + 폭넓은 후보.
  if (matches.length === 0) {
    return {
      purpose: 'general_date',
      placeTypes: [...GENERAL_PLACE_TYPES],
      atmosphere,
      budgetLevel,
      duration: duration ?? '2-3h',
      searchQueries: [...GENERAL_QUERIES],
      positiveSignals: [],
      negativeSignals: [],
    };
  }

  const primary = matches[0];
  return {
    purpose: primary.purpose,
    placeTypes: uniq(primary.placeTypes),
    atmosphere,
    budgetLevel,
    duration: duration ?? '2-3h',
    searchQueries: uniq(primary.searchQueries),
    positiveSignals: uniq(primary.positiveSignals),
    negativeSignals: uniq(primary.negativeSignals),
  };
}
