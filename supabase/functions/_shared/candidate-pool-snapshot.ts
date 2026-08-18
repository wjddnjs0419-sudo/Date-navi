import type { CandidateScoreBreakdown } from './recommendation-ranking.ts';
import type { PriceRange } from '../../../shared/recommendation/place-price.ts';

export type CandidatePoolSnapshot = {
  candidateId: string;
  kakaoPlaceId?: string;
  placeIdentity?: { provider: 'kakao' | 'naver'; providerPlaceId: string };
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
    candidateId: string; kakaoPlaceId?: string;
    placeIdentity?: { provider: 'kakao' | 'naver'; providerPlaceId: string };
    categoryName: string; score: number;
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
  return input.candidates.map((candidate, index) => {
    const identity = candidate.placeIdentity
      ?? (candidate.kakaoPlaceId ? { provider: 'kakao' as const, providerPlaceId: candidate.kakaoPlaceId } : undefined);
    const stableKey = identity ? `${identity.provider}:${identity.providerPlaceId}` : candidate.kakaoPlaceId;
    return {
    candidateId: candidate.candidateId,
    ...(candidate.kakaoPlaceId ? { kakaoPlaceId: candidate.kakaoPlaceId } : {}),
    ...(identity ? { placeIdentity: identity } : {}),
    category: candidate.categoryName,
    rank: index + 1,
    totalScore: Object.values(candidate.scoreBreakdown).reduce<number>((sum, value) => sum + (value ?? 0), 0),
    scoreBreakdown: candidate.scoreBreakdown,
    distanceFromSearchCenterMeters: candidate.distanceFromSearchCenterMeters,
    priceAtRanking: candidate.priceAtRanking ?? UNKNOWN_PRICE,
    selectedInitially: selected.has(candidate.kakaoPlaceId ?? stableKey ?? ''),
    forced: candidate.kakaoPlaceId === input.forcedKakaoPlaceId,
    pinned: pinned.has(candidate.kakaoPlaceId ?? stableKey ?? ''),
    reintroducedByHistory: reintroduced.has(candidate.kakaoPlaceId ?? stableKey ?? ''),
  };
  });
}
