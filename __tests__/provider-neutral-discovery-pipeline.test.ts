import { discoverProviderNeutralCandidates } from '../supabase/functions/_shared/provider-neutral-discovery-pipeline';
import type { NormalizedPlace } from '../supabase/functions/_shared/place-provider';
import type { RecommendationHistoryContext } from '../shared/recommendation/recommendation-history';

const request = {
  requestId: 'req', mode: 'course' as const, language: 'ko' as const,
  location: { source: 'current' as const, label: '성수역', latitude: 37.5444, longitude: 127.0557, kind: 'station' as const },
  courseSteps: [{ id: 'meal', category: 'restaurant', label: '저녁' }, { id: 'cafe', category: 'cafe', label: '카페' }],
};
const place = (id: string, category: 'meal' | 'cafe', provider: 'naver' | 'kakao' = 'naver'): NormalizedPlace => ({
  identity: { provider, providerPlaceId: id }, name: id, category: { normalized: category },
  coordinates: { latitude: 37.5444, longitude: 127.0557 }, evidence: { provider, searchTerms: ['성수역'] },
});

describe('provider-neutral discovery pipeline', () => {
  it('uses Kakao only after Naver candidates remain insufficient and outputs provider-scoped candidates', async () => {
    const naver = jest.fn(async () => [place('n-meal', 'meal')]);
    const kakao = jest.fn(async () => [place('k-cafe', 'cafe', 'kakao')]);
    const result = await discoverProviderNeutralCandidates({
      request, primaryAttempts: [naver], fallbackAttempts: [kakao], minQualifiedCandidates: 2,
    });

    expect(naver).toHaveBeenCalledTimes(1);
    expect(kakao).toHaveBeenCalledTimes(1);
    expect(result.discovery.fallbackUsed).toBe(true);
    expect(result.candidates.map((candidate) => candidate.place.identity)).toEqual([
      { provider: 'kakao', providerPlaceId: 'k-cafe' },
      { provider: 'naver', providerPlaceId: 'n-meal' },
    ]);
  });

  it('applies context ranking only after the hard and quality gates pass', async () => {
    const farther = { ...place('farther', 'cafe'), coordinates: { latitude: 37.5504, longitude: 127.0557 } };
    const nearer = place('nearer', 'meal');
    const result = await discoverProviderNeutralCandidates({
      request, primaryAttempts: [async () => [farther, nearer]], fallbackAttempts: [], minQualifiedCandidates: 2,
    });

    expect(result.candidates.map((candidate) => candidate.place.identity.providerPlaceId)).toEqual(['nearer', 'farther']);
  });

  it('continues Naver discovery until every requested category is covered, not merely until the total count is full', async () => {
    const cafeAttempt = jest.fn(async () => [
      place('n-cafe-1', 'cafe'), place('n-cafe-2', 'cafe'),
      place('n-cafe-3', 'cafe'), place('n-cafe-4', 'cafe'),
    ]);
    const mealAttempt = jest.fn(async () => [place('n-meal', 'meal')]);
    const kakao = jest.fn(async () => [place('kakao-should-not-run', 'meal', 'kakao')]);

    const result = await discoverProviderNeutralCandidates({
      request,
      primaryAttempts: [cafeAttempt, mealAttempt],
      fallbackAttempts: [kakao],
      minQualifiedCandidates: 4,
    });

    expect(mealAttempt).toHaveBeenCalledTimes(1);
    expect(kakao).not.toHaveBeenCalled();
    expect(result.candidates.map((candidate) => candidate.place.category.normalized)).toContain('meal');
  });

  it('excludes recent provider-scoped identities before ranking Naver-first candidates', async () => {
    const history: RecommendationHistoryContext = {
      recentHardPlaceIds: [],
      recentExposure: {},
      recentHardPlaceIdentities: [{ provider: 'naver', providerPlaceId: 'n-recent' }],
      recentProviderExposure: { 'naver:n-recent': { lastSeenAt: '2026-07-24T00:00:00.000Z', sessionDistance: 1 } },
      negativeActions: {}, feedback: {}, qualifiedPairs: [],
    };
    const result = await discoverProviderNeutralCandidates({
      request,
      primaryAttempts: [async () => [place('n-recent', 'meal'), place('n-fresh', 'meal'), place('n-cafe', 'cafe')]],
      fallbackAttempts: [],
      minQualifiedCandidates: 2,
      history,
    });

    expect(result.candidates.map((candidate) => candidate.place.identity.providerPlaceId)).not.toContain('n-recent');
    expect(result.candidates.map((candidate) => candidate.place.identity.providerPlaceId)).toEqual(['n-cafe', 'n-fresh']);
  });
});
