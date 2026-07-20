export type RecommendationLanguage = 'ko' | 'en';
export type RecommendationMode = 'course' | 'single_place';

export type RecommendationLocationKind =
  | 'station'
  | 'neighborhood'
  | 'landmark'
  | 'school'
  | 'culture'
  | 'place'
  | 'current';

export type RecommendationLocation = {
  source: 'current' | 'kakao';
  kakaoPlaceId?: string;
  label: string;
  address?: string;
  latitude: number;
  longitude: number;
  kind: RecommendationLocationKind;
};

export type CourseStepInput = {
  id: string;
  category: string;
  label: string;
};

export type HardConstraints = {
  location: RecommendationLocation;
  courseSteps: CourseStepInput[];
  maxWalkingMinutes?: 5 | 10 | 20;
  totalBudgetKRW?: number;
  indoorOnly?: boolean;
  excludedCategories?: string[];
  excludedPlaceIds?: string[];
};

export type SoftPreferences = {
  moods?: string[];
  quietPreferred?: boolean;
  conversationFriendlyPreferred?: boolean;
  longStayPreferred?: boolean;
  photoFriendlyPreferred?: boolean;
  specialOccasion?: boolean;
  freeText?: string;
};

export type ParsedPreferenceInput = Omit<SoftPreferences, 'freeText'> & {
  excludedCategories?: string[];
  indoorOnly?: boolean;
};

export type LockedCourseStepInput = {
  stepId: string;
  candidateId: string;
  kakaoPlaceId: string;
  /**
   * Place facts for this step, carried by the client so the server can pin
   * a locked step without needing it to reappear in a fresh Kakao search
   * (candidateId is only stable within a single search call).
   */
  name: string;
  address: string;
  roadAddress: string;
  mapUrl: string;
  latitude: number;
  longitude: number;
  /** Optional; the server derives lock state from lockedSteps membership. Kept for forward compat. */
  locked?: boolean;
};

export type RecommendationRequest = HardConstraints & SoftPreferences & {
  requestId: string;
  /** Stable editable draft identity. Omitted for the first generation attempt. */
  sessionId?: string;
  mode: RecommendationMode;
  language: RecommendationLanguage;
  duration?: string;
  selectedMoodTags?: string[];
  additionalRequest?: string;
  parsedPreferences?: ParsedPreferenceInput;
  lockedSteps?: LockedCourseStepInput[];
  /** A user-selected, server-verified replacement candidate for exactly one unlocked step. */
  replacement?: { stepId: string; kakaoPlaceId: string; pickedName?: string };
};

export type RelaxedConstraint = {
  constraint: string;
  reason: string;
};

export type RecommendationCourseStep = {
  stepId: string;
  order: number;
  category: string;
  label: string;
  candidateId: string;
  kakaoPlaceId: string;
  name: string;
  address: string;
  roadAddress: string;
  mapUrl: string;
  latitude: number;
  longitude: number;
  reason: string;
  locked: boolean;
};

export type RecommendationCourse = {
  requestId: string;
  sessionId: string;
  steps: RecommendationCourseStep[];
  relaxedConstraints: RelaxedConstraint[];
  generatedAt: string;
};

export type RecommendationSelectionSource = 'ai' | 'deterministic_fallback';
export type RecommendationSelectionReason =
  | 'none'
  | 'ai_timeout'
  | 'ai_malformed'
  | 'ai_invalid_selection'
  | 'ai_route_constraint'
  | 'ai_unavailable';

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
  | 'AUTH_EXPIRED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export type RecommendationError = {
  code: RecommendationErrorCode;
  messages: Record<RecommendationLanguage, string>;
  retryable: boolean;
  requiresConditionEdit: boolean;
};
