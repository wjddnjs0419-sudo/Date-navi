import type { CandidateScoreBreakdown } from './recommendation-ranking.ts';
import type { PriceRange } from '../../../shared/recommendation/place-price.ts';

export type CandidatePoolSnapshot = {
  candidateId: string;
  kakaoPlaceId: string;
  category: string;
  rank: number;
  totalScore: number;
  scoreBreakdown: CandidateScoreBreakdown;
  distanceFromSearchCenterMeters: number;
  priceAtRanking: PriceRange;
  selectedInitially: boolean;
  forced: boolean;
  pinned: boolean;
  reintroducedByHistory: boolean;
};

const UNKNOWN_PRICE: PriceRange = { source: 'unknown', minKRW: null, maxKRW: null };

export function buildCandidatePoolSnapshots(input: {
  candidates: readonly {
    candidateId: string; kakaoPlaceId: string; categoryName: string; score: number;
    scoreBreakdown: CandidateScoreBreakdown; distanceFromSearchCenterMeters: number; priceAtRanking?: PriceRange;
  }[];
  selectedKakaoPlaceIds?: readonly string[];
  forcedKakaoPlaceId?: string;
  pinnedKakaoPlaceIds?: readonly string[];
  reintroducedPlaceIds?: readonly string[];
}): CandidatePoolSnapshot[] {
  const selected = new Set(input.selectedKakaoPlaceIds ?? []);
  const pinned = new Set(input.pinnedKakaoPlaceIds ?? []);
  const reintroduced = new Set(input.reintroducedPlaceIds ?? []);
  return input.candidates.map((candidate, index) => ({
    candidateId: candidate.candidateId,
    kakaoPlaceId: candidate.kakaoPlaceId,
    category: candidate.categoryName,
    rank: index + 1,
    totalScore: Object.values(candidate.scoreBreakdown).reduce<number>((sum, value) => sum + (value ?? 0), 0),
    scoreBreakdown: candidate.scoreBreakdown,
    distanceFromSearchCenterMeters: candidate.distanceFromSearchCenterMeters,
    priceAtRanking: candidate.priceAtRanking ?? UNKNOWN_PRICE,
    selectedInitially: selected.has(candidate.kakaoPlaceId),
    forced: candidate.kakaoPlaceId === input.forcedKakaoPlaceId,
    pinned: pinned.has(candidate.kakaoPlaceId),
    reintroducedByHistory: reintroduced.has(candidate.kakaoPlaceId),
  }));
}
