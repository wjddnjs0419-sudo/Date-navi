import { buildCandidatePoolSnapshots } from '../supabase/functions/_shared/candidate-pool-snapshot';

const candidate = {
  candidateId: 'candidate_001',
  kakaoPlaceId: 'place-1',
  categoryName: '음식점 > 한식',
  score: 17,
  scoreBreakdown: { intent: 10, distance: 5, budget: 2, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
  distanceFromSearchCenterMeters: 123,
  priceAtRanking: { source: 'estimated' as const, minKRW: 12000, maxKRW: 22000 },
};

describe('buildCandidatePoolSnapshots', () => {
  it('serializes ranking facts and request-derived flags without place-identifying display fields', () => {
    const snapshots = buildCandidatePoolSnapshots({
      candidates: [candidate],
      selectedKakaoPlaceIds: ['place-1'],
      forcedKakaoPlaceId: 'place-1',
      pinnedKakaoPlaceIds: ['place-1'],
      reintroducedPlaceIds: ['place-1'],
    });

    expect(snapshots).toEqual([{
      candidateId: 'candidate_001', kakaoPlaceId: 'place-1', category: '음식점 > 한식', rank: 1,
      totalScore: 17, scoreBreakdown: candidate.scoreBreakdown, distanceFromSearchCenterMeters: 123,
      priceAtRanking: { source: 'estimated', minKRW: 12000, maxKRW: 22000 },
      selectedInitially: true, forced: true, pinned: true, reintroducedByHistory: true,
    }]);
    expect(snapshots[0]).not.toHaveProperty('name');
    expect(snapshots[0]).not.toHaveProperty('address');
  });

  it('records unknown pricing when ranking had no ledger result', () => {
    expect(buildCandidatePoolSnapshots({ candidates: [{ ...candidate, priceAtRanking: undefined }] })[0].priceAtRanking)
      .toEqual({ source: 'unknown', minKRW: null, maxKRW: null });
  });
});
