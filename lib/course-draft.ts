import {
  Coffee, Footprints, Palette, Sparkles, Utensils, Wine, Zap,
  type LucideIcon,
} from 'lucide-react-native';
import type {
  CourseStepInput,
  ParsedPreferenceInput,
  RecommendationLocation,
} from '../shared/recommendation/contracts';

export const COURSE_CATEGORIES = [
  'meal',
  'cafe',
  'drinks',
  'activity',
  'culture',
  'walk',
  'ai_decide',
] as const;

export const COURSE_MOODS = ['comfortable', 'lively', 'romantic', 'quiet', 'novel'] as const;

export type CourseCategory = (typeof COURSE_CATEGORIES)[number];
export type CourseMood = (typeof COURSE_MOODS)[number];
export type WalkingLimit = 5 | 10 | 20 | undefined;

export const CATEGORY_ICONS: Record<CourseCategory, LucideIcon> = {
  meal: Utensils,
  cafe: Coffee,
  drinks: Wine,
  activity: Zap,
  culture: Palette,
  walk: Footprints,
  ai_decide: Sparkles,
};

export function getCourseCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category as CourseCategory] ?? Sparkles;
}

export type CoursePin = {
  kakaoPlaceId: string;
  name: string;
  address: string;
};

export type CourseDraftStep = {
  id: string;
  category: CourseCategory;
  /** When set, the step is pinned to a user-picked place and its category is ignored server-side. */
  pin?: CoursePin;
};

// 예산·시간 슬라이더 공유 상수(코스 입력·후보 수정). 예산은 1인 기준.
export const PER_PERSON_BUDGET_MAX_KRW = 100_000;
export const PER_PERSON_BUDGET_STEP_KRW = 1_000;
export const DURATION_MAX_HOURS = 24;

export type CourseDraft = {
  location: RecommendationLocation | null;
  steps: readonly CourseDraftStep[];
  maxWalkingMinutes: WalkingLimit;
  perPersonBudgetKRWInput: string;
  moods: readonly CourseMood[];
  duration?: string;
  additionalRequest: string;
};

export type CourseDraftAction =
  | { type: 'setLocation'; location: RecommendationLocation | null }
  | { type: 'addStep'; step: CourseDraftStep }
  | { type: 'removeStep'; stepId: string }
  | { type: 'moveStep'; stepId: string; direction: 'up' | 'down' }
  | { type: 'setStepCategory'; stepId: string; category: CourseCategory }
  | { type: 'setStepPin'; stepId: string; pin: CoursePin }
  | { type: 'clearStepPin'; stepId: string }
  | { type: 'setWalkingLimit'; minutes: WalkingLimit }
  | { type: 'setBudgetInput'; value: string }
  | { type: 'toggleMood'; mood: CourseMood }
  | { type: 'setDuration'; duration?: string }
  | { type: 'setAdditionalRequest'; value: string };

export type CourseDraftIssue =
  | { code: 'location_required' }
  | { code: 'step_count_invalid' }
  | { code: 'duplicate_step_ids' }
  | { code: 'invalid_step_category' }
  | { code: 'budget_invalid' }
  | { code: 'additional_request_too_long' }
  | { code: 'exclusion_conflict'; categories: CourseCategory[] };

export type StructuredCourseInput = {
  location: RecommendationLocation;
  courseSteps: CourseStepInput[];
  maxWalkingMinutes?: Exclude<WalkingLimit, undefined>;
  totalBudgetKRW?: number;
  moods?: CourseMood[];
  duration?: string;
  additionalRequest?: string;
  parsedPreferences?: ParsedPreferenceInput;
};

const categorySet = new Set<string>(COURSE_CATEGORIES);

export function createInitialCourseDraft(nextId: () => string): CourseDraft {
  const firstId = nextId();
  const secondId = nextId();
  if (!firstId || !secondId || firstId === secondId) {
    throw new Error('Course step IDs must be non-empty and unique.');
  }
  return {
    location: null,
    steps: [
      { id: firstId, category: 'meal' },
      { id: secondId, category: 'cafe' },
    ],
    maxWalkingMinutes: undefined,
    perPersonBudgetKRWInput: '',
    moods: [],
    duration: undefined,
    additionalRequest: '',
  };
}

export function courseDraftReducer(draft: CourseDraft, action: CourseDraftAction): CourseDraft {
  switch (action.type) {
    case 'setLocation':
      return { ...draft, location: action.location };
    case 'addStep':
      if (draft.steps.length >= 4 || draft.steps.some((step) => step.id === action.step.id)) return draft;
      return { ...draft, steps: [...draft.steps, action.step] };
    case 'removeStep':
      if (draft.steps.length <= 2 || !draft.steps.some((step) => step.id === action.stepId)) return draft;
      return { ...draft, steps: draft.steps.filter((step) => step.id !== action.stepId) };
    case 'moveStep': {
      const index = draft.steps.findIndex((step) => step.id === action.stepId);
      const destination = action.direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || destination < 0 || destination >= draft.steps.length) return draft;
      const steps = [...draft.steps];
      [steps[index], steps[destination]] = [steps[destination], steps[index]];
      return { ...draft, steps };
    }
    case 'setStepCategory':
      return {
        ...draft,
        steps: draft.steps.map((step) => (
          step.id === action.stepId ? { ...step, category: action.category } : step
        )),
      };
    case 'setStepPin':
      return {
        ...draft,
        steps: draft.steps.map((step) => (
          step.id === action.stepId ? { ...step, pin: action.pin } : step
        )),
      };
    case 'clearStepPin':
      return {
        ...draft,
        steps: draft.steps.map((step) => {
          if (step.id !== action.stepId) return step;
          const { pin: _pin, ...rest } = step;
          return rest;
        }),
      };
    case 'setWalkingLimit':
      return { ...draft, maxWalkingMinutes: action.minutes };
    case 'setBudgetInput':
      return { ...draft, perPersonBudgetKRWInput: action.value };
    case 'toggleMood':
      return {
        ...draft,
        moods: draft.moods.includes(action.mood)
          ? draft.moods.filter((mood) => mood !== action.mood)
          : [...draft.moods, action.mood],
      };
    case 'setDuration':
      return { ...draft, duration: action.duration?.trim() || undefined };
    case 'setAdditionalRequest':
      return { ...draft, additionalRequest: action.value };
    default:
      return draft;
  }
}

const exclusionPatterns: Record<Exclude<CourseCategory, 'ai_decide'>, RegExp[]> = {
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

const QUIET_POSITIVES = [
  /조용(?:한|하고|하게|히)/i,
  /\bquiet\s+(?:indoor\s+)?(?:places?|spots?|venues?|spaces?|cafes?|restaurants?)\b/i,
  /\b(?:prefer|want|need|looking\s+for|would\s+like)\b.{0,24}\bquiet\b/i,
];
const QUIET_LOCAL_NEGATIONS = [
  /\b(?:not|no)\s+quiet\b/i,
  /\bavoid\s+quiet(?:\s+(?:places?|spots?|venues?|spaces?))?\b/i,
  /\b(?:do not|don't|dont)\s+(?:want|need|prefer)\s+(?:a\s+)?quiet\b/i,
  /조용(?:한|하게)?(?:\s*곳)?(?:은|는|을|를)?\s*(?:싫|원하지|필요\s*없|중요하지)/i,
  /조용하지\s*않/i,
];

const PHOTO_POSITIVES = [
  /사진\s*(?:찍기|찍고|찍을|잘\s*나오|명소|스팟)/i,
  /\b(?:good|great|nice|ideal|perfect)\s+for\s+photos?\b/i,
  /\b(?:places?|spots?|venues?)\s+(?:that\s+are\s+)?(?:good\s+)?for\s+photos?\b/i,
  /\bphoto[- ]friendly\b/i,
  /\b(?:take|taking|want\s+to\s+take)\s+photos?\b/i,
];
const PHOTO_LOCAL_NEGATIONS = [
  /\bno\s+photos?\b/i,
  /\bphotos?\s+(?:are|is)\s+not\s+(?:important|needed|a\s+priority)\b/i,
  /\b(?:do not|don't|dont)\s+(?:want|need|care\s+about)\s+photos?\b/i,
  /사진(?:은|이|을|는|도)?\s*(?:중요하지|필요\s*없|싫|원하지)/i,
  /사진\s*안\s*찍/i,
];

const INDOOR_POSITIVES = [
  /실내\s*(?:에서|로|만|장소|공간|데이트)/i,
  /\bindoor\s+(?:places?|spots?|venues?|spaces?|activities|date)\b/i,
  /\b(?:prefer|want|need|looking\s+for)\b.{0,24}\bindoor\b/i,
  /\bindoors?\s+only\b/i,
];
const INDOOR_LOCAL_NEGATIONS = [
  /\b(?:not|no)\s+indoor\b/i,
  /\bavoid\s+indoor(?:\s+(?:places?|spots?|venues?|spaces?))?\b/i,
  /\b(?:do not|don't|dont)\s+(?:want|need|prefer)\s+indoor\b/i,
  /\bindoor(?:\s+places?)?\s+(?:is|are)\s+not\s+(?:needed|important|preferred)\b/i,
  /실내(?:는|가|를|도)?\s*(?:싫|제외|원하지|필요\s*없|중요하지)/i,
  /실내\s*말고/i,
];

function hasExplicitPositive(
  text: string,
  positives: RegExp[],
  localNegations: RegExp[],
): boolean {
  return positives.some((positive) => {
    const flags = positive.flags.includes('g') ? positive.flags : `${positive.flags}g`;
    const matches = text.matchAll(new RegExp(positive.source, flags));
    for (const match of matches) {
      const index = match.index ?? 0;
      const windowStart = Math.max(0, index - 40);
      const windowEnd = Math.min(text.length, index + match[0].length + 40);
      const localText = text.slice(windowStart, windowEnd);
      if (!localNegations.some((negation) => negation.test(localText))) return true;
    }
    return false;
  });
}

export function parseCoursePreferences(text: string): ParsedPreferenceInput {
  const normalized = text.trim();
  if (!normalized) return {};

  const excludedCategories = COURSE_CATEGORIES.filter((category): category is Exclude<CourseCategory, 'ai_decide'> => (
    category !== 'ai_decide' && exclusionPatterns[category].some((pattern) => pattern.test(normalized))
  ));
  const parsed: ParsedPreferenceInput = {};
  if (excludedCategories.length > 0) parsed.excludedCategories = excludedCategories;
  if (hasExplicitPositive(normalized, QUIET_POSITIVES, QUIET_LOCAL_NEGATIONS)) parsed.quietPreferred = true;
  if (hasExplicitPositive(normalized, PHOTO_POSITIVES, PHOTO_LOCAL_NEGATIONS)) parsed.photoFriendlyPreferred = true;
  if (hasExplicitPositive(normalized, INDOOR_POSITIVES, INDOOR_LOCAL_NEGATIONS)) parsed.indoorOnly = true;
  return parsed;
}

export function parsePerPersonBudgetKRW(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replaceAll(',', '');
  if (!/^[0-9]+$/.test(normalized)) return undefined;
  const value = Number(normalized);
  return Number.isSafeInteger(value) && value > 0 && value <= 10_000_000 ? value : undefined;
}

// "2~3시간"/"2-3 hours" 같은 자유 텍스트에서 선행 정수 시간만 뽑는다. 코스 입력·후보 수정 슬라이더가 공유.
export function parseDurationHours(duration?: string): number | undefined {
  if (!duration) return undefined;
  const match = /^(\d+)/.exec(duration.trim());
  return match ? Number(match[1]) : undefined;
}

export function validateCourseDraft(draft: CourseDraft): { valid: boolean; issues: CourseDraftIssue[] } {
  const issues: CourseDraftIssue[] = [];
  if (!draft.location) issues.push({ code: 'location_required' });
  if (draft.steps.length < 2 || draft.steps.length > 4) issues.push({ code: 'step_count_invalid' });
  if (new Set(draft.steps.map((step) => step.id)).size !== draft.steps.length) {
    issues.push({ code: 'duplicate_step_ids' });
  }
  if (draft.steps.some((step) => !categorySet.has(step.category))) {
    issues.push({ code: 'invalid_step_category' });
  }
  if (draft.perPersonBudgetKRWInput.trim() && parsePerPersonBudgetKRW(draft.perPersonBudgetKRWInput) === undefined) {
    issues.push({ code: 'budget_invalid' });
  }
  if (draft.additionalRequest.length > 500) issues.push({ code: 'additional_request_too_long' });

  const excluded = parseCoursePreferences(draft.additionalRequest).excludedCategories ?? [];
  const selected = new Set(draft.steps.map((step) => step.category));
  const conflicts = excluded.filter((category): category is CourseCategory => (
    categorySet.has(category) && selected.has(category as CourseCategory)
  ));
  if (conflicts.length > 0) issues.push({ code: 'exclusion_conflict', categories: conflicts });

  return { valid: issues.length === 0, issues };
}

export function buildStructuredCourseInput(
  draft: CourseDraft,
  categoryLabels: Record<CourseCategory, string>,
): StructuredCourseInput {
  const validation = validateCourseDraft(draft);
  if (!validation.valid || !draft.location) throw new Error('Cannot build an invalid course draft.');

  const additionalRequest = draft.additionalRequest.trim() || undefined;
  const parsedPreferences = parseCoursePreferences(draft.additionalRequest);
  const hasParsedPreferences = Object.keys(parsedPreferences).length > 0;
  return {
    location: draft.location,
    courseSteps: draft.steps.map((step) => ({
      id: step.id,
      category: step.category,
      label: step.pin ? step.pin.name : categoryLabels[step.category],
      ...(step.pin ? { pinnedKakaoPlaceId: step.pin.kakaoPlaceId, pinnedName: step.pin.name } : {}),
    })),
    ...(draft.maxWalkingMinutes ? { maxWalkingMinutes: draft.maxWalkingMinutes } : {}),
    // UI는 1인 기준으로 입력받고, 엣지 계약(twoPersonTotalBudgetKRW)에는 2인 총액으로 넘긴다.
    ...(parsePerPersonBudgetKRW(draft.perPersonBudgetKRWInput) !== undefined
      ? { totalBudgetKRW: parsePerPersonBudgetKRW(draft.perPersonBudgetKRWInput)! * 2 }
      : {}),
    ...(draft.moods.length > 0 ? { moods: [...draft.moods] } : {}),
    ...(draft.duration ? { duration: draft.duration } : {}),
    ...(additionalRequest ? { additionalRequest } : {}),
    ...(hasParsedPreferences ? { parsedPreferences } : {}),
  };
}
