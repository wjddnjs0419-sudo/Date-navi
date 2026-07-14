import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);
const boundedText = (max: number) => nonEmptyText.max(max);

export const recommendationLanguageSchema = z.enum(['ko', 'en']);
export const recommendationModeSchema = z.enum(['course', 'single_place']);

export const recommendationLocationSchema = z.object({
  source: z.enum(['current', 'kakao']),
  kakaoPlaceId: boundedText(120).optional(),
  label: boundedText(120),
  address: boundedText(240).optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  kind: z.enum(['station', 'neighborhood', 'landmark', 'school', 'culture', 'place', 'current']),
}).strict();

export const courseStepInputSchema = z.object({
  id: boundedText(80),
  category: boundedText(80),
  label: boundedText(120),
}).strict();

const uniqueStrings = (maxLength: number) => z.array(boundedText(maxLength)).superRefine((values, ctx) => {
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: 'custom', message: 'Values must be unique.' });
  }
});

export const hardConstraintsSchema = z.object({
  location: recommendationLocationSchema,
  courseSteps: z.array(courseStepInputSchema),
  maxWalkingMinutes: z.union([z.literal(5), z.literal(10), z.literal(20)]).optional(),
  totalBudgetKRW: z.number().int().positive().max(10_000_000).optional(),
  indoorOnly: z.boolean().optional(),
  excludedCategories: uniqueStrings(80).optional(),
  excludedPlaceIds: uniqueStrings(120).optional(),
});

export const softPreferencesSchema = z.object({
  moods: uniqueStrings(80).optional(),
  quietPreferred: z.boolean().optional(),
  conversationFriendlyPreferred: z.boolean().optional(),
  longStayPreferred: z.boolean().optional(),
  photoFriendlyPreferred: z.boolean().optional(),
  specialOccasion: z.boolean().optional(),
  freeText: z.string().trim().max(500).optional(),
});

export const parsedPreferenceInputSchema = softPreferencesSchema
  .omit({ freeText: true })
  .extend({
    excludedCategories: uniqueStrings(80).optional(),
    indoorOnly: z.boolean().optional(),
  })
  .strict();

export const lockedCourseStepInputSchema = z.object({
  stepId: boundedText(80),
  candidateId: boundedText(120),
  kakaoPlaceId: boundedText(120),
}).strict();

export const recommendationRequestSchema = hardConstraintsSchema
  .merge(softPreferencesSchema)
  .extend({
    requestId: boundedText(120),
    sessionId: boundedText(120).optional(),
    // A regeneration must attest to the exact draft version it was generated
    // from. The Edge function verifies this against the DB before staging the
    // result, rather than trusting the later mutation RPC payload.
    baseRequestId: boundedText(120).optional(),
    mode: recommendationModeSchema,
    language: recommendationLanguageSchema,
    duration: boundedText(80).optional(),
    selectedMoodTags: uniqueStrings(80).optional(),
    additionalRequest: z.string().trim().max(500).optional(),
    parsedPreferences: parsedPreferenceInputSchema.optional(),
    lockedSteps: z.array(lockedCourseStepInputSchema).optional(),
    replacement: z.object({
      stepId: boundedText(80),
      kakaoPlaceId: boundedText(120),
    }).strict().optional(),
  })
  .strict()
  .superRefine((request, ctx) => {
    const minimum = request.mode === 'course' ? 2 : 1;
    const maximum = request.mode === 'course' ? 4 : 1;
    if (request.courseSteps.length < minimum || request.courseSteps.length > maximum) {
      ctx.addIssue({
        code: 'custom',
        path: ['courseSteps'],
        message: `A ${request.mode} request requires ${minimum}-${maximum} steps.`,
      });
    }
    if (new Set(request.courseSteps.map((step) => step.id)).size !== request.courseSteps.length) {
      ctx.addIssue({ code: 'custom', path: ['courseSteps'], message: 'Course step IDs must be unique.' });
    }
    if (request.lockedSteps && new Set(request.lockedSteps.map((step) => step.stepId)).size !== request.lockedSteps.length) {
      ctx.addIssue({ code: 'custom', path: ['lockedSteps'], message: 'Locked step IDs must be unique.' });
    }
    if (request.replacement && !request.courseSteps.some((step) => step.id === request.replacement?.stepId)) {
      ctx.addIssue({ code: 'custom', path: ['replacement', 'stepId'], message: 'Replacement step must belong to the course.' });
    }
  });

const recommendDateCardStepSchema = z.object({
  label: boundedText(200),
  desc: z.string().max(500).optional(),
  candidateId: boundedText(120).optional(),
  kakaoPlaceId: boundedText(120).optional(),
  place_name: boundedText(200).optional(),
  place_address: boundedText(300).optional(),
  map_url: boundedText(1000).optional(),
}).strict();

export const recommendDateCardSchema = z.object({
  requestId: boundedText(120),
  sessionId: boundedText(120),
  title: boundedText(200),
  summary: boundedText(1000),
  estimated_time: z.string().max(120).optional(),
  estimated_budget: z.string().max(120).optional(),
  tags: z.array(boundedText(120)),
  why_recommended: boundedText(1000),
  steps: z.array(recommendDateCardStepSchema).optional(),
  candidateId: boundedText(120).optional(),
  kakaoPlaceId: boundedText(120).optional(),
  place_name: boundedText(200).optional(),
  place_address: boundedText(300).optional(),
  map_url: boundedText(1000).optional(),
}).strict();

export const recommendDateCardsPayloadSchema = z.object({
  cards: z.array(recommendDateCardSchema).min(1),
}).strict();

export const relaxedConstraintSchema = z.object({
  constraint: boundedText(160),
  reason: boundedText(280),
}).strict();

export const recommendationCourseStepSchema = z.object({
  stepId: boundedText(80),
  order: z.number().int().positive(),
  category: boundedText(80),
  label: boundedText(120),
  candidateId: boundedText(120),
  kakaoPlaceId: boundedText(120),
  name: boundedText(160),
  address: z.string().max(300),
  roadAddress: z.string().max(300),
  mapUrl: z.string().max(1000),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  reason: boundedText(500),
  locked: z.boolean(),
}).strict();

export const recommendationCourseSchema = z.object({
  requestId: boundedText(120),
  sessionId: boundedText(120),
  steps: z.array(recommendationCourseStepSchema).min(2).max(4),
  relaxedConstraints: z.array(relaxedConstraintSchema),
  generatedAt: z.string().datetime(),
}).strict().superRefine((course, ctx) => {
  const unique = (values: string[], path: string, message: string) => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path: ['steps'], message });
  };
  unique(course.steps.map((step) => step.stepId), 'stepId', 'Step IDs must be unique.');
  unique(course.steps.map((step) => step.candidateId), 'candidateId', 'Candidate IDs must be unique.');
  unique(course.steps.map((step) => step.kakaoPlaceId), 'kakaoPlaceId', 'Kakao place IDs must be unique.');
  const expectedOrders = course.steps.map((_, index) => index + 1);
  if (course.steps.map((step) => step.order).join(',') !== expectedOrders.join(',')) {
    ctx.addIssue({ code: 'custom', path: ['steps'], message: 'Step order must be consecutive and start at 1.' });
  }
});

export const recommendDateSearchMetadataSchema = z.object({
  requestCount: z.number().int().nonnegative(),
  successfulCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  rateLimitedCount: z.number().int().nonnegative(),
  timeoutCount: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
}).strict();

export const recommendDateRouteMetadataSchema = z.object({
  distanceMethod: z.literal('haversine_straight_line'),
  adjacentDistanceMeters: z.array(z.number().finite().nonnegative()),
  totalDistanceMeters: z.number().finite().nonnegative(),
  walkingHeuristicMetersPerMinute: z.literal(80),
  walkingLimitAssessment: z.enum(['not_requested', 'provisional_within', 'provisional_exceeded']),
  hardConstraintValidated: z.literal(false),
}).strict();

export const recommendDateMetadataSchema = z.object({
  fallbackUsed: z.boolean(),
  selectionSource: z.enum(['ai', 'deterministic_fallback']),
  selectionReason: z.enum(['none', 'ai_timeout', 'ai_malformed', 'ai_invalid_selection', 'ai_route_constraint', 'ai_unavailable']),
  search: recommendDateSearchMetadataSchema,
  route: recommendDateRouteMetadataSchema,
}).strict();

const ROUTE_DISTANCE_TOLERANCE_METERS = 0.5;

const haversineDistanceMeters = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number => {
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
};

export const recommendDateResponseSchema = z.object({
  requestId: boundedText(120),
  course: recommendationCourseSchema,
  cards: z.array(recommendDateCardSchema).min(1),
  metadata: recommendDateMetadataSchema,
}).strict().superRefine((response, ctx) => {
  const issue = (path: (string | number)[], message: string) => {
    ctx.addIssue({ code: 'custom', path, message });
  };
  if (response.course.requestId !== response.requestId) {
    issue(['course', 'requestId'], 'Course requestId must match the response requestId.');
  }
  const { search, route } = response.metadata;
  if (search.requestCount !== search.successfulCount + search.failedCount
    + search.rateLimitedCount + search.timeoutCount) {
    issue(['metadata', 'search', 'requestCount'], 'Search outcome counts must add up to requestCount.');
  }
  if (search.successfulCount === 0) {
    issue(['metadata', 'search', 'successfulCount'], 'A successful response requires a successful search.');
  }
  if (search.candidateCount < response.course.steps.length) {
    issue(['metadata', 'search', 'candidateCount'], 'Candidate count must cover every course step.');
  }
  const expectedAdjacentCount = response.course.steps.length - 1;
  if (route.adjacentDistanceMeters.length !== expectedAdjacentCount) {
    issue(['metadata', 'route', 'adjacentDistanceMeters'], 'Route must contain one distance per adjacent step pair.');
  }
  const adjacentSum = route.adjacentDistanceMeters.reduce((sum, distance) => sum + distance, 0);
  if (Math.abs(route.totalDistanceMeters - adjacentSum) > ROUTE_DISTANCE_TOLERANCE_METERS) {
    issue(['metadata', 'route', 'totalDistanceMeters'], 'Route total must equal the adjacent distance sum.');
  }
  response.course.steps.slice(1).forEach((step, index) => {
    const expected = haversineDistanceMeters(response.course.steps[index], step);
    const actual = route.adjacentDistanceMeters[index];
    if (actual === undefined || Math.abs(actual - expected) > ROUTE_DISTANCE_TOLERANCE_METERS) {
      issue(['metadata', 'route', 'adjacentDistanceMeters', index], 'Route distance must match the course coordinates.');
    }
  });
  response.cards.forEach((card, cardIndex) => {
    if (card.requestId !== response.requestId) {
      issue(['cards', cardIndex, 'requestId'], 'Card requestId must match the response requestId.');
    }
    if (card.sessionId !== response.course.sessionId) {
      issue(['cards', cardIndex, 'sessionId'], 'Card sessionId must match the course sessionId.');
    }
    if (card.candidateId !== undefined
      || card.kakaoPlaceId !== undefined
      || card.place_name !== undefined
      || card.place_address !== undefined
      || card.map_url !== undefined) {
      issue(['cards', cardIndex], 'Course cards cannot carry top-level single-place identity fields.');
    }
    if (!card.steps || card.steps.length !== response.course.steps.length) {
      issue(['cards', cardIndex, 'steps'], 'Card steps must match the course step count.');
      return;
    }
    card.steps.forEach((cardStep, stepIndex) => {
      const courseStep = response.course.steps[stepIndex];
      if (cardStep.candidateId !== courseStep.candidateId) {
        issue(['cards', cardIndex, 'steps', stepIndex, 'candidateId'], 'Card candidateId must match the ordered course step.');
      }
      if (cardStep.kakaoPlaceId !== courseStep.kakaoPlaceId) {
        issue(['cards', cardIndex, 'steps', stepIndex, 'kakaoPlaceId'], 'Card Kakao place ID must match the ordered course step.');
      }
      if (cardStep.place_name !== courseStep.name) {
        issue(['cards', cardIndex, 'steps', stepIndex, 'place_name'], 'Card place name must match the ordered course step.');
      }
      if (cardStep.label !== courseStep.label) {
        issue(['cards', cardIndex, 'steps', stepIndex, 'label'], 'Card label must match the ordered course step.');
      }
      const expectedAddress = courseStep.roadAddress || courseStep.address || undefined;
      if (cardStep.place_address !== expectedAddress) {
        issue(['cards', cardIndex, 'steps', stepIndex, 'place_address'], 'Card address must match the ordered course step.');
      }
      const expectedMapUrl = courseStep.mapUrl || undefined;
      if (cardStep.map_url !== expectedMapUrl) {
        issue(['cards', cardIndex, 'steps', stepIndex, 'map_url'], 'Card map URL must match the ordered course step.');
      }
    });
  });
  const isAiSelection = !response.metadata.fallbackUsed
    && response.metadata.selectionSource === 'ai'
    && response.metadata.selectionReason === 'none';
  const isFallbackSelection = response.metadata.fallbackUsed
    && response.metadata.selectionSource === 'deterministic_fallback'
    && response.metadata.selectionReason !== 'none';
  if (!isAiSelection && !isFallbackSelection) {
    issue(['metadata'], 'Selection source, reason, and fallback flag must be semantically consistent.');
  }
});

export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;
export type RecommendationCourse = z.infer<typeof recommendationCourseSchema>;
export type RecommendDateCard = z.infer<typeof recommendDateCardSchema>;
export type RecommendDateResponse = z.infer<typeof recommendDateResponseSchema>;

export function validateRecommendDateResponseForRequest(
  request: RecommendationRequest,
  response: RecommendDateResponse,
): RecommendDateResponse {
  const fail = (message: string): never => {
    throw new Error(`Recommendation response does not match request: ${message}`);
  };
  const expectedSessionId = request.sessionId ?? request.requestId;
  if (response.requestId !== request.requestId
    || response.course.requestId !== request.requestId
    || response.course.sessionId !== expectedSessionId
    || response.cards.some((card) => card.requestId !== request.requestId || card.sessionId !== expectedSessionId)) {
    fail('request/session identity mismatch');
  }
  if (response.course.steps.length !== request.courseSteps.length) {
    fail('course step count mismatch');
  }
  const locks = new Map((request.lockedSteps ?? []).map((lock) => [lock.stepId, lock]));
  request.courseSteps.forEach((requestedStep, index) => {
    const responseStep = response.course.steps[index];
    if (!responseStep
      || responseStep.stepId !== requestedStep.id
      || responseStep.category !== requestedStep.category
      || responseStep.label !== requestedStep.label) {
      fail(`course step ${index} identity mismatch`);
    }
    const lock = locks.get(requestedStep.id);
    if (responseStep.locked !== Boolean(lock)) {
      fail(`course step ${index} lock flag mismatch`);
    }
    if (lock && (responseStep.candidateId !== lock.candidateId || responseStep.kakaoPlaceId !== lock.kakaoPlaceId)) {
      fail(`course step ${index} lock tuple mismatch`);
    }
  });
  if ([...locks.keys()].some((stepId) => !request.courseSteps.some((step) => step.id === stepId))) {
    fail('lock references a missing request step');
  }

  const route = response.metadata.route;
  const expectedAssessment = request.maxWalkingMinutes === undefined
    ? 'not_requested'
    : route.adjacentDistanceMeters.some((distance) => distance > request.maxWalkingMinutes! * 80)
      ? 'provisional_exceeded'
      : 'provisional_within';
  if (route.walkingLimitAssessment !== expectedAssessment) {
    fail('walking limit assessment mismatch');
  }
  const walkingRelaxations = response.course.relaxedConstraints
    .filter((relaxation) => relaxation.constraint === 'maxWalkingMinutes');
  if (expectedAssessment === 'provisional_exceeded') {
    if (walkingRelaxations.length !== 1) fail('missing or duplicate maxWalkingMinutes relaxation');
  } else if (walkingRelaxations.length !== 0) {
    fail('spurious maxWalkingMinutes relaxation');
  }
  return response;
}

export function serializeRecommendationRequest(input: unknown): string {
  return JSON.stringify(recommendationRequestSchema.parse(input));
}

export function deserializeRecommendationRequest(serialized: string): RecommendationRequest {
  return recommendationRequestSchema.parse(JSON.parse(serialized));
}
