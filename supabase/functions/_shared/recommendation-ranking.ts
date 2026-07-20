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

export const RANKING_SCORE_WEIGHTS = {
  requiredCategory: 40,
  explicitKeywordEvidence: 20,
  distanceMax: 20,
  routeFitMax: 10,
  diversityRecall: 5,
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
  .reduce((sum, value) => sum + value, 0);

export function rankPlaceCandidates(
  places: readonly EvidencedKakaoPlace[],
  request: RecommendationRequest,
  options: { limit?: number } = {},
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

  const routeFitFor = (place: EvidencedKakaoPlace): number => {
    if (requiredCategories.length < 2) return 0;
    const ownCategories = requiredCategories.filter((category) => verifiedPlaceMatchesCategory(place, category));
    const otherRequiredCategories = requiredCategories.filter((category) => !ownCategories.includes(category));
    const adjacentOptions = eligiblePlaces.filter((other) => (
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

  const scored = eligiblePlaces.map((place) => {
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
      diversity: 0,
      behavior: 0,
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

  for (const category of requiredCategories) {
    const representative = ranked.find((place) => (
      !selectedIds.has(place.kakaoPlaceId) && verifiedPlaceMatchesCategory(place, category)
    ));
    if (!representative || selected.length >= limit) continue;
    const recalled = {
      ...representative,
      scoreBreakdown: {
        ...representative.scoreBreakdown,
        diversity: RANKING_SCORE_WEIGHTS.diversityRecall,
      },
    };
    selected.push(recalled);
    selectedIds.add(recalled.kakaoPlaceId);
  }
  // 입력 시점 지정 장소(핀)는 카테고리를 이기므로 저점수일 때 카테고리 recall이 보호하지 못한다.
  // 일반 score fill(절단) 이전에 강제 포함해 유효한 핀이 후보 상한에서 잘려 STEP_PIN_UNAVAILABLE로
  // 오판되는 것을 막는다. 핀은 최대 4개라 상한을 넘기지 않는다.
  const pinnedPlaceIds = new Set(
    request.courseSteps
      .map((step) => step.pinnedKakaoPlaceId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  if (pinnedPlaceIds.size > 0) {
    for (const place of ranked) {
      if (selected.length >= limit) break;
      if (pinnedPlaceIds.has(place.kakaoPlaceId) && !selectedIds.has(place.kakaoPlaceId)) {
        selected.push(place);
        selectedIds.add(place.kakaoPlaceId);
      }
    }
  }
  for (const place of ranked) {
    if (selected.length >= limit) break;
    if (!selectedIds.has(place.kakaoPlaceId)) {
      selected.push(place);
      selectedIds.add(place.kakaoPlaceId);
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
  return { candidates, recallByCategory };
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
