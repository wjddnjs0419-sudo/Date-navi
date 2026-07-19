import { createRecommendationError } from '../../../shared/recommendation/errors.ts';
import {
  recommendDateResponseSchema,
  recommendationRequestSchema,
  validateRecommendDateResponseForRequest,
  type RecommendationRequest,
} from '../../../shared/recommendation/schemas.ts';
import {
  buildRecommendationPrompt,
  RECOMMEND_DATE_PROMPT_VERSION,
} from './recommendation-prompt.ts';
import {
  RecommendDateDownstreamMalformedError,
  RecommendDateDownstreamTimeoutError,
} from './recommend-date-downstream.ts';
import {
  detectStructuredPreferenceConflict,
  mergeServerPreferences,
} from './recommendation-intent.ts';
import type { RecommendationSearchPipelineResult } from './recommendation-search-pipeline.ts';
import {
  buildCandidateOnlyCourse,
  buildDeterministicCandidateCourse,
  candidateMatchesCategory,
  candidateOnlySelectionSchema,
  CourseSelectionError,
} from './recommendation-course-selection.ts';
import { parseStepIntents, placeMatchesStepIntent } from './step-intent.ts';

export type RecommendDateRequest = {
  method: string;
  authorization?: string | null;
  body: unknown;
};

export type RecommendDateDependencies = {
  authenticate: (authorization: string) => Promise<{ id: string } | null>;
  searchCandidates: (request: RecommendationRequest) => Promise<RecommendationSearchPipelineResult>;
  generateSelection: (input: {
    authorization: string;
    prompt: string;
    promptVersion: string;
  }) => Promise<unknown>;
  stageAttestation?: (input: {
    ownerUserId: string;
    request: RecommendationRequest;
    response: import('../../../shared/recommendation/schemas.ts').RecommendDateResponse;
  }) => Promise<void>;
  onCourseValidationFailure?: (stage: CourseValidationFailureStage) => void;
  now?: () => string;
};

export type CourseValidationFailureStage =
  | 'course_build'
  | 'response_schema'
  | 'request_response_validation'
  | 'stage_attestation';

export type RecommendDateHandlerResult = {
  status: number;
  body: unknown;
};

const errorResult = (
  status: number,
  code: Parameters<typeof createRecommendationError>[0],
): RecommendDateHandlerResult => ({
  status,
  body: { error: createRecommendationError(code) },
});

function courseValidationFailure(
  dependencies: RecommendDateDependencies,
  stage: CourseValidationFailureStage,
): RecommendDateHandlerResult {
  try {
    dependencies.onCourseValidationFailure?.(stage);
  } catch {
    // Observability must never change the sanitized response contract.
  }
  return {
    status: 422,
    body: {
      error: {
        ...createRecommendationError('COURSE_VALIDATION_FAILED'),
        failureStage: stage,
      },
    },
  };
}

export async function handleRecommendDate(
  input: RecommendDateRequest,
  dependencies: RecommendDateDependencies,
): Promise<RecommendDateHandlerResult> {
  if (input.method === 'OPTIONS') return { status: 204, body: null };
  if (input.method !== 'POST') return errorResult(405, 'INVALID_INPUT');

  const authorization = input.authorization?.trim();
  if (!authorization) return errorResult(401, 'AUTH_EXPIRED');

  let authenticatedUser: { id: string };
  try {
    const user = await dependencies.authenticate(authorization);
    if (!user) return errorResult(401, 'AUTH_EXPIRED');
    authenticatedUser = user;
  } catch {
    return errorResult(401, 'AUTH_EXPIRED');
  }

  const parsedRequest = recommendationRequestSchema.safeParse(input.body);
  if (!parsedRequest.success) return errorResult(400, 'INVALID_INPUT');
  if (parsedRequest.data.mode !== 'course' || parsedRequest.data.courseSteps.length < 2) {
    return errorResult(400, 'INVALID_INPUT');
  }
  if (detectStructuredPreferenceConflict(parsedRequest.data)) {
    return errorResult(400, 'INVALID_INPUT');
  }

  const { parsedPreferences: _untrustedParsedPreferences, ...trustedRequest } = parsedRequest.data;
  const serverPreferences = mergeServerPreferences(trustedRequest);
  const serverRequest = Object.keys(serverPreferences).length > 0
    ? {
      ...trustedRequest,
      ...serverPreferences,
      parsedPreferences: serverPreferences,
    }
    : trustedRequest;

  let search: RecommendationSearchPipelineResult;
  try {
    search = await dependencies.searchCandidates(serverRequest);
  } catch {
    return errorResult(504, 'PLACE_SEARCH_TIMEOUT');
  }

  if (search.searchMetadata.allSearchesFailed && search.searchMetadata.rateLimitedCount > 0) {
    return errorResult(429, 'PLACE_SEARCH_RATE_LIMITED');
  }
  if (search.searchMetadata.allSearchesFailed && search.searchMetadata.timeoutCount > 0) {
    return errorResult(504, 'PLACE_SEARCH_TIMEOUT');
  }
  const hasEveryRequiredCategory = serverRequest.courseSteps.every((step) => (
    search.candidates.some((candidate) => candidateMatchesCategory(candidate, step.category))
  ));
  if (search.candidates.length === 0 || !hasEveryRequiredCategory) {
    return errorResult(422, 'INSUFFICIENT_CANDIDATES');
  }
  const requiredStepIntents = parseStepIntents(serverRequest).stepIntents
    .filter((intent) => intent.strength === 'required');
  const hasEveryRequiredIntent = requiredStepIntents.every((intent) => (
    search.candidates.some((candidate) => placeMatchesStepIntent(candidate, intent))
  ));
  if (!hasEveryRequiredIntent) {
    return errorResult(422, 'STEP_INTENT_UNSATISFIED');
  }

  const generatedAt = dependencies.now?.() ?? new Date().toISOString();
  let fallbackUsed = false;
  let selectionReason: 'none' | 'ai_timeout' | 'ai_malformed' | 'ai_invalid_selection' | 'ai_route_constraint' | 'ai_unavailable' = 'none';
  let built;
  try {
    if (serverRequest.replacement) {
      const targetIndex = serverRequest.courseSteps.findIndex((step) => step.id === serverRequest.replacement?.stepId);
      const locked = new Map((serverRequest.lockedSteps ?? []).map((step) => [step.stepId, step]));
      const forced = search.candidates.find((candidate) => candidate.kakaoPlaceId === serverRequest.replacement?.kakaoPlaceId);
      if (targetIndex < 0 || !forced || !candidateMatchesCategory(forced, serverRequest.courseSteps[targetIndex].category)
        || locked.has(serverRequest.replacement.stepId)
        || serverRequest.courseSteps.some((step) => step.id !== serverRequest.replacement?.stepId && !locked.has(step.id))) {
        return errorResult(422, 'COURSE_VALIDATION_FAILED');
      }
      built = buildCandidateOnlyCourse({
        request: serverRequest,
        candidates: search.candidates,
        selection: {
          steps: serverRequest.courseSteps.map((step) => ({
            stepId: step.id,
            candidateId: step.id === serverRequest.replacement?.stepId
              ? forced.candidateId
              : locked.get(step.id)!.candidateId,
          })),
        },
        generatedAt,
      });
    }
    if (!built) {
      let downstream: unknown;
      try {
        downstream = await dependencies.generateSelection({
          authorization,
          prompt: buildRecommendationPrompt(serverRequest, search.candidates),
          promptVersion: RECOMMEND_DATE_PROMPT_VERSION,
        });
      } catch (error) {
        fallbackUsed = true;
        selectionReason = error instanceof RecommendDateDownstreamTimeoutError
          ? 'ai_timeout'
          : error instanceof RecommendDateDownstreamMalformedError
            ? 'ai_malformed'
            : 'ai_unavailable';
      }
      if (!fallbackUsed) {
        const parsedSelection = candidateOnlySelectionSchema.safeParse(downstream);
        if (!parsedSelection.success) {
          fallbackUsed = true;
          selectionReason = 'ai_malformed';
        } else {
          try {
            built = buildCandidateOnlyCourse({
              request: serverRequest,
              candidates: search.candidates,
              selection: parsedSelection.data,
              generatedAt,
            });
            if (serverRequest.maxWalkingMinutes !== undefined
              && built.route.walkingLimitAssessment === 'provisional_exceeded') {
              built = undefined;
              fallbackUsed = true;
              selectionReason = 'ai_route_constraint';
            }
          } catch (error) {
            if (!(error instanceof CourseSelectionError)) throw error;
            fallbackUsed = true;
            selectionReason = 'ai_invalid_selection';
          }
        }
      }
    }

    if (!built) {
      built = buildDeterministicCandidateCourse({
        request: serverRequest,
        candidates: search.candidates,
        generatedAt,
      });
    }
  } catch (error) {
    if (error instanceof CourseSelectionError) {
      if (error.code === 'COURSE_VALIDATION_FAILED') {
        return courseValidationFailure(dependencies, 'course_build');
      }
      return errorResult(422, error.code);
    }
    return courseValidationFailure(dependencies, 'course_build');
  }

  const response = recommendDateResponseSchema.safeParse({
    requestId: parsedRequest.data.requestId,
    course: built.course,
    cards: built.cards,
    metadata: {
      fallbackUsed,
      selectionSource: fallbackUsed ? 'deterministic_fallback' : 'ai',
      selectionReason,
      search: {
        requestCount: search.searchMetadata.requestCount,
        successfulCount: search.searchMetadata.successfulCount,
        failedCount: search.searchMetadata.failedCount,
        rateLimitedCount: search.searchMetadata.rateLimitedCount,
        timeoutCount: search.searchMetadata.timeoutCount,
        candidateCount: search.candidates.length,
      },
      route: built.route,
    },
  });
  if (!response.success) return courseValidationFailure(dependencies, 'response_schema');
  try {
    validateRecommendDateResponseForRequest(serverRequest, response.data);
  } catch {
    return courseValidationFailure(dependencies, 'request_response_validation');
  }
  if (dependencies.stageAttestation) {
    try {
      await dependencies.stageAttestation({ ownerUserId: authenticatedUser.id, request: serverRequest, response: response.data });
    } catch {
      return courseValidationFailure(dependencies, 'stage_attestation');
    }
  }
  return { status: 200, body: response.data };
}
