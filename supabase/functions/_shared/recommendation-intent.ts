import type {
  ParsedPreferenceInput,
  RecommendationRequest,
} from '../../../shared/recommendation/contracts.ts';

export const SERVER_COURSE_CATEGORIES = [
  'meal',
  'cafe',
  'drinks',
  'activity',
  'culture',
  'walk',
] as const;

type ServerCourseCategory = (typeof SERVER_COURSE_CATEGORIES)[number];

const CATEGORY_TERMS: Record<ServerCourseCategory, RegExp> = {
  meal: /(?:식사|밥|음식|맛집|meals?|restaurants?|food)/i,
  cafe: /(?:카페|커피|cafes?|coffee shops?)/i,
  drinks: /(?:술집|술|바|bars?|drinks?|drinking)/i,
  activity: /(?:활동|액티비티|체험|activities|activity|experiences?)/i,
  culture: /(?:문화|전시|미술관|박물관|culture|exhibitions?|museums?|galleries)/i,
  walk: /(?:걷기|걷는 것|산책|walking|walks?)/i,
};

const CATEGORY_LOCAL_EXCLUSIONS: Record<ServerCourseCategory, RegExp[]> = {
  meal: [
    /(?:식사|밥|음식|맛집)(?:은|는|을|를|이|가|도)?\s*(?:빼|제외|말고|싫)/i,
    /(?:avoid|no)\s+(?:meals?|restaurants?|food)\b/i,
  ],
  cafe: [
    /(?:카페|커피)(?:는|를|가|도)?\s*(?:빼|제외|말고|싫)/i,
    /(?:avoid|no)\s+(?:cafes?|coffee shops?)\b/i,
  ],
  drinks: [
    /(?:술집|술|바)(?:은|는|를|가|도)?\s*(?:빼|제외|말고|싫)/i,
    /(?:avoid|no)\s+(?:bars?|drinks?|drinking)\b/i,
  ],
  activity: [
    /(?:활동|액티비티|체험)(?:은|는|을|를|이|가|도)?\s*(?:빼|제외|말고|싫)/i,
    /(?:avoid|no)\s+(?:activities|activity|experiences?)\b/i,
  ],
  culture: [
    /(?:문화|전시|미술관|박물관)(?:은|는|을|를|이|가|도)?\s*(?:빼|제외|말고|싫)/i,
    /(?:avoid|no)\s+(?:culture|exhibitions?|museums?|galleries)\b/i,
  ],
  walk: [
    /(?:걷기|걷는 것|산책)(?:은|는|을|를|이|가|도)?\s*(?:빼|제외|말고|싫)/i,
    /(?:avoid|no)\s+(?:walking|walks?)\b/i,
  ],
};

function parseExcludedCategories(text: string): ServerCourseCategory[] {
  const excluded = new Set<ServerCourseCategory>();
  for (const category of SERVER_COURSE_CATEGORIES) {
    if (CATEGORY_LOCAL_EXCLUSIONS[category].some((pattern) => pattern.test(text))) excluded.add(category);
  }

  const englishClauses = text.matchAll(
    /\b(?:avoid|no)\b\s+([^.!?;]*?)(?=\b(?:but|however|except|include|keep)\b|[.!?;]|$)/gi,
  );
  for (const match of englishClauses) {
    const clause = match[1];
    for (const category of SERVER_COURSE_CATEGORIES) {
      if (CATEGORY_TERMS[category].test(clause)) excluded.add(category);
    }
  }

  const koreanClauses = text.matchAll(
    /(?:^|[.!?;])([^.!?;]{0,160}?)(?:모두|전부)?\s*(?:빼|제외)/gi,
  );
  for (const match of koreanClauses) {
    const captured = match[1];
    const inclusionBoundary = /\S+(?:고|지만)(?=\s|$)|대신/gi;
    let scopeStart = 0;
    for (const boundary of captured.matchAll(inclusionBoundary)) {
      const boundaryEnd = (boundary.index ?? 0) + boundary[0].length;
      const nominalBeforeHago = boundary[0].endsWith('하고') ? boundary[0].slice(0, -2) : '';
      const isCategoryTerm = (value: string) => SERVER_COURSE_CATEGORIES.some((category) => (
        CATEGORY_TERMS[category].test(value)
      ));
      const categoryListConjunction = Boolean(nominalBeforeHago)
        && isCategoryTerm(nominalBeforeHago)
        && isCategoryTerm(captured.slice(boundaryEnd));
      if (!categoryListConjunction) scopeStart = boundaryEnd;
    }
    const clause = captured.slice(scopeStart);
    for (const category of SERVER_COURSE_CATEGORIES) {
      if (CATEGORY_TERMS[category].test(clause)) excluded.add(category);
    }
  }
  return SERVER_COURSE_CATEGORIES.filter((category) => excluded.has(category));
}

const QUIET_POSITIVE = [
  /조용(?:한|하면|하고|하게|히)/i,
  /\b(?:quiet|peaceful)\b/i,
];
const QUIET_NEGATIVE = [
  /조용(?:한|하게)?(?:\s*곳)?(?:은|는|을|를)?\s*(?:싫|원하지|필요\s*없|중요하지)/i,
  /조용함(?:은|이|도)?\s*(?:필요\s*없|중요하지|싫)/i,
  /\b(?:avoid|no|not)\s+quiet\b/i,
  /\b(?:do not|don't|dont)\s+(?:want|need|prefer)\s+(?:a\s+)?quiet\b/i,
  /\bquiet(?:ness|\s+places?)?\s+(?:is|are)\s+not\s+(?:needed|important|preferred|a\s+priority)\b/i,
];
const PHOTO_POSITIVE = [
  /사진\s*(?:찍기|찍고|찍을|잘\s*나오|명소|스팟)/i,
  /\b(?:photo[- ]friendly|good for photos?|take photos?)\b/i,
];
const PHOTO_NEGATIVE = [
  /사진(?:은|이|을|는|도)?\s*(?:중요하지|필요\s*없|싫|원하지|안\s*찍)/i,
  /사진(?:은|이|을|는|도)?\s*찍(?:고|기)?\s*싶지\s*않/i,
  /사진(?:은|이|을|는|도)?\s*찍(?:기|는\s*(?:건|것(?:은|이)?))\s*싫/i,
  /\bno\s+photos?\b/i,
  /\b(?:do not|don't|dont)\s+(?:want|need|care about)\s+photos?\b/i,
  /\b(?:do not|don't|dont)\s+want\s+to\s+take\s+(?:a\s+)?photos?\b/i,
  /\bphotos?\s+(?:is|are)\s+not\s+(?:needed|important|preferred|a\s+priority)\b/i,
];
const INDOOR_POSITIVE = [
  /실내\s*(?:에서|로|만|장소|공간|데이트)/i,
  /\b(?:indoor|indoors)\b/i,
];
const INDOOR_NEGATIVE = [
  /실내(?:는|가|를|도)?\s*(?:싫|제외|원하지|필요\s*없|중요하지|말고)/i,
  /실내\s*(?:장소|공간)(?:은|는|이|가|을|를|도)?\s*원하지\s*않/i,
  /실내\s*말고/i,
  /\b(?:avoid|no|not)\s+indoor\b/i,
  /\b(?:do not|don't|dont)\s+(?:want|need|prefer)\s+indoor\b/i,
  /\b(?:do not|don't|dont)\s+want\s+(?:an?\s+)?indoor(?:\s+(?:place|venue|spot|space))?\b/i,
  /\bindoor(?:\s+places?)?\s+(?:is|are)\s+not\s+(?:needed|important|preferred|a\s+priority)\b/i,
];

function explicitBoolean(
  text: string,
  positives: readonly RegExp[],
  negatives: readonly RegExp[],
): boolean | undefined {
  type MatchRange = { start: number; end: number };
  const ranges = (patterns: readonly RegExp[]): MatchRange[] => patterns.flatMap((pattern) => {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    return [...text.matchAll(new RegExp(pattern.source, flags))].map((match) => ({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }));
  });
  const positiveRanges = ranges(positives);
  const negativeRanges = ranges(negatives);
  if (positiveRanges.length === 0) return negativeRanges.length > 0 ? false : undefined;

  const locallyNegated = (positive: MatchRange): boolean => {
    const prefix = text.slice(Math.max(0, positive.start - 20), positive.start);
    const suffix = text.slice(positive.end, Math.min(text.length, positive.end + 36));
    const genericEnglishPrefix = /\b(?:not|no|avoid)\s+(?:an?\s+)?$/i.test(prefix);
    const genericKoreanSuffix = /^\s*(?:(?:은|는|이|가|을|를|도|건|것은|기는)\s*)?(?:싫|원하지|필요\s*없|중요하지|말고|제외|않)/i.test(suffix);
    const specificOverlap = negativeRanges.some((negative) => (
      negative.start < positive.end && negative.end > positive.start
    ));
    return genericEnglishPrefix || genericKoreanSuffix || specificOverlap;
  };

  return positiveRanges.some((positive) => !locallyNegated(positive));
}

export function parseAdditionalRequest(text: string | undefined): ParsedPreferenceInput {
  const normalized = text?.trim();
  if (!normalized) return {};

  const excludedCategories = parseExcludedCategories(normalized);
  const quietPreferred = explicitBoolean(normalized, QUIET_POSITIVE, QUIET_NEGATIVE);
  const photoFriendlyPreferred = explicitBoolean(normalized, PHOTO_POSITIVE, PHOTO_NEGATIVE);
  const indoorOnly = explicitBoolean(normalized, INDOOR_POSITIVE, INDOOR_NEGATIVE);

  return {
    ...(excludedCategories.length > 0 ? { excludedCategories } : {}),
    ...(quietPreferred !== undefined ? { quietPreferred } : {}),
    ...(photoFriendlyPreferred !== undefined ? { photoFriendlyPreferred } : {}),
    ...(indoorOnly !== undefined ? { indoorOnly } : {}),
  };
}

export function mergeServerPreferences(request: RecommendationRequest): ParsedPreferenceInput {
  const parsed = parseAdditionalRequest(request.additionalRequest);
  const excludedCategories = [...new Set([
    ...(request.excludedCategories ?? []),
    ...(parsed.excludedCategories ?? []),
  ])];
  const choose = (structured: boolean | undefined, inferred: boolean | undefined) => (
    structured !== undefined ? structured : inferred
  );

  return {
    ...(request.moods ? { moods: request.moods } : {}),
    ...(choose(request.quietPreferred, parsed.quietPreferred) !== undefined
      ? { quietPreferred: choose(request.quietPreferred, parsed.quietPreferred) }
      : {}),
    ...(request.conversationFriendlyPreferred !== undefined
      ? { conversationFriendlyPreferred: request.conversationFriendlyPreferred }
      : {}),
    ...(request.longStayPreferred !== undefined ? { longStayPreferred: request.longStayPreferred } : {}),
    ...(choose(request.photoFriendlyPreferred, parsed.photoFriendlyPreferred) !== undefined
      ? { photoFriendlyPreferred: choose(request.photoFriendlyPreferred, parsed.photoFriendlyPreferred) }
      : {}),
    ...(request.specialOccasion !== undefined ? { specialOccasion: request.specialOccasion } : {}),
    ...(choose(request.indoorOnly, parsed.indoorOnly) !== undefined
      ? { indoorOnly: choose(request.indoorOnly, parsed.indoorOnly) }
      : {}),
    ...(excludedCategories.length > 0 ? { excludedCategories } : {}),
  };
}

const normalizeCategory = (category: string): string => {
  if (category === 'restaurant') return 'meal';
  if (category === 'bar') return 'drinks';
  if (category === 'attraction') return 'walk';
  return category;
};

export function detectStructuredPreferenceConflict(
  request: RecommendationRequest,
): { conflictingCategories: string[] } | null {
  const excluded = new Set([
    ...(request.excludedCategories ?? []),
    ...(parseAdditionalRequest(request.additionalRequest).excludedCategories ?? []),
  ].map(normalizeCategory));
  const conflictingCategories = request.courseSteps
    .map((step) => normalizeCategory(step.category))
    .filter((category, index, values) => excluded.has(category) && values.indexOf(category) === index);
  return conflictingCategories.length > 0 ? { conflictingCategories } : null;
}
