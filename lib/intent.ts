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
  primaryQuery?: string;
  normalizedQuery?: string;
  singleAnchorQuery?: string;
  courseAnchors?: string[];
  allowRepeatedAnchor?: boolean;
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

const FILLER_QUERY_PATTERNS: RegExp[] = [
  /추천(?:해줘|해주세요|좀)?/g,
  /데이트/g,
  /오늘|내일|이번\s*주말|주말/g,
  /근처|주변|가까운/g,
  /가고\s*싶(?:어|다)?/g,
  /먹고\s*싶(?:어|다)?/g,
  /마시고\s*싶(?:어|다)?/g,
  /하고\s*싶(?:어|다)?/g,
  /보고\s*싶(?:어|다)?/g,
  /(먹고|마시고|보고|하고)$/g,
  /갈\s*만한\s*곳/g,
  /할\s*만한\s*곳/g,
  /뭐\s*할지\s*모르겠(?:음|어|다)?/g,
  /머\s*할지\s*모르겠(?:음|어|다)?/g,
  /뭐\s*하지/g,
  /머\s*하지/g,
  /어디\s*갈까/g,
  /좀/g,
];

export function normalizeFreeTextQuery(freeText?: string): string | undefined {
  let out = freeText
    ?.replace(/[?!.,~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!out) return undefined;
  for (const pattern of FILLER_QUERY_PATTERNS) out = out.replace(pattern, ' ');
  out = out
    .replace(/\s+/g, ' ')
    .replace(/^(에|에서)\s+/, '')
    .replace(/\s+(에|에서)$/, '')
    .trim()
    .replace(/\s*(을|를|은|는|이|가)$/, '')
    .trim();
  return out.length >= 2 ? out : undefined;
}

const REPEAT_ANCHOR_PATTERN = /투어|탐방|여러\s*군데|여러곳|여러\s*곳|2차|이차|호핑|hopping/i;
const COMPOSITE_COURSE_PATTERN = /갔다가|갔다\s*가|들렀다가|들렀다\s*가|먹고\s+산책|보고\s+산책|하고\s+산책|그리고|그다음|다음에|후에|이후|->|→|\+/;

function hasCompositeCourseIntent(text: string, matches: IntentRule[]): boolean {
  return matches.length >= 2 || COMPOSITE_COURSE_PATTERN.test(text);
}

export function extractCourseAnchors(freeText?: string): string[] {
  const text = freeText?.trim();
  if (!text) return [];
  const withBoundaries = text
    .replace(/(갔다가|갔다\s*가|들렀다가|들렀다\s*가|이후에|이후|그다음|다음에|그리고|->|→|\+)/g, '|')
    .replace(/(먹고|마시고|보고|하고)\s+/g, '$1|');
  return uniq(
    withBoundaries
      .split('|')
      .map(part => normalizeFreeTextQuery(part))
      .filter((q): q is string => !!q),
  );
}

function queryPrelude(text: string): {
  primaryQuery?: string;
  normalizedQuery?: string;
  singleAnchorQuery?: string;
  allowRepeatedAnchor: boolean;
} {
  const primaryQuery = text || undefined;
  const normalizedQuery = normalizeFreeTextQuery(text);
  const allowRepeatedAnchor = REPEAT_ANCHOR_PATTERN.test(text);
  return { primaryQuery, normalizedQuery, allowRepeatedAnchor };
}

export function resolveIntent(args: ResolveIntentArgs): PlanIntent {
  const { mode, freeText, mood, duration } = args;
  const text = freeText?.trim() ?? '';
  const matches = text ? matchRules(text) : [];
  // 하드코딩 규칙에 없는 키워드("일식", "이자카야", "브라질리언 바베큐" 등)도 카카오가
  // 직접 풀텍스트로 찾을 수 있도록, freeText 원문과 cleaned query를 항상 검색어 앞에 둔다.
  const prelude = queryPrelude(text);
  const freeTextQueries = [prelude.primaryQuery, prelude.normalizedQuery].filter((q): q is string => !!q);

  const atmosphere: Atmosphere[] = mood && MOOD_ATMOSPHERE[mood] ? [MOOD_ATMOSPHERE[mood]] : [];

  if (mode === 'make_course') {
    // 백본은 feeling과 공유하되, 코스는 다카테고리 후보를 확보해야 동선이 나온다.
    const placeTypes = uniq([...matches.flatMap(m => m.placeTypes), ...COURSE_BASE_PLACE_TYPES]);
    // freeText 원문을 맨 앞에 둔다 — 다운스트림(place-search)이 검색어를 8개로 자르므로,
    // 여러 규칙이 매칭돼 검색어가 많아져도 폴백 검색어가 잘려나가지 않게 한다.
    const positiveSignals = uniq(matches.flatMap(m => m.positiveSignals));
    const negativeSignals = uniq(matches.flatMap(m => m.negativeSignals));
    const purpose: Purpose = matches[0]?.purpose ?? 'general_date';
    const courseAnchors = extractCourseAnchors(text);
    const isSingleAnchor = !!prelude.normalizedQuery && courseAnchors.length <= 1 && !prelude.allowRepeatedAnchor && !hasCompositeCourseIntent(text, matches);
    return {
      purpose, placeTypes, atmosphere, duration,
      searchQueries: uniq([...freeTextQueries, ...courseAnchors, ...matches.flatMap(m => m.searchQueries), ...COURSE_BASE_QUERIES]),
      primaryQuery: prelude.primaryQuery,
      normalizedQuery: prelude.normalizedQuery,
      singleAnchorQuery: isSingleAnchor ? prelude.normalizedQuery : undefined,
      courseAnchors: courseAnchors.length >= 2 ? courseAnchors : undefined,
      allowRepeatedAnchor: prelude.allowRepeatedAnchor,
      positiveSignals,
      negativeSignals,
    };
  }

  // feeling: 첫 매치를 주 purpose로 채택. 없으면 general_date + 폭넓은 후보.
  if (matches.length === 0) {
    return {
      purpose: 'general_date',
      placeTypes: [...GENERAL_PLACE_TYPES],
      atmosphere,
      duration,
      searchQueries: uniq([...freeTextQueries, ...GENERAL_QUERIES]),
      primaryQuery: prelude.primaryQuery,
      normalizedQuery: prelude.normalizedQuery,
      allowRepeatedAnchor: prelude.allowRepeatedAnchor,
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
    searchQueries: uniq([...freeTextQueries, ...primary.searchQueries]),
    primaryQuery: prelude.primaryQuery,
    normalizedQuery: prelude.normalizedQuery,
    allowRepeatedAnchor: prelude.allowRepeatedAnchor,
    positiveSignals: uniq(primary.positiveSignals),
    negativeSignals: uniq(primary.negativeSignals),
  };
}
