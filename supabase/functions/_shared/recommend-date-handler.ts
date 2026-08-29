import { createRecommendationError } from '../../../shared/recommendation/errors.ts';
import {
  recommendDateResponseSchema,
  recommendationRequestSchema,
  validateRecommendDateResponseForRequest,
  type RecommendationRequest,
} from '../../../shared/recommendation/schemas.ts';
import {
  buildRecommendationPrompt,
  buildProviderNeutralRecommendationPrompt,
  RECOMMEND_DATE_PROMPT_VERSION,
} from './recommendation-prompt.ts';
import { resolveStepIntents } from './step-intent-resolve.ts';
import {
  RecommendDateDownstreamMalformedError,
  RecommendDateDownstreamTimeoutError,
} from './recommend-date-downstream.ts';
import type { RecommendationSearchPipelineResult } from './recommendation-search-pipeline.ts';
import {
  buildCandidateOnlyCourse,
  buildDeterministicCandidateCourse,
  candidateMatchesCategory,
  candidateOnlySelectionSchema,
  CourseSelectionError,
} from './recommendation-course-selection.ts';
import { placeMatchesStepIntent } from './step-intent.ts';
import { effectiveStepIntents } from './step-intent.ts';
import { verifiedPlaceMatchesCategory } from './recommendation-category.ts';
import type { PlaceCandidate } from './recommendation-ranking.ts';
import { buildCandidatePoolSnapshots } from './candidate-pool-snapshot.ts';
import {
  EMPTY_RECOMMENDATION_HISTORY,
  type RecommendationHistoryContext,
} from '../../../shared/recommendation/recommendation-history.ts';
import {
  resolveHistoryExperiment,
  type HistoryExperimentMode,
  type HistoryExperimentResolution,
  type HistoryExperimentVariant,
} from '../../../shared/recommendation/history-experiment.ts';
import type { RecommendationHistoryLoad } from './recommendation-history.ts';
import type { LockResult, QuotaResult } from './ai-rate-limit.ts';
import {
  buildProviderNeutralCourse,
  ProviderNeutralCourseSelectionError,
  type ProviderNeutralCandidate,
} from './provider-neutral-course-selection.ts';
import type { ProviderNeutralDiscoveryResult } from './provider-neutral-discovery-pipeline.ts';
import { isSamePhysicalPlace } from './place-dedup.ts';
import { providerNeutralPlaceMatchesStep } from './provider-neutral-intent.ts';

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
  searchCandidates: (
    request: RecommendationRequest,
    history: RecommendationHistoryContext,
  ) => Promise<RecommendationSearchPipelineResult>;
  /** V3 provider boundary. Supplying this enables Naver-first discovery for fresh, unpinned courses. */
  searchProviderNeutralCandidates?: (request: RecommendationRequest, history: RecommendationHistoryContext) => Promise<ProviderNeutralDiscoveryResult>;
  /**
   * Optional post-selection enrichment. It never participates in discovery or
   * eligibility: a Kakao ID returned here is only a high-confidence map/review
   * link for an already selected Naver place.
   */
  resolveProviderNeutralKakaoLinks?: (input: {
    requestId: string;
    candidates: readonly ProviderNeutralCandidate[];
  }) => Promise<ReadonlyMap<string, { kakaoPlaceId: string; mapUrl: string }>>;
  /** De-identified provider-neutral failure telemetry for live rollout diagnosis. */
  onProviderNeutralFailure?: (input: {
    requestId: string;
    stage: 'candidate_count' | 'selection_unavailable';
    requestedCategories: string[];
    candidateCount: number;
    candidateCategories: Record<string, number>;
  }) => void;
  /** Server-only history dependency. No request field can select an experiment arm or inject history. */
  loadHistory?: (input: {
    authenticatedUserId: string;
    request: RecommendationRequest;
  }) => Promise<RecommendationHistoryLoad>;
  historyExperiment?: {
    mode: HistoryExperimentMode;
    resolveAssignmentContext?: (input: {
      authenticatedUserId: string;
      request: RecommendationRequest;
    }) => Promise<{
      coupleId?: string | null;
      persistedAssignedVariant?: HistoryExperimentVariant;
      assignmentScopeFailed?: boolean;
    }>;
  };
  loadReplacementCandidateRank?: (input: {
    authenticatedUserId: string;
    sessionId: string;
    targetStepId: string;
    kakaoPlaceId: string;
    candidateListAttestationId: string;
  }) => Promise<number | undefined>;
  generateSelection: (input: {
    authorization: string;
    prompt: string;
    promptVersion: string;
  }) => Promise<unknown>;
  stageAttestation?: (input: {
    ownerUserId: string;
    request: RecommendationRequest;
    response: import('../../../shared/recommendation/schemas.ts').RecommendDateResponse;
  }) => Promise<import('../../../shared/recommendation/schemas.ts').RecommendDateResponse | void>;
  onCourseValidationFailure?: (stage: CourseValidationFailureStage) => void;
  /** 응답과 무관한 부가 기록(장소 원장). 던져도 무시된다 — 원본 흐름을 절대 실패시키지 않는다. */
  recordPlaceKnowledge?: (input: { places: PlaceCandidate[] }) => void;
  /** course_generate만 보호한다. Edge 어댑터가 반드시 주입하며, 테스트에서는 선택적으로 대체한다. */
  rateLimit?: {
    acquire: (input: { userId: string; requestId: string }) => Promise<LockResult>;
    release: (input: { userId: string; requestId: string }) => Promise<void>;
    consume: (input: { userId: string; requestId: string }) => Promise<QuotaResult>;
    releaseQuota?: (input: { userId: string; consumptionId: number }) => Promise<void>;
    recordEvent: (input: { userId: string; eventType: 'lock_conflict' | 'burst_rejected' | 'daily_rejected' }) => Promise<void>;
  };
  now?: () => string;
};

export type CourseValidationFailureStage =
  | 'course_build'
  | 'response_schema'
  | 'request_response_validation'
  | 'replacement_rank_attestation'
  | 'stage_attestation';

export type RecommendDateHandlerResult = {
  status: number;
  body: unknown;
  observability?: {
    sessionId: string;
    historyExperiment?: HistoryExperimentResolution;
  };
};

const errorResult = (
  status: number,
  code: Parameters<typeof createRecommendationError>[0],
): RecommendDateHandlerResult => ({
  status,
  body: { error: createRecommendationError(code) },
});

function rateLimitResult(
  status: number,
  code: Parameters<typeof createRecommendationError>[0],
  detail: Record<string, string | number>,
): RecommendDateHandlerResult {
  return { status, body: { error: { ...createRecommendationError(code), ...detail } } };
}

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
  // Client-side parsedPreferences is legacy/untrusted. Course free text is prompt-only,
  // so it must not be promoted to structured search, ranking, or exclusion constraints.
  const { parsedPreferences: _untrustedParsedPreferences, ...trustedRequest } = parsedRequest.data;
  const serverRequest = trustedRequest;

  let lockAcquired = false;
  if (dependencies.rateLimit) {
    try {
      const lock = await dependencies.rateLimit.acquire({
        userId: authenticatedUser.id,
        requestId: serverRequest.requestId,
      });
      if (!lock.acquired) {
        void dependencies.rateLimit.recordEvent({ userId: authenticatedUser.id, eventType: 'lock_conflict' }).catch(() => undefined);
        return rateLimitResult(409, 'AI_REQUEST_ALREADY_RUNNING', { retryAfterSeconds: lock.retryAfterSeconds });
      }
      lockAcquired = true;
    } catch {
      return errorResult(503, 'AI_LIMIT_UNAVAILABLE');
    }
  }

  try {

  // Structured tags are resolved once per request. Additional free text is prompt-only.
  const resolved = await resolveStepIntents(serverRequest);
  const intentAwareRequest = {
    ...serverRequest,
    resolvedStepIntents: resolved.stepIntents,
    resolvedExcludedIntents: resolved.excludedIntents,
  };

  let history = EMPTY_RECOMMENDATION_HISTORY;
  let historyExperimentMetadata: HistoryExperimentResolution | undefined;
  if (dependencies.historyExperiment && dependencies.historyExperiment.mode !== 'off') {
    let assignmentContext: { coupleId?: string | null; persistedAssignedVariant?: HistoryExperimentVariant; assignmentScopeFailed?: boolean } = {};
    try {
      assignmentContext = await dependencies.historyExperiment.resolveAssignmentContext?.({
        authenticatedUserId: authenticatedUser.id,
        request: intentAwareRequest,
      }) ?? {};
    } catch {
      // A scope lookup may only narrow a pair assignment to the authenticated user.
    }
    const resolve = (historyLoadStatus: HistoryExperimentResolution['historyLoad']) => resolveHistoryExperiment({
      mode: dependencies.historyExperiment!.mode,
      userId: authenticatedUser.id,
      coupleId: assignmentContext.coupleId,
      persistedAssignedVariant: assignmentContext.persistedAssignedVariant,
      historyLoadStatus,
    });
    historyExperimentMetadata = assignmentContext.assignmentScopeFailed
      ? { assignedVariant: 'control', effectiveVariant: 'control', assignmentUnit: 'user', historyLoad: 'not_attempted' }
      : resolve('not_attempted');
    if (historyExperimentMetadata.assignedVariant === 'treatment') {
      try {
        const loaded = dependencies.loadHistory
          ? await dependencies.loadHistory({ authenticatedUserId: authenticatedUser.id, request: intentAwareRequest })
          : { context: EMPTY_RECOMMENDATION_HISTORY, status: 'failed' as const, recentHistoryExcludedCount: 0 };
        if (loaded.status === 'loaded') history = loaded.context;
        historyExperimentMetadata = resolve(loaded.status);
      } catch {
        historyExperimentMetadata = resolve('failed');
      }
    }
  }
  const withHistory = (result: RecommendDateHandlerResult): RecommendDateHandlerResult => ({
    ...result,
    observability: {
      sessionId: serverRequest.sessionId ?? serverRequest.requestId,
      ...(historyExperimentMetadata ? { historyExperiment: historyExperimentMetadata } : {}),
    },
  });
  let quotaConsumptionId: number | undefined;
  const refundQuota = async () => {
    const consumptionId = quotaConsumptionId;
    quotaConsumptionId = undefined;
    if (consumptionId === undefined || !dependencies.rateLimit?.releaseQuota) return;
    try {
      await dependencies.rateLimit.releaseQuota({ userId: authenticatedUser.id, consumptionId });
    } catch {
      // Quota cleanup is best effort. The response must keep its sanitized failure contract.
    }
  };
  const refundedCourseValidationFailure = async (stage: CourseValidationFailureStage) => {
    await refundQuota();
    return courseValidationFailure(dependencies, stage);
  };

  // Provider-neutral discovery also serves editable sessions. Preserved steps
  // are injected into their own pools by the discovery adapter, so a session
  // regeneration cannot drift them or require a Kakao compatibility ID.
  const hasStructuredStepTags = serverRequest.courseSteps.some((step) => (step.intentTags?.length ?? 0) > 0);
  const canUseProviderNeutralPath = Boolean(dependencies.searchProviderNeutralCandidates)
    // Structured tags are now represented in Naver query evidence and checked
    // again during provider-neutral selection. Legacy free-text intents keep
    // the established Kakao pipeline until their separate rollout contract is
    // explicitly changed.
    && (hasStructuredStepTags || (resolved.stepIntents.length === 0 && resolved.excludedIntents.length === 0))
    && serverRequest.location.source !== 'current'
    && !serverRequest.courseSteps.some((step) => step.pinnedKakaoPlaceId);
  if (canUseProviderNeutralPath) {
    let providerDiscovery: ProviderNeutralDiscoveryResult;
    try {
      providerDiscovery = await dependencies.searchProviderNeutralCandidates!(intentAwareRequest, history);
    } catch {
      return withHistory(errorResult(504, 'PLACE_SEARCH_TIMEOUT'));
    }
    const providerNeutralFailure = (stage: 'candidate_count' | 'selection_unavailable') => {
      const candidateCategories = providerDiscovery.candidates.reduce<Record<string, number>>((counts, candidate) => {
        const category = candidate.place.category.normalized;
        counts[category] = (counts[category] ?? 0) + 1;
        return counts;
      }, {});
      dependencies.onProviderNeutralFailure?.({
        requestId: serverRequest.requestId,
        stage,
        requestedCategories: serverRequest.courseSteps.map((step) => step.category),
        candidateCount: providerDiscovery.candidates.length,
        candidateCategories,
      });
    };
    const providerPools = providerDiscovery.pools ?? [];
    const selectableCandidates = providerPools.length > 0
      ? providerPools.flatMap((pool) => pool.selectableCandidates)
      : providerDiscovery.candidates;
    const requiredIntents = resolved.stepIntents.filter((intent) => intent.strength === 'required');
    const unsatisfiedIntents = requiredIntents.filter((intent) => {
      const step = serverRequest.courseSteps.find((candidate) => candidate.id === intent.stepId);
      const pool = providerPools.find((candidatePool) => candidatePool.stepId === intent.stepId);
      const candidatesForStep = pool?.selectableCandidates ?? selectableCandidates;
      if (serverRequest.replacement?.stepId === intent.stepId) return false;
      return !step || !candidatesForStep.some((candidate) => (
        providerNeutralPlaceMatchesStep(candidate.place, step, intent, { allowProviderSearchEvidence: true })
      ));
    });
    if (unsatisfiedIntents.length > 0) {
      return withHistory({
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
      });
    }
    if ((providerPools.length > 0 && providerPools.some((pool) => !pool.sufficient))
      || (providerPools.length === 0 && providerDiscovery.candidates.length < serverRequest.courseSteps.length)) {
      providerNeutralFailure('candidate_count');
      return withHistory(errorResult(422, 'INSUFFICIENT_CANDIDATES'));
    }
    const deterministicSelection = (): { steps: Array<{ stepId: string; candidateId: string }> } | undefined => {
      const used = new Set<string>();
      const selectedPlaces: ProviderNeutralCandidate[] = [];
      const steps = serverRequest.courseSteps.map((step) => {
        const intent = requiredIntents.find((candidate) => candidate.stepId === step.id);
        const pool = providerPools.find((candidatePool) => candidatePool.stepId === step.id);
        const candidatesForStep = pool?.selectableCandidates ?? selectableCandidates;
        const candidate = candidatesForStep.find((entry) => (
          !used.has(entry.candidateId)
          && !selectedPlaces.some((selected) => isSamePhysicalPlace(selected.place, entry.place))
          && (!serverRequest.replacement || serverRequest.replacement.stepId !== step.id
            || (entry.place.identity.provider === 'kakao'
              && entry.place.identity.providerPlaceId === serverRequest.replacement.kakaoPlaceId))
          && (serverRequest.replacement?.stepId === step.id
            || providerNeutralPlaceMatchesStep(entry.place, step, intent, { allowProviderSearchEvidence: true }))
        ));
        if (!candidate) return undefined;
        used.add(candidate.candidateId);
        selectedPlaces.push(candidate);
        return { stepId: step.id, candidateId: candidate.candidateId };
      });
      return steps.every((step): step is { stepId: string; candidateId: string } => Boolean(step)) ? { steps } : undefined;
    };
    let fallbackUsed = false;
    let selectionReason: 'none' | 'ai_timeout' | 'ai_malformed' | 'ai_invalid_selection' | 'ai_route_constraint' | 'ai_unavailable' = 'none';
    let selection: unknown;
    if (dependencies.rateLimit) {
      try {
        const quota = await dependencies.rateLimit.consume({ userId: authenticatedUser.id, requestId: serverRequest.requestId });
        quotaConsumptionId = quota.allowed ? quota.consumptionId : undefined;
        if (!quota.allowed) return quota.limitType === 'burst'
          ? withHistory(rateLimitResult(429, 'AI_RATE_LIMITED', { limitType: 'burst', retryAfterSeconds: quota.retryAfterSeconds }))
          : withHistory(rateLimitResult(429, 'AI_DAILY_LIMIT_REACHED', { limitType: 'daily', resetsAt: quota.resetsAt }));
      } catch {
        return withHistory(errorResult(503, 'AI_LIMIT_UNAVAILABLE'));
      }
    }
    try {
      selection = await dependencies.generateSelection({
        authorization,
        prompt: buildProviderNeutralRecommendationPrompt(intentAwareRequest, providerPools.length > 0 ? providerPools : providerDiscovery.candidates),
        promptVersion: RECOMMEND_DATE_PROMPT_VERSION,
      });
    } catch (error) {
      fallbackUsed = true;
      selectionReason = error instanceof RecommendDateDownstreamTimeoutError ? 'ai_timeout' : 'ai_unavailable';
      selection = deterministicSelection();
    }
    if (!fallbackUsed && !candidateOnlySelectionSchema.safeParse(selection).success) {
      fallbackUsed = true;
      selectionReason = 'ai_malformed';
      selection = deterministicSelection();
    }
    if (!selection) {
      providerNeutralFailure('selection_unavailable');
      return withHistory(errorResult(422, 'INSUFFICIENT_CANDIDATES'));
    }
    let built: ReturnType<typeof buildProviderNeutralCourse>;
    try {
      built = buildProviderNeutralCourse({
        request: intentAwareRequest,
        ...(providerPools.length > 0 ? { pools: providerPools } : { candidates: providerDiscovery.candidates }),
        selection,
        generatedAt: dependencies.now?.() ?? new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof ProviderNeutralCourseSelectionError && !fallbackUsed) {
        fallbackUsed = true;
        selectionReason = 'ai_invalid_selection';
        const deterministic = deterministicSelection();
        if (!deterministic) {
          providerNeutralFailure('selection_unavailable');
          return withHistory(errorResult(422, 'INSUFFICIENT_CANDIDATES'));
        }
        try {
          built = buildProviderNeutralCourse({
            request: intentAwareRequest,
            ...(providerPools.length > 0 ? { pools: providerPools } : { candidates: providerDiscovery.candidates }),
            selection: deterministic,
            generatedAt: dependencies.now?.() ?? new Date().toISOString(),
          });
        } catch {
          return withHistory(errorResult(422, 'COURSE_VALIDATION_FAILED'));
        }
      } else if (error instanceof ProviderNeutralCourseSelectionError) {
        return withHistory(await refundedCourseValidationFailure('course_build'));
      } else {
        return withHistory(await refundedCourseValidationFailure('course_build'));
      }
    }
    let linkedCourse = built.course;
    let linkedCards = built.cards;
    if (dependencies.resolveProviderNeutralKakaoLinks) {
      try {
        const selected = selectableCandidates.filter((candidate) => (
          candidate.place.identity.provider === 'naver'
          && built.course.steps.some((step) => step.candidateId === candidate.candidateId)
        ));
        const links = await dependencies.resolveProviderNeutralKakaoLinks({
          requestId: serverRequest.requestId,
          candidates: selected,
        });
        if (links.size > 0) {
          linkedCourse = {
            ...built.course,
            steps: built.course.steps.map((step) => {
              const link = links.get(step.candidateId);
              return link ? { ...step, kakaoPlaceId: link.kakaoPlaceId, mapUrl: link.mapUrl } : step;
            }),
          };
          linkedCards = built.cards.map((card) => ({
            ...card,
            steps: card.steps?.map((step) => {
              const link = step.candidateId ? links.get(step.candidateId) : undefined;
              return link ? { ...step, kakaoPlaceId: link.kakaoPlaceId, map_url: link.mapUrl } : step;
            }),
          }));
        }
      } catch {
        // The link is optional convenience metadata. It must not make a
        // quality-qualified recommendation unavailable.
      }
    }
    const response = recommendDateResponseSchema.safeParse({
      requestId: serverRequest.requestId,
      course: linkedCourse,
      cards: linkedCards,
      candidatePool: selectableCandidates.map((candidate, index) => ({
        candidateId: candidate.candidateId,
        ...(candidate.sourceStepId ? { sourceStepId: candidate.sourceStepId } : {}),
        placeIdentity: candidate.place.identity,
        category: candidate.place.category.normalized,
        ...(candidate.qualification ? { qualification: candidate.qualification } : {}),
        rank: index + 1,
        totalScore: candidate.popularityBonus,
        scoreBreakdown: { intent: 0, distance: 0, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: candidate.popularityBonus },
        distanceFromSearchCenterMeters: candidate.distanceFromSearchCenterMeters,
        priceAtRanking: { source: 'unknown', minKRW: null, maxKRW: null },
        selectedInitially: built.course.steps.some((step) => step.candidateId === candidate.candidateId),
        forced: false,
        pinned: false,
        reintroducedByHistory: false,
      })),
      metadata: {
        fallbackUsed,
        selectionSource: fallbackUsed ? 'deterministic_fallback' : 'ai',
        selectionReason,
        search: {
          requestCount: providerDiscovery.discovery.attemptsRun,
          successfulCount: providerDiscovery.discovery.attemptsRun,
          failedCount: 0,
          rateLimitedCount: 0,
          timeoutCount: 0,
          candidateCount: providerDiscovery.candidates.length,
        },
        route: built.route,
      },
    });
    if (!response.success) return withHistory(await refundedCourseValidationFailure('response_schema'));
    try {
      validateRecommendDateResponseForRequest(serverRequest, response.data);
    } catch {
      return withHistory(await refundedCourseValidationFailure('request_response_validation'));
    }
    let attestedResponse = response.data;
    if (dependencies.stageAttestation) {
      try {
        const existingResponse = await dependencies.stageAttestation({ ownerUserId: authenticatedUser.id, request: serverRequest, response: response.data });
        if (existingResponse) {
          const parsedExisting = recommendDateResponseSchema.safeParse(existingResponse);
          if (!parsedExisting.success) throw new Error('existing attestation response is invalid');
          validateRecommendDateResponseForRequest(serverRequest, parsedExisting.data);
          attestedResponse = parsedExisting.data;
        }
      } catch {
        return withHistory(await refundedCourseValidationFailure('stage_attestation'));
      }
    }
    return withHistory({ status: 200, body: attestedResponse });
  }

  let search: RecommendationSearchPipelineResult;
  try {
    search = await dependencies.searchCandidates(intentAwareRequest, history);
  } catch {
    return withHistory(errorResult(504, 'PLACE_SEARCH_TIMEOUT'));
  }

  if (search.searchMetadata.allSearchesFailed && search.searchMetadata.rateLimitedCount > 0) {
    return withHistory(errorResult(429, 'PLACE_SEARCH_RATE_LIMITED'));
  }
  if (search.searchMetadata.allSearchesFailed && search.searchMetadata.timeoutCount > 0) {
    return withHistory(errorResult(504, 'PLACE_SEARCH_TIMEOUT'));
  }
  // 이번 호출에서 실제로 핀 장소를 다시 골라야 하는 스텝만 핀으로 취급한다. 잠긴 스텝은 락이
  // 자리(장소 사실)를 그대로 운반하고, 교체 대상 스텝은 핀에서 떠나는 중이며, 핀 장소가
  // excludedPlaceIds에 있으면 호출자가 명시적으로 그 자리를 떠나라고 요구한 것이다. 세 경우 모두
  // 핀 실재 게이트와 핀 강제(pin wins)의 대상이 아니다 — 여기서 걸러내지 않으면 재추천·교체가
  // 자기 핀과 충돌해 항상 422로 실패한다.
  const requestLockedStepIds = new Set((serverRequest.lockedSteps ?? []).map((step) => step.stepId));
  const requestExcludedPlaceIds = new Set(serverRequest.excludedPlaceIds ?? []);
  const pinnedStepIds = new Set(
    serverRequest.courseSteps.filter((step) => (
      step.pinnedKakaoPlaceId
      && !requestLockedStepIds.has(step.id)
      && step.id !== serverRequest.replacement?.stepId
      && !requestExcludedPlaceIds.has(step.pinnedKakaoPlaceId)
    )).map((step) => step.id),
  );
  // 핀 비활성 스텝은 하위 선택·프롬프트·폴백 전 단계에서 일반 스텝으로 취급되도록 핀을 벗긴다.
  const effectiveCourseSteps = serverRequest.courseSteps.map((step) => (
    step.pinnedKakaoPlaceId && !pinnedStepIds.has(step.id)
      ? { ...step, pinnedKakaoPlaceId: undefined, pinnedName: undefined }
      : step
  ));
  // 입력 시점 지정 장소: 파이프라인이 이름 재검색으로 병합한 뒤에도 후보 풀에 없으면 실재 검증 실패.
  for (const step of effectiveCourseSteps) {
    if (step.pinnedKakaoPlaceId
      && !search.candidates.some((candidate) => candidate.kakaoPlaceId === step.pinnedKakaoPlaceId)) {
      return withHistory(errorResult(422, 'STEP_PIN_UNAVAILABLE'));
    }
  }
  // 핀 스텝은 카테고리를 이기므로(pin wins) 카테고리 충족 게이트에서 제외한다.
  const hasEveryRequiredCategory = serverRequest.courseSteps.every((step) => (
    pinnedStepIds.has(step.id)
    || search.candidates.some((candidate) => candidateMatchesCategory(candidate, step.category))
  ));
  if (search.candidates.length === 0 || !hasEveryRequiredCategory) {
    return withHistory(errorResult(422, 'INSUFFICIENT_CANDIDATES'));
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
    return withHistory({
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
    });
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
        return withHistory(errorResult(422, 'COURSE_VALIDATION_FAILED'));
      }
      built = buildCandidateOnlyCourse({
        request: { ...intentAwareRequest, courseSteps: effectiveCourseSteps },
        candidates: search.candidates,
        history,
        reintroducedPlaceIds: search.reintroducedPlaceIds,
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
        request: { ...intentAwareRequest, courseSteps: effectiveCourseSteps },
        candidates: search.candidates,
        history,
        reintroducedPlaceIds: search.reintroducedPlaceIds,
        selection: {
          steps: forcePinnedCandidateIds(
            serverRequest.courseSteps.map((step) => ({ stepId: step.id, candidateId: '' })),
            effectiveCourseSteps,
            search.candidates,
          ),
        },
        generatedAt,
      });
    }
    if (!built) {
      if (dependencies.rateLimit) {
        let quota: QuotaResult;
        try {
          quota = await dependencies.rateLimit.consume({ userId: authenticatedUser.id, requestId: serverRequest.requestId });
          quotaConsumptionId = quota.allowed ? quota.consumptionId : undefined;
        } catch {
          return withHistory(errorResult(503, 'AI_LIMIT_UNAVAILABLE'));
        }
        if (!quota.allowed) {
          const eventType = quota.limitType === 'burst' ? 'burst_rejected' : 'daily_rejected';
          void dependencies.rateLimit.recordEvent({ userId: authenticatedUser.id, eventType }).catch(() => undefined);
          return quota.limitType === 'burst'
            ? withHistory(rateLimitResult(429, 'AI_RATE_LIMITED', { limitType: 'burst', retryAfterSeconds: quota.retryAfterSeconds }))
            : withHistory(rateLimitResult(429, 'AI_DAILY_LIMIT_REACHED', { limitType: 'daily', resetsAt: quota.resetsAt }));
        }
      }
      let downstream: unknown;
      try {
        downstream = await dependencies.generateSelection({
          authorization,
          prompt: buildRecommendationPrompt({ ...intentAwareRequest, courseSteps: effectiveCourseSteps }, search.candidates),
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
              ? { steps: forcePinnedCandidateIds(parsedSelection.data.steps, effectiveCourseSteps, search.candidates) }
              : parsedSelection.data;
            built = buildCandidateOnlyCourse({
              // The final AI selection must use the same server-resolved intent
              // context as the pre-search gate and deterministic fallback.
              // Using serverRequest here silently dropped resolvedStepIntents,
              // allowing a category-only AI choice to bypass a selected tag.
              request: { ...intentAwareRequest, courseSteps: effectiveCourseSteps },
              candidates: search.candidates,
              history,
              reintroducedPlaceIds: search.reintroducedPlaceIds,
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
        request: { ...intentAwareRequest, courseSteps: effectiveCourseSteps },
        candidates: search.candidates,
        history,
        reintroducedPlaceIds: search.reintroducedPlaceIds,
        generatedAt,
      });
    }
  } catch (error) {
    if (error instanceof CourseSelectionError) {
      if (error.code === 'COURSE_VALIDATION_FAILED') {
        return withHistory(await refundedCourseValidationFailure('course_build'));
      }
      return withHistory(errorResult(422, error.code));
    }
    return withHistory(await refundedCourseValidationFailure('course_build'));
  }

  let verifiedReplacementCandidateRank: number | undefined;
  if (serverRequest.replacement?.candidateListAttestationId && serverRequest.sessionId) {
    try {
      verifiedReplacementCandidateRank = await dependencies.loadReplacementCandidateRank?.({
        authenticatedUserId: authenticatedUser.id,
        sessionId: serverRequest.sessionId,
        targetStepId: serverRequest.replacement.stepId,
        kakaoPlaceId: serverRequest.replacement.kakaoPlaceId,
        candidateListAttestationId: serverRequest.replacement.candidateListAttestationId,
      });
    } catch {
      return withHistory(courseValidationFailure(dependencies, 'replacement_rank_attestation'));
    }
    if (verifiedReplacementCandidateRank === undefined) {
      return withHistory(courseValidationFailure(dependencies, 'replacement_rank_attestation'));
    }
  }
  const response = recommendDateResponseSchema.safeParse({
    requestId: parsedRequest.data.requestId,
    course: built.course,
    cards: built.cards,
    candidatePool: buildCandidatePoolSnapshots({
      candidates: search.candidates,
      selectedKakaoPlaceIds: built.course.steps
        .map((step) => step.kakaoPlaceId)
        .filter((id): id is string => Boolean(id)),
      forcedKakaoPlaceId: serverRequest.replacement?.kakaoPlaceId,
      pinnedKakaoPlaceIds: [
        ...serverRequest.courseSteps.map((step) => step.pinnedKakaoPlaceId),
        ...(serverRequest.lockedSteps ?? []).map((step) => step.kakaoPlaceId),
      ].filter((id): id is string => Boolean(id)),
      reintroducedPlaceIds: search.reintroducedPlaceIds,
    }),
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
      ...(historyExperimentMetadata ? {
        historyExperiment: {
          name: 'history-diversity-v1' as const,
          ...historyExperimentMetadata,
          recentHistoryExcludedCount: search.recentHistoryExcludedCount ?? 0,
          recentCooldownRelaxed: built.course.relaxedConstraints.some((constraint) => (
            constraint.constraint === 'recentPlaceCooldown'
          )),
        },
      } : {}),
      ...(verifiedReplacementCandidateRank === undefined ? {} : { replacementCandidateRank: verifiedReplacementCandidateRank }),
      ...(resolved.source !== 'none' || resolved.unsupported.length > 0 || resolved.conflicts.length > 0
        ? {
          stepIntent: {
            parserSource: resolved.source,
            aiFallbackUsed: false,
            verifiedCanonicalTerms: resolved.stepIntents
              .filter((intent) => search.candidates.some((candidate) => placeMatchesStepIntent(candidate, intent)))
              .map((intent) => intent.canonicalTerm),
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
  if (!response.success) return withHistory(await refundedCourseValidationFailure('response_schema'));
  if (!response.data.candidatePool) return withHistory(await refundedCourseValidationFailure('response_schema'));
  try {
    validateRecommendDateResponseForRequest(serverRequest, response.data);
  } catch {
    return withHistory(await refundedCourseValidationFailure('request_response_validation'));
  }
  let attestedLegacyResponse = response.data;
  if (dependencies.stageAttestation) {
    try {
      const existingResponse = await dependencies.stageAttestation({ ownerUserId: authenticatedUser.id, request: serverRequest, response: response.data });
      if (existingResponse) {
        const parsedExisting = recommendDateResponseSchema.safeParse(existingResponse);
        if (!parsedExisting.success) throw new Error('existing attestation response is invalid');
        validateRecommendDateResponseForRequest(serverRequest, parsedExisting.data);
        attestedLegacyResponse = parsedExisting.data;
      }
    } catch {
      return withHistory(await refundedCourseValidationFailure('stage_attestation'));
    }
  }
  if (dependencies.recordPlaceKnowledge) {
    try {
      // 응답 스텝에는 Kakao 세분 카테고리가 없다 — 후보 풀에서 kakaoPlaceId로 역참조한다.
      // 후보 풀에 없는 스텝(이전 세션에서 잠긴 장소)은 그때 이미 기록됐으므로 건너뛴다.
      const selectedPlaceIds = new Set(attestedLegacyResponse.course.steps.map((step) => step.kakaoPlaceId));
      dependencies.recordPlaceKnowledge({
        places: search.candidates.filter((candidate) => selectedPlaceIds.has(candidate.kakaoPlaceId)),
      });
    } catch { /* 부가 기록은 응답을 막지 않는다 */ }
  }
  const { candidatePool: _candidatePool, ...publicResponse } = attestedLegacyResponse;
  return withHistory({ status: 200, body: publicResponse });
  } finally {
    if (lockAcquired) {
      try {
        await dependencies.rateLimit?.release({ userId: authenticatedUser.id, requestId: serverRequest.requestId });
      } catch {
        // A stale lock expires after its TTL; never replace a generated response with a release failure.
      }
    }
  }
}
