import { createRecommendationError } from '../../../shared/recommendation/errors.ts';
import {
  recommendDateResponseSchema,
  recommendationRequestSchema,
  validateRecommendDateResponseForRequest,
  type RecommendationRequest,
} from '../../../shared/recommendation/schemas.ts';
import {
  buildParseStepIntentsPrompt,
  buildRecommendationPrompt,
  PARSE_STEP_INTENTS_PROMPT_VERSION,
  RECOMMEND_DATE_PROMPT_VERSION,
} from './recommendation-prompt.ts';
import { coerceAiParseResult, resolveStepIntents } from './step-intent-resolve.ts';
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
import { placeMatchesStepIntent } from './step-intent.ts';
import { verifiedPlaceMatchesCategory } from './recommendation-category.ts';
import type { PlaceCandidate } from './recommendation-ranking.ts';

// 입력 시점 지정 장소(핀) 스텝의 candidateId를, 후보 풀에서 kakaoPlaceId로 찾은 실재 후보로 강제한다.
// AI가 핀 스텝에 다른 후보를 골라도 지정이 이긴다(pin wins).
function forcePinnedCandidateIds(
  steps: readonly { stepId: string; candidateId: string }[],
  courseSteps: RecommendationRequest['courseSteps'],
  candidates: readonly PlaceCandidate[],
): { stepId: string; candidateId: string }[] {
  return steps.map((step) => {
    const courseStep = courseSteps.find((entry) => entry.id === step.stepId);
    if (!courseStep?.pinnedKakaoPlaceId) return step;
    const forced = candidates.find((candidate) => candidate.kakaoPlaceId === courseStep.pinnedKakaoPlaceId);
    return forced ? { stepId: step.stepId, candidateId: forced.candidateId } : step;
  });
}

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
  /** step intent AI fallback(parse_step_intents). 규칙 미검출+유의미 잔여 시에만 resolve가 호출한다. */
  parseStepIntentsAi?: (input: {
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

  // step intent를 요청당 1회 resolve(규칙 → 게이트 충족 시 AI 병합)해 서버 내부 request에 부착한다.
  // 하위 순수함수(search/ranking/selection/prompt)는 effectiveStepIntents로 이 값을 읽어 재파싱하지 않는다.
  const resolved = await resolveStepIntents(serverRequest, {
    invokeAi: dependencies.parseStepIntentsAi
      ? async (req) => coerceAiParseResult(
        await dependencies.parseStepIntentsAi!({
          authorization,
          prompt: buildParseStepIntentsPrompt(req),
          promptVersion: PARSE_STEP_INTENTS_PROMPT_VERSION,
        }),
        req,
      )
      : undefined,
  });
  const intentAwareRequest = {
    ...serverRequest,
    resolvedStepIntents: resolved.stepIntents,
    resolvedExcludedIntents: resolved.excludedIntents,
  };

  let search: RecommendationSearchPipelineResult;
  try {
    search = await dependencies.searchCandidates(intentAwareRequest);
  } catch {
    return errorResult(504, 'PLACE_SEARCH_TIMEOUT');
  }

  if (search.searchMetadata.allSearchesFailed && search.searchMetadata.rateLimitedCount > 0) {
    return errorResult(429, 'PLACE_SEARCH_RATE_LIMITED');
  }
  if (search.searchMetadata.allSearchesFailed && search.searchMetadata.timeoutCount > 0) {
    return errorResult(504, 'PLACE_SEARCH_TIMEOUT');
  }
  const pinnedStepIds = new Set(
    serverRequest.courseSteps.filter((step) => step.pinnedKakaoPlaceId).map((step) => step.id),
  );
  // 입력 시점 지정 장소: 파이프라인이 이름 재검색으로 병합한 뒤에도 후보 풀에 없으면 실재 검증 실패.
  for (const step of serverRequest.courseSteps) {
    if (step.pinnedKakaoPlaceId
      && !search.candidates.some((candidate) => candidate.kakaoPlaceId === step.pinnedKakaoPlaceId)) {
      return errorResult(422, 'STEP_PIN_UNAVAILABLE');
    }
  }
  // 핀 스텝은 카테고리를 이기므로(pin wins) 카테고리 충족 게이트에서 제외한다.
  const hasEveryRequiredCategory = serverRequest.courseSteps.every((step) => (
    pinnedStepIds.has(step.id)
    || search.candidates.some((candidate) => candidateMatchesCategory(candidate, step.category))
  ));
  if (search.candidates.length === 0 || !hasEveryRequiredCategory) {
    return errorResult(422, 'INSUFFICIENT_CANDIDATES');
  }
  const requiredStepIntents = resolved.stepIntents
    .filter((intent) => intent.strength === 'required' && !pinnedStepIds.has(intent.stepId));
  // 폴백(buildDeterministicCandidateCourse)은 categoryEligible ∩ placeMatchesStepIntent로 후보를
  // 고르므로, 게이트도 카테고리를 함께 검사해야 이름만 매칭되는 비-카테고리 장소가 게이트를 통과하고
  // 폴백에서 INSUFFICIENT_CANDIDATES로 어긋나는 일을 막는다.
  const unsatisfiedIntents = requiredStepIntents.filter((intent) => !(
    search.candidates.some((candidate) => (
      verifiedPlaceMatchesCategory(candidate, intent.stepCategory)
      && placeMatchesStepIntent(candidate, intent)
    ))
  ));
  if (unsatisfiedIntents.length > 0) {
    // 완화 UI(Phase 3)가 어떤 조건을 못 맞췄는지 알 수 있도록 실패한 intent를 함께 실어 보낸다.
    return {
      status: 422,
      body: {
        error: {
          ...createRecommendationError('STEP_INTENT_UNSATISFIED'),
          unsatisfiedIntents: unsatisfiedIntents.map((intent) => ({
            canonicalTerm: intent.canonicalTerm,
            displayLabel: intent.displayLabel,
          })),
        },
      },
    };
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
        request: {
          ...intentAwareRequest,
          // The replacement target's own pin (if any) describes the place being replaced away
          // from, not a constraint on the new candidate — clearing it here lets the freshly
          // picked candidate through instead of forcing it to match the old pinned place.
          courseSteps: intentAwareRequest.courseSteps.map((step) => (
            step.id === serverRequest.replacement?.stepId
              ? { ...step, pinnedKakaoPlaceId: undefined, pinnedName: undefined }
              : step
          )),
        },
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
    if (!built && pinnedStepIds.size === serverRequest.courseSteps.length) {
      // 전량 지정: AI 호출 없이 지정 장소로 결정론 조립(생성 비용 0). 문구는 결정론이라 품질 동일.
      built = buildCandidateOnlyCourse({
        request: intentAwareRequest,
        candidates: search.candidates,
        selection: {
          steps: forcePinnedCandidateIds(
            serverRequest.courseSteps.map((step) => ({ stepId: step.id, candidateId: '' })),
            serverRequest.courseSteps,
            search.candidates,
          ),
        },
        generatedAt,
      });
    }
    if (!built) {
      let downstream: unknown;
      try {
        downstream = await dependencies.generateSelection({
          authorization,
          prompt: buildRecommendationPrompt(intentAwareRequest, search.candidates),
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
            // 부분 지정: 핀 스텝은 AI 선택을 무시하고 지정 후보로 강제(pin wins).
            const selection = pinnedStepIds.size > 0
              ? { steps: forcePinnedCandidateIds(parsedSelection.data.steps, serverRequest.courseSteps, search.candidates) }
              : parsedSelection.data;
            built = buildCandidateOnlyCourse({
              request: serverRequest,
              candidates: search.candidates,
              selection,
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
        request: intentAwareRequest,
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
      ...(resolved.source !== 'none' || resolved.unsupported.length > 0 || resolved.conflicts.length > 0
        ? {
          stepIntent: {
            parserSource: resolved.source,
            aiFallbackUsed: resolved.source === 'ai',
            resolved: [...resolved.stepIntents, ...resolved.excludedIntents].map((intent) => ({
              canonicalTerm: intent.canonicalTerm,
              displayLabel: intent.displayLabel,
              strength: intent.strength,
              negated: intent.negated ?? false,
              stepId: intent.stepId,
            })),
            unsupported: resolved.unsupported,
            conflicts: resolved.conflicts,
          },
        }
        : {}),
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
