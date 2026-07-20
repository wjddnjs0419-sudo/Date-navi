import { z } from 'zod';

import type { LockedCourseStepInput, RecommendationErrorCode } from '../../../shared/recommendation/contracts.ts';
import {
  recommendationCourseSchema,
  recommendDateCardSchema,
  type RecommendDateCard,
  type RecommendationCourse,
  type RecommendationRequest,
} from '../../../shared/recommendation/schemas.ts';
import {
  calculateStraightLineRouteMetadata,
  type PlaceCandidate,
  type StraightLineRouteMetadata,
} from './recommendation-ranking.ts';
import { verifiedPlaceMatchesCategory } from './recommendation-category.ts';
import { effectiveStepIntents, placeMatchesStepIntent } from './step-intent.ts';

export const MAX_CANDIDATE_POOL_SIZE = 40;

const selectionStepSchema = z.object({
  stepId: z.string().trim().min(1).max(80),
  candidateId: z.string().trim().min(1).max(120),
}).strict();

export const candidateOnlySelectionSchema = z.object({
  steps: z.array(selectionStepSchema).min(2).max(4),
}).strict().superRefine((selection, ctx) => {
  if (new Set(selection.steps.map((step) => step.stepId)).size !== selection.steps.length) {
    ctx.addIssue({ code: 'custom', path: ['steps'], message: 'Step IDs must be unique.' });
  }
  if (new Set(selection.steps.map((step) => step.candidateId)).size !== selection.steps.length) {
    ctx.addIssue({ code: 'custom', path: ['steps'], message: 'Candidate IDs must be unique.' });
  }
});

export type CandidateOnlySelection = z.infer<typeof candidateOnlySelectionSchema>;

export class CourseSelectionError extends Error {
  constructor(public readonly code: Extract<RecommendationErrorCode, 'INSUFFICIENT_CANDIDATES' | 'COURSE_VALIDATION_FAILED'>) {
    super(code);
    this.name = 'CourseSelectionError';
  }
}

export function candidateMatchesCategory(candidate: PlaceCandidate, category: string): boolean {
  return verifiedPlaceMatchesCategory(candidate, category);
}

// A pin entry's `locked` field carries the user's actual persisted lock state; pins that omit it
// predate the field and were always genuinely locked.
function pinnedLockedFlag(lock: LockedCourseStepInput | undefined): boolean {
  return lock ? lock.locked !== false : false;
}

// Builds a PlaceCandidate directly from a locked step's own carried facts, bypassing this call's
// search results — the step's category was already verified when it was first created, and its
// candidateId/kakaoPlaceId are trusted pass-through identity, not re-derived here.
function candidateFromLock(lock: LockedCourseStepInput): PlaceCandidate {
  return {
    candidateId: lock.candidateId,
    kakaoPlaceId: lock.kakaoPlaceId,
    name: lock.name,
    categoryGroupCode: '',
    categoryGroupName: '',
    categoryName: '',
    address: lock.address,
    roadAddress: lock.roadAddress,
    latitude: lock.latitude,
    longitude: lock.longitude,
    mapUrl: lock.mapUrl,
    matchedSearchEvidence: [],
    distanceFromSearchCenterMeters: 0,
    score: 0,
    scoreBreakdown: {
      intent: 0, distance: 0, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0,
    },
  };
}

type CourseBuildInput = {
  request: RecommendationRequest;
  candidates: readonly PlaceCandidate[];
  selection: unknown;
  generatedAt: string;
};

type BuiltCandidateCourse = {
  course: RecommendationCourse;
  cards: RecommendDateCard[];
  route: StraightLineRouteMetadata;
};

function validateCandidatePool(request: RecommendationRequest, candidates: readonly PlaceCandidate[]): void {
  if (candidates.length > MAX_CANDIDATE_POOL_SIZE) {
    throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
  }
  const candidateIds = candidates.map((candidate) => candidate.candidateId);
  const kakaoPlaceIds = candidates.map((candidate) => candidate.kakaoPlaceId);
  if (new Set(candidateIds).size !== candidateIds.length || new Set(kakaoPlaceIds).size !== kakaoPlaceIds.length) {
    throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
  }
  const excludedPlaceIds = new Set(request.excludedPlaceIds ?? []);
  const excludedCategories = request.excludedCategories ?? [];
  if (candidates.some((candidate) => (
    excludedPlaceIds.has(candidate.kakaoPlaceId)
    || excludedCategories.some((category) => candidateMatchesCategory(candidate, category))
  ))) {
    throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
  }
}

function walkingRelaxation(request: RecommendationRequest, route: StraightLineRouteMetadata) {
  if (route.walkingLimitAssessment !== 'provisional_exceeded' || request.maxWalkingMinutes === undefined) return [];
  return [{
    constraint: 'maxWalkingMinutes',
    reason: request.language === 'ko'
      ? `${request.maxWalkingMinutes}분 기준 직선거리 휴리스틱을 넘는 구간이 있어 이 조건을 완화했어요.`
      : `One segment exceeds the ${request.maxWalkingMinutes}-minute straight-line heuristic, so this constraint was relaxed.`,
  }];
}

// Card texts are always built in BOTH languages so a couple with mismatched app
// languages each read the confirmed card in their own language. Top-level fields stay
// in the requester's language for legacy readers that predate the i18n block.
function buildCardTexts(request: RecommendationRequest) {
  return {
    ko: {
      title: `${request.location.label} 데이트 코스`,
      summary: '요청한 단계 순서에 맞춘 검증된 장소 코스예요.',
      why_recommended: '모든 장소를 검색 후보에서 확인했어요.',
    },
    en: {
      title: `${request.location.label} date course`,
      summary: 'A verified-place course in the requested step order.',
      why_recommended: 'Every place was verified against the search candidates.',
    },
  };
}

function buildCompatibilityCard(
  request: RecommendationRequest,
  selected: readonly PlaceCandidate[],
): RecommendDateCard {
  const i18n = buildCardTexts(request);
  const texts = i18n[request.language];
  return recommendDateCardSchema.parse({
    requestId: request.requestId,
    sessionId: request.sessionId ?? request.requestId,
    title: texts.title,
    summary: texts.summary,
    tags: request.courseSteps.map((step) => step.label),
    why_recommended: texts.why_recommended,
    i18n,
    steps: selected.map((candidate, index) => ({
      label: request.courseSteps[index].label,
      candidateId: candidate.candidateId,
      kakaoPlaceId: candidate.kakaoPlaceId,
      place_name: candidate.name,
      ...(candidate.roadAddress || candidate.address
        ? { place_address: candidate.roadAddress || candidate.address }
        : {}),
      ...(candidate.mapUrl ? { map_url: candidate.mapUrl } : {}),
    })),
  });
}

export function buildCandidateOnlyCourse(input: CourseBuildInput): BuiltCandidateCourse {
  if (input.request.mode !== 'course' || input.request.courseSteps.length < 2 || input.request.courseSteps.length > 4) {
    throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
  }
  validateCandidatePool(input.request, input.candidates);
  const parsed = candidateOnlySelectionSchema.safeParse(input.selection);
  if (!parsed.success || parsed.data.steps.length !== input.request.courseSteps.length) {
    throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
  }
  const byCandidateId = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const locks = new Map((input.request.lockedSteps ?? []).map((lock) => [lock.stepId, lock]));
  const requiredIntents = new Map(
    effectiveStepIntents(input.request)
      .filter((intent) => intent.strength === 'required')
      .map((intent) => [intent.stepId, intent]),
  );
  const selected: PlaceCandidate[] = [];
  for (let index = 0; index < input.request.courseSteps.length; index++) {
    const requestedStep = input.request.courseSteps[index];
    const selectedStep = parsed.data.steps[index];
    if (selectedStep.stepId !== requestedStep.id) throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
    const lock = locks.get(requestedStep.id);
    let candidate: PlaceCandidate | undefined;
    if (lock) {
      // A locked step's candidateId is only stable within the search call that minted it, so a
      // fresh search will almost never return it again. Pin the step from the lock's own carried
      // facts instead of requiring it to reappear in this call's candidate pool.
      if (selectedStep.candidateId !== lock.candidateId) throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
      candidate = candidateFromLock(lock);
    } else if (requestedStep.pinnedKakaoPlaceId) {
      // 사용자가 입력 시점에 직접 지정한 장소: 지정이 카테고리·intent를 이긴다(pin wins). 서버가 이미
      // 이름 재검색으로 후보 풀에 병합·실재 검증했으므로 kakaoPlaceId 일치만 확인한다.
      candidate = byCandidateId.get(selectedStep.candidateId);
      if (!candidate || candidate.kakaoPlaceId !== requestedStep.pinnedKakaoPlaceId) {
        throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
      }
    } else {
      candidate = byCandidateId.get(selectedStep.candidateId);
      if (!candidate || !candidateMatchesCategory(candidate, requestedStep.category)) {
        throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
      }
      const requiredIntent = requiredIntents.get(requestedStep.id);
      if (requiredIntent && !placeMatchesStepIntent(candidate, requiredIntent)) {
        throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
      }
    }
    selected.push(candidate);
  }
  if (new Set(selected.map((candidate) => candidate.kakaoPlaceId)).size !== selected.length) {
    throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
  }
  for (const lock of locks.values()) {
    const requestedIndex = input.request.courseSteps.findIndex((step) => step.id === lock.stepId);
    if (requestedIndex < 0 || selected[requestedIndex]?.candidateId !== lock.candidateId) {
      throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
    }
  }

  const route = calculateStraightLineRouteMetadata(selected, input.request.maxWalkingMinutes);
  const course = recommendationCourseSchema.parse({
    requestId: input.request.requestId,
    sessionId: input.request.sessionId ?? input.request.requestId,
    steps: selected.map((candidate, index) => ({
      stepId: input.request.courseSteps[index].id,
      order: index + 1,
      category: input.request.courseSteps[index].category,
      label: input.request.courseSteps[index].label,
      candidateId: candidate.candidateId,
      kakaoPlaceId: candidate.kakaoPlaceId,
      name: candidate.name,
      address: candidate.address,
      roadAddress: candidate.roadAddress,
      mapUrl: candidate.mapUrl,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      reason: input.request.language === 'ko' ? '검증된 카카오 검색 후보예요.' : 'Verified Kakao search candidate.',
      // A pin keeps the place fixed for this call only; the echoed locked flag must reflect the
      // user's persisted lock state (lock.locked, default true for legacy pins) or the mutation
      // RPC rejects the response for flag drift on steps the user never locked.
      locked: pinnedLockedFlag(locks.get(input.request.courseSteps[index].id)),
    })),
    relaxedConstraints: walkingRelaxation(input.request, route),
    generatedAt: input.generatedAt,
  });
  return { course, cards: [buildCompatibilityCard(input.request, selected)], route };
}

type DeterministicCourseInput = Omit<CourseBuildInput, 'selection'>;

export function buildDeterministicCandidateCourse(input: DeterministicCourseInput): BuiltCandidateCourse {
  validateCandidatePool(input.request, input.candidates);
  const locks = new Map((input.request.lockedSteps ?? []).map((lock) => [lock.stepId, lock]));
  const compareStable = (a: PlaceCandidate, b: PlaceCandidate) => (
    b.score - a.score
    || a.distanceFromSearchCenterMeters - b.distanceFromSearchCenterMeters
    || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId)
  );
  const stepIntents = effectiveStepIntents(input.request);
  const intentByStepId = new Map(stepIntents.map((intent) => [intent.stepId, intent]));
  const choices = input.request.courseSteps.map((step) => {
    const lock = locks.get(step.id);
    if (lock) {
      // Same rationale as buildCandidateOnlyCourse: don't require the locked place to reappear
      // in this call's fresh candidate pool, pin it from its own carried facts instead.
      return [candidateFromLock(lock)];
    }
    if (step.pinnedKakaoPlaceId) {
      // 입력 시점 지정 장소는 결정론 폴백에서도 그대로 강제(카테고리 무시).
      const pinned = input.candidates.find((candidate) => candidate.kakaoPlaceId === step.pinnedKakaoPlaceId);
      if (!pinned) throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
      return [pinned];
    }
    const categoryEligible = input.candidates
      .filter((candidate) => candidateMatchesCategory(candidate, step.category));
    const intent = intentByStepId.get(step.id);
    // required intent만 매칭 후보로 hard 제한한다. preferred는 soft preference이므로 카테고리 후보
    // 전체를 score 정렬로 넘긴다(랭킹의 +35/+20 우대로 매칭 후보가 앞서고, 매칭이 route를 못 이루면
    // 비매칭 후보로 완화). spec §18.4: soft preference는 hard 필터를 걸지 않는다.
    const eligible = intent?.strength === 'required'
      ? categoryEligible.filter((candidate) => placeMatchesStepIntent(candidate, intent))
      : categoryEligible;
    const sorted = [...eligible].sort(compareStable);
    if (sorted.length === 0) throw new CourseSelectionError('INSUFFICIENT_CANDIDATES');
    return sorted;
  });

  type AssessedRoute = {
    route: PlaceCandidate[];
    metadata: StraightLineRouteMetadata;
    score: number;
    stableIds: string;
  };
  let best: AssessedRoute | undefined;
  const compareRoute = (a: AssessedRoute, b: AssessedRoute) => {
    const withinA = a.metadata.walkingLimitAssessment !== 'provisional_exceeded' ? 0 : 1;
    const withinB = b.metadata.walkingLimitAssessment !== 'provisional_exceeded' ? 0 : 1;
    return withinA - withinB
      || a.metadata.totalDistanceMeters - b.metadata.totalDistanceMeters
      || b.score - a.score
      || a.stableIds.localeCompare(b.stableIds);
  };
  const route: PlaceCandidate[] = [];
  const usedCandidateIds = new Set<string>();
  const usedPlaceIds = new Set<string>();
  const visit = (stepIndex: number) => {
    if (stepIndex === choices.length) {
      const assessed: AssessedRoute = {
        route: [...route],
        metadata: calculateStraightLineRouteMetadata(route, input.request.maxWalkingMinutes),
        score: route.reduce((sum, candidate) => sum + candidate.score, 0),
        stableIds: route.map((candidate) => candidate.kakaoPlaceId).join('|'),
      };
      if (!best || compareRoute(assessed, best) < 0) best = assessed;
      return;
    }
    for (const candidate of choices[stepIndex]) {
      if (usedCandidateIds.has(candidate.candidateId) || usedPlaceIds.has(candidate.kakaoPlaceId)) continue;
      route.push(candidate);
      usedCandidateIds.add(candidate.candidateId);
      usedPlaceIds.add(candidate.kakaoPlaceId);
      visit(stepIndex + 1);
      route.pop();
      usedCandidateIds.delete(candidate.candidateId);
      usedPlaceIds.delete(candidate.kakaoPlaceId);
    }
  };
  visit(0);
  if (!best) throw new CourseSelectionError('COURSE_VALIDATION_FAILED');
  const chosen = best.route;
  return buildCandidateOnlyCourse({
    ...input,
    selection: {
      steps: input.request.courseSteps.map((step, index) => ({
        stepId: step.id,
        candidateId: chosen[index].candidateId,
      })),
    },
  });
}
