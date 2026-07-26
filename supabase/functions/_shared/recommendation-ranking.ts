import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import type {
  EvidencedKakaoPlace,
  SearchEvidence,
} from './recommendation-search.ts';
import {
  isUnfitDatePlace,
  normalizeRecommendationCategory,
  verifiedPlaceMatchesCategory,
} from './recommendation-category.ts';
import { effectiveStepIntents, effectiveExcludedIntents } from './step-intent.ts';
import { placeMatchesStepIntent } from './step-intent.ts';
import {
  behaviorScoreFor,
  diversityScoreFor,
  type RecommendationHistoryContext,
} from '../../../shared/recommendation/recommendation-history.ts';

export const RANKING_SCORE_WEIGHTS = {
  requiredCategory: 40,
  explicitKeywordEvidence: 20,
  distanceMax: 20,
  routeFitMax: 10,
  categoryRecall: 5,
  exclusionPenalty: -100,
  stepIntentExact: 35,
  stepIntentNameMatch: 20,
  stepIntentExpansion1: 12,
  stepIntentExpansion2: 6,
  stepIntentNegatedPenalty: -60,
} as const;

export type CandidateScoreBreakdown = {
  intent: number;
  distance: number;
  budget: number;
  preference: number;
  routeFit: number;
  diversity: number;
  behavior: number;
  penalty: number;
  categoryRecall?: number;
};

export type PlaceCandidate = EvidencedKakaoPlace & {
  candidateId: string;
  distanceFromSearchCenterMeters: number;
  score: number;
  scoreBreakdown: CandidateScoreBreakdown;
};

export type RankedRecommendationSearch = {
  candidates: PlaceCandidate[];
  recallByCategory: Record<string, number>;
  /** Optional for pre-history search fixtures and legacy caller compatibility. */
  recentHistoryExcludedCount?: number;
  /** Optional for pre-history search fixtures and legacy caller compatibility. */
  reintroducedPlaceIds?: string[];
};

type Coordinate = { latitude: number; longitude: number };

const toRadians = (value: number) => value * Math.PI / 180;

export function haversineDistanceMeters(a: Coordinate, b: Coordinate): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function isExplicitKeywordEvidence(evidence: SearchEvidence): boolean {
  return evidence.source === 'keyword' && !['데이트 코스', '데이트 장소'].includes(evidence.queryText ?? '');
}

const totalScore = (breakdown: CandidateScoreBreakdown) => Object.values(breakdown)
  .reduce<number>((sum, value) => sum + (value ?? 0), 0);

type FeasibilityPlace = Pick<EvidencedKakaoPlace, 'kakaoPlaceId' | 'latitude' | 'longitude'>;

function findFeasibleAssignment(
  places: readonly EvidencedKakaoPlace[],
  request: RecommendationRequest,
): FeasibilityPlace[] | undefined {
  const locks = new Map((request.lockedSteps ?? []).map((lock) => [lock.stepId, lock]));
  const intentByStepId = new Map(effectiveStepIntents(request).map((intent) => [intent.stepId, intent]));
  const choices: FeasibilityPlace[][] = request.courseSteps.map((step) => {
    const lock = locks.get(step.id);
    if (lock) return [{ kakaoPlaceId: lock.kakaoPlaceId, latitude: lock.latitude, longitude: lock.longitude }];
    if (step.pinnedKakaoPlaceId) {
      return places.filter((place) => place.kakaoPlaceId === step.pinnedKakaoPlaceId);
    }
    const intent = intentByStepId.get(step.id);
    return places.filter((place) => (
      verifiedPlaceMatchesCategory(place, step.category)
      && (intent?.strength !== 'required' || placeMatchesStepIntent(place, intent))
    ));
  });
  if (choices.some((choice) => choice.length === 0)) return undefined;
  const walkingLimitMeters = request.maxWalkingMinutes === undefined ? undefined : request.maxWalkingMinutes * 80;
  const used = new Set<string>();
  const assignment: FeasibilityPlace[] = [];
  const visit = (stepIndex: number, previous?: FeasibilityPlace): FeasibilityPlace[] | undefined => {
    if (stepIndex === choices.length) return [...assignment];
    for (const candidate of choices[stepIndex]) {
      if (used.has(candidate.kakaoPlaceId)) continue;
      if (previous && walkingLimitMeters !== undefined
        && haversineDistanceMeters(previous, candidate) > walkingLimitMeters) continue;
      used.add(candidate.kakaoPlaceId);
      assignment.push(candidate);
      const result = visit(stepIndex + 1, candidate);
      if (result) return result;
      assignment.pop();
      used.delete(candidate.kakaoPlaceId);
    }
    return undefined;
  };
  return visit(0);
}

function hasHistorySignals(history: RecommendationHistoryContext | undefined): history is RecommendationHistoryContext {
  return Boolean(history && (
    history.recentHardPlaceIds.length > 0
    || Object.keys(history.recentExposure).length > 0
    || Object.keys(history.negativeActions).length > 0
    || Object.keys(history.feedback).length > 0
    || history.qualifiedPairs.length > 0
  ));
}

export function rankPlaceCandidates(
  places: readonly EvidencedKakaoPlace[],
  request: RecommendationRequest,
  options: { limit?: number; history?: RecommendationHistoryContext } = {},
): RankedRecommendationSearch {
  const requiredCategories = [...new Set(request.courseSteps.map((step) => (
    normalizeRecommendationCategory(step.category)
  )))];
  const excludedCategories = new Set((request.excludedCategories ?? []).map(normalizeRecommendationCategory));
  const excludedPlaceIds = new Set(request.excludedPlaceIds ?? []);
  const eligiblePlaces = places.filter((place) => (
    !excludedPlaceIds.has(place.kakaoPlaceId)
    && !isUnfitDatePlace(place)
    && ![...excludedCategories].some((category) => verifiedPlaceMatchesCategory(place, category))
  ));

  const history = hasHistorySignals(options.history) ? options.history : undefined;
  const recentHardPlaceIds = new Set(history?.recentHardPlaceIds ?? []);
  const pinnedPlaceIds = new Set(
    request.courseSteps
      .map((step) => step.pinnedKakaoPlaceId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  const hardExcluded = history
    ? eligiblePlaces.filter((place) => recentHardPlaceIds.has(place.kakaoPlaceId) && !pinnedPlaceIds.has(place.kakaoPlaceId))
    : [];
  let policyPlaces = history
    ? eligiblePlaces.filter((place) => !recentHardPlaceIds.has(place.kakaoPlaceId) || pinnedPlaceIds.has(place.kakaoPlaceId))
    : eligiblePlaces;
  const reintroducedPlaceIds: string[] = [];
  if (history && !findFeasibleAssignment(policyPlaces, request)) {
    const oldestFirst = [...hardExcluded].sort((a, b) => (
      (history.recentExposure[b.kakaoPlaceId]?.sessionDistance ?? 0)
      - (history.recentExposure[a.kakaoPlaceId]?.sessionDistance ?? 0)
      || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId)
    ));
    for (const place of oldestFirst) {
      policyPlaces = [...policyPlaces, place];
      if (!reintroducedPlaceIds.includes(place.kakaoPlaceId)) reintroducedPlaceIds.push(place.kakaoPlaceId);
      if (findFeasibleAssignment(policyPlaces, request)) break;
    }
  }
  const reintroducedPlaceIdSet = new Set(reintroducedPlaceIds);

  const routeFitFor = (place: EvidencedKakaoPlace): number => {
    if (requiredCategories.length < 2) return 0;
    const ownCategories = requiredCategories.filter((category) => verifiedPlaceMatchesCategory(place, category));
    const otherRequiredCategories = requiredCategories.filter((category) => !ownCategories.includes(category));
    const adjacentOptions = policyPlaces.filter((other) => (
      other.kakaoPlaceId !== place.kakaoPlaceId
      && otherRequiredCategories.some((category) => verifiedPlaceMatchesCategory(other, category))
    ));
    if (adjacentOptions.length === 0) return 0;
    const nearestMeters = Math.min(...adjacentOptions.map((other) => haversineDistanceMeters(place, other)));
    return Math.max(0, RANKING_SCORE_WEIGHTS.routeFitMax - Math.floor(nearestMeters / 500));
  };

  const stepIntents = effectiveStepIntents(request);
  const excludedIntents = effectiveExcludedIntents(request);
  const negatedPenaltyFor = (place: EvidencedKakaoPlace): number => {
    const name = place.name.normalize('NFKC').toLocaleLowerCase();
    return excludedIntents.some((intent) => name.includes(intent.canonicalTerm.toLocaleLowerCase()))
      ? RANKING_SCORE_WEIGHTS.stepIntentNegatedPenalty
      : 0;
  };
  const intentBoostFor = (place: EvidencedKakaoPlace): number => {
    let boost = 0;
    for (const intent of stepIntents) {
      const levels = place.matchedSearchEvidence
        .filter((evidence) => evidence.phase === 'step_intent' && evidence.canonicalTerm === intent.canonicalTerm)
        .map((evidence) => evidence.expansionLevel ?? 0);
      if (levels.length > 0) {
        const bestLevel = Math.min(...levels);
        boost += bestLevel === 0
          ? RANKING_SCORE_WEIGHTS.stepIntentExact
          : bestLevel === 1
            ? RANKING_SCORE_WEIGHTS.stepIntentExpansion1
            : RANKING_SCORE_WEIGHTS.stepIntentExpansion2;
      }
      if (place.name.normalize('NFKC').toLocaleLowerCase().includes(intent.canonicalTerm.toLocaleLowerCase())) {
        boost += RANKING_SCORE_WEIGHTS.stepIntentNameMatch;
      }
    }
    return boost;
  };

  const scored = policyPlaces.map((place) => {
    const distanceFromSearchCenterMeters = haversineDistanceMeters(request.location, place);
    const requiredMatch = requiredCategories.some((category) => verifiedPlaceMatchesCategory(place, category));
    const explicitKeywordMatch = place.matchedSearchEvidence.some(isExplicitKeywordEvidence);
    const scoreBreakdown: CandidateScoreBreakdown = {
      intent: (requiredMatch
        ? RANKING_SCORE_WEIGHTS.requiredCategory
        : explicitKeywordMatch ? RANKING_SCORE_WEIGHTS.explicitKeywordEvidence : 0)
        + intentBoostFor(place)
        + negatedPenaltyFor(place),
      distance: Math.max(0, RANKING_SCORE_WEIGHTS.distanceMax - Math.floor(distanceFromSearchCenterMeters / 250)),
      budget: 0,
      preference: 0,
      routeFit: routeFitFor(place),
      diversity: history ? diversityScoreFor(place.kakaoPlaceId, history, {
        reintroduced: reintroducedPlaceIdSet.has(place.kakaoPlaceId),
      }) : 0,
      behavior: history ? behaviorScoreFor(place.kakaoPlaceId, history, {
        quietPreferred: request.quietPreferred ?? request.parsedPreferences?.quietPreferred,
        photoFriendlyPreferred: request.photoFriendlyPreferred ?? request.parsedPreferences?.photoFriendlyPreferred,
      }) : 0,
      penalty: 0,
    };
    return { ...place, distanceFromSearchCenterMeters, scoreBreakdown };
  });

  const compare = (a: typeof scored[number], b: typeof scored[number]) => (
    totalScore(b.scoreBreakdown) - totalScore(a.scoreBreakdown)
    || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId)
  );
  const ranked = [...scored].sort(compare);
  const selected: typeof scored = [];
  const selectedIds = new Set<string>();
  const limit = Math.max(0, options.limit ?? 20);

  const appendSelected = (place: typeof scored[number], categoryRecall = false) => {
    const selectedPlace = categoryRecall
      ? {
        ...place,
        scoreBreakdown: {
          ...place.scoreBreakdown,
          ...(history
            ? { categoryRecall: RANKING_SCORE_WEIGHTS.categoryRecall }
            : { diversity: RANKING_SCORE_WEIGHTS.categoryRecall }),
        },
      }
      : place;
    selected.push(selectedPlace);
    selectedIds.add(selectedPlace.kakaoPlaceId);
  };

  if (history) {
    const assignment = findFeasibleAssignment(ranked, request);
    for (const assignedPlace of assignment ?? []) {
      if (selected.length >= limit || selectedIds.has(assignedPlace.kakaoPlaceId)) continue;
      const scoredPlace = ranked.find((place) => place.kakaoPlaceId === assignedPlace.kakaoPlaceId);
      if (scoredPlace) appendSelected(scoredPlace);
    }
  }

  for (const category of requiredCategories) {
    const alreadySelected = history
      ? selected.find((place) => verifiedPlaceMatchesCategory(place, category))
      : undefined;
    if (alreadySelected) {
      const index = selected.indexOf(alreadySelected);
      selected[index] = {
        ...alreadySelected,
        scoreBreakdown: {
          ...alreadySelected.scoreBreakdown,
          categoryRecall: RANKING_SCORE_WEIGHTS.categoryRecall,
        },
      };
      continue;
    }
    const representative = ranked.find((place) => (
      !selectedIds.has(place.kakaoPlaceId) && verifiedPlaceMatchesCategory(place, category)
    ));
    if (!representative || selected.length >= limit) continue;
    appendSelected(representative, true);
  }
  // 입력 시점 지정 장소(핀)는 카테고리를 이기므로 저점수일 때 카테고리 recall이 보호하지 못한다.
  // 일반 score fill(절단) 이전에 강제 포함해 유효한 핀이 후보 상한에서 잘려 STEP_PIN_UNAVAILABLE로
  // 오판되는 것을 막는다. 핀은 최대 4개라 상한을 넘기지 않는다.
  if (pinnedPlaceIds.size > 0) {
    for (const place of ranked) {
      if (selected.length >= limit) break;
      if (pinnedPlaceIds.has(place.kakaoPlaceId) && !selectedIds.has(place.kakaoPlaceId)) {
        appendSelected(place);
      }
    }
  }
  for (const place of ranked) {
    if (selected.length >= limit) break;
    if (!selectedIds.has(place.kakaoPlaceId)) {
      appendSelected(place);
    }
  }

  const candidates = selected.map((place, index): PlaceCandidate => ({
    ...place,
    candidateId: `candidate_${String(index + 1).padStart(3, '0')}`,
    score: totalScore(place.scoreBreakdown),
  }));
  const recallByCategory = Object.fromEntries(requiredCategories.map((category) => [
    category,
    candidates.filter((candidate) => verifiedPlaceMatchesCategory(candidate, category)).length,
  ]));
  if (!history) return { candidates, recallByCategory };
  return {
    candidates,
    recallByCategory,
    recentHistoryExcludedCount: hardExcluded.length,
    reintroducedPlaceIds: reintroducedPlaceIds.filter((placeId) => selectedIds.has(placeId)),
  };
}

export type StraightLineRouteMetadata = {
  distanceMethod: 'haversine_straight_line';
  adjacentDistanceMeters: number[];
  totalDistanceMeters: number;
  walkingHeuristicMetersPerMinute: 80;
  walkingLimitAssessment: 'not_requested' | 'provisional_within' | 'provisional_exceeded';
  hardConstraintValidated: false;
};

export function calculateStraightLineRouteMetadata(
  route: readonly Coordinate[],
  maxWalkingMinutes?: number,
): StraightLineRouteMetadata {
  const adjacentDistanceMeters = route.slice(1).map((place, index) => (
    haversineDistanceMeters(route[index], place)
  ));
  const totalDistanceMeters = adjacentDistanceMeters.reduce((sum, distance) => sum + distance, 0);
  const walkingLimitMeters = maxWalkingMinutes === undefined ? undefined : maxWalkingMinutes * 80;
  return {
    distanceMethod: 'haversine_straight_line',
    adjacentDistanceMeters,
    totalDistanceMeters,
    walkingHeuristicMetersPerMinute: 80,
    walkingLimitAssessment: walkingLimitMeters === undefined
      ? 'not_requested'
      : adjacentDistanceMeters.some((distance) => distance > walkingLimitMeters)
        ? 'provisional_exceeded'
        : 'provisional_within',
    hardConstraintValidated: false,
  };
}
