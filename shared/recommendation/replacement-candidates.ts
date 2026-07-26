import type { RecommendationCourseStep } from './contracts.ts';
import {
  behaviorScoreFor,
  diversityScoreFor,
  pairBonusForAdjacentPlaces,
  EMPTY_RECOMMENDATION_HISTORY,
  type RecommendationHistoryContext,
} from './recommendation-history.ts';
import { historyExperimentMetadataSchema } from './schemas.ts';

export type ReplacementCandidateSource = {
  candidateId: string;
  kakaoPlaceId: string;
  name: string;
  address: string;
  roadAddress: string;
  mapUrl: string;
  latitude: number;
  longitude: number;
  score: number;
};

export type ReplacementCandidate = ReplacementCandidateSource & {
  contextScore: number;
  displayRank: number;
  /** Internal/test-only history contribution. Edge responses deliberately omit it. */
  scoreBreakdown: {
    diversity: number;
    behavior: number;
    pair: number;
  };
};

export type ReplacementCandidateDisplay = Pick<ReplacementCandidateSource,
  'candidateId' | 'kakaoPlaceId' | 'name' | 'address' | 'roadAddress' | 'mapUrl' | 'latitude' | 'longitude'
> & {
  displayRank: number;
};

const distance = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLatitude = radians(b.latitude - a.latitude);
  const deltaLongitude = radians(b.longitude - a.longitude);
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
};

const CURATION_POOL_SIZE = 30;

export function storedReplacementHistoryVariant(metadata: unknown): 'control' | 'treatment' {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 'control';
  const parsed = historyExperimentMetadataSchema.safeParse(
    (metadata as Record<string, unknown>).historyExperiment,
  );
  return parsed.success ? parsed.data.assignedVariant : 'control';
}

export function rankReplacementCandidates(input: {
  target: RecommendationCourseStep;
  previous?: RecommendationCourseStep;
  next?: RecommendationCourseStep;
  existingKakaoPlaceIds: readonly string[];
  candidates: readonly ReplacementCandidateSource[];
  maxWalkingMinutes?: number;
  /** History is a score-only policy for replacements; it must never remove sparse-area options. */
  history?: RecommendationHistoryContext;
  preferences?: { quietPreferred?: boolean; photoFriendlyPreferred?: boolean };
  now?: string;
}): { top: ReplacementCandidate[]; additional: ReplacementCandidate[]; pool: ReplacementCandidate[] } {
  const existing = new Set(input.existingKakaoPlaceIds);
  const walkingBudget = input.maxWalkingMinutes === undefined ? undefined : input.maxWalkingMinutes * 80;
  const history = input.history ?? EMPTY_RECOMMENDATION_HISTORY;
  const adjacentKakaoPlaceIds = [input.previous, input.next]
    .filter((step): step is RecommendationCourseStep => Boolean(step))
    .map((step) => step.kakaoPlaceId);
  const pool = input.candidates
    // The Edge supplies category-compatible input. Current course IDs remain absolute exclusions.
    .filter((candidate) => !existing.has(candidate.kakaoPlaceId))
    .filter((candidate) => {
      if (walkingBudget === undefined) return true;
      const neighbourDistances = [input.previous, input.next]
        .filter((step): step is RecommendationCourseStep => Boolean(step))
        .map((step) => distance(candidate, step));
      return neighbourDistances.every((value) => value <= walkingBudget);
    })
    .map((candidate) => {
      const neighbourDistance = [input.previous, input.next]
        .filter((step): step is RecommendationCourseStep => Boolean(step))
        .reduce((sum, step) => sum + distance(candidate, step), 0);
      const contextScore = candidate.score - neighbourDistance / 100;
      const scoreBreakdown = {
        diversity: diversityScoreFor(candidate.kakaoPlaceId, history, {
          reintroduced: history.recentHardPlaceIds.includes(candidate.kakaoPlaceId),
          now: input.now,
        }),
        behavior: behaviorScoreFor(candidate.kakaoPlaceId, history, {
          quietPreferred: input.preferences?.quietPreferred,
          photoFriendlyPreferred: input.preferences?.photoFriendlyPreferred,
          now: input.now,
        }),
        pair: pairBonusForAdjacentPlaces(candidate.kakaoPlaceId, adjacentKakaoPlaceIds, history),
      };
      return {
        ...candidate,
        contextScore,
        scoreBreakdown,
        replacementScore: contextScore + scoreBreakdown.diversity + scoreBreakdown.behavior + scoreBreakdown.pair,
      };
    })
    .sort((a, b) => (
      b.replacementScore - a.replacementScore
      || b.contextScore - a.contextScore
      || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId)
    ))
    .slice(0, CURATION_POOL_SIZE)
    .map(({ replacementScore: _replacementScore, ...candidate }, index) => ({
      ...candidate,
      displayRank: index + 1,
    }));
  return { top: pool.slice(0, 3), additional: pool.slice(3, 15), pool };
}

export function toReplacementCandidateDisplay(candidate: ReplacementCandidate): ReplacementCandidateDisplay {
  return {
    candidateId: candidate.candidateId,
    kakaoPlaceId: candidate.kakaoPlaceId,
    name: candidate.name,
    address: candidate.address,
    roadAddress: candidate.roadAddress,
    mapUrl: candidate.mapUrl,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    displayRank: candidate.displayRank,
  };
}

export const buildKakaoMapUrl = (place: Pick<ReplacementCandidateSource, 'kakaoPlaceId' | 'mapUrl'>) => (
  place.mapUrl || `https://place.map.kakao.com/${encodeURIComponent(place.kakaoPlaceId)}`
);
