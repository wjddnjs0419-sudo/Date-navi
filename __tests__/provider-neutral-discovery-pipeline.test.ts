import { discoverProviderNeutralCandidates } from '../supabase/functions/_shared/provider-neutral-discovery-pipeline';
import type { NormalizedPlace } from '../supabase/functions/_shared/place-provider';
import type { RecommendationHistoryContext } from '../shared/recommendation/recommendation-history';

const request = {
  requestId: 'req', mode: 'course' as const, language: 'ko' as const,
  location: { source: 'current' as const, label: '성수역', latitude: 37.5444, longitude: 127.0557, kind: 'station' as const },
  courseSteps: [{ id: 'meal', category: 'restaurant', label: '저녁' }, { id: 'cafe', category: 'cafe', label: '카페' }],
};
const place = (id: string, category: NormalizedPlace['category']['normalized'], provider: 'naver' | 'kakao' = 'naver'): NormalizedPlace => ({
  identity: { provider, providerPlaceId: id }, name: id, category: { normalized: category },
  coordinates: { latitude: 37.5444, longitude: 127.0557 }, evidence: { provider, searchTerms: ['성수역'] },
});

describe('provider-neutral discovery pipeline', () => {
  it('keeps each provider result in its source step pool and falls back only for the deficient step', async () => {
    const mealPrimary = jest.fn(async () => [place('n-meal-1', 'meal'), place('n-meal-2', 'meal')]);
    const cafePrimary = jest.fn(async () => [place('n-cafe-1', 'cafe')]);
    const cafeFallback = jest.fn(async () => [place('k-cafe-2', 'cafe', 'kakao')]);

    const result = await discoverProviderNeutralCandidates({
      request,
      stepAttempts: {
        primary: [
          { stepId: 'meal', run: mealPrimary },
          { stepId: 'cafe', run: cafePrimary },
        ],
        fallback: [{ stepId: 'cafe', run: cafeFallback }],
      },
    } as never);

    expect(result.pools?.map((pool: { stepId: string; selectableCandidates: readonly unknown[] }) => [pool.stepId, pool.selectableCandidates.length]))
      .toEqual([['meal', 2], ['cafe', 2]]);
    expect(mealPrimary).toHaveBeenCalledTimes(1);
    expect(cafeFallback).toHaveBeenCalledTimes(1);
    expect(result.pools?.every((pool: { stepId: string; candidates: readonly { sourceStepId?: string }[] }) => (
      pool.candidates.every((candidate) => candidate.sourceStepId === pool.stepId)
    ))).toBe(true);
  });

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
    expect(result.diagnostics?.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: 'primary', attemptIndex: 0, returnedByCategory: { cafe: 4 }, qualifiedByCategory: { cafe: 4 }, sufficient: false,
      }),
      expect.objectContaining({
        phase: 'primary', attemptIndex: 1, returnedByCategory: { meal: 1 }, qualifiedByCategory: { cafe: 4, meal: 1 }, sufficient: true,
      }),
    ]));
  });

  it('does not trigger Kakao fallback when enough unknown-category places are available', async () => {
    const unknownAttempt = jest.fn(async () => [
      place('n-unknown-1', 'unknown'), place('n-unknown-2', 'unknown'),
      place('n-unknown-3', 'unknown'), place('n-unknown-4', 'unknown'),
    ]);
    const fallback = jest.fn(async () => [place('kakao-should-not-run', 'meal', 'kakao')]);

    const result = await discoverProviderNeutralCandidates({
      request, primaryAttempts: [unknownAttempt], fallbackAttempts: [fallback], minQualifiedCandidates: 4,
    });

    expect(result.discovery.fallbackUsed).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back when direct meal is absent even if the candidate-count threshold is met', async () => {
    const directMealRequest = {
      ...request,
      courseSteps: [{ id: 'meal', category: 'meal' as const, label: '식사' }, { id: 'cafe', category: 'cafe' as const, label: '카페' }],
    };
    const cafeOnly = jest.fn(async () => [
      place('cafe-1', 'cafe'), place('cafe-2', 'cafe'), place('cafe-3', 'cafe'), place('cafe-4', 'cafe'),
    ]);
    const kakao = jest.fn(async () => [place('meal-from-kakao', 'meal', 'kakao')]);

    const result = await discoverProviderNeutralCandidates({
      request: directMealRequest, primaryAttempts: [cafeOnly], fallbackAttempts: [kakao], minQualifiedCandidates: 4,
    });

    expect(kakao).toHaveBeenCalledTimes(1);
    expect(result.discovery.fallbackUsed).toBe(true);
    expect(result.diagnostics?.attempts[0]).toMatchObject({ qualifiedByCategory: { cafe: 4 }, sufficient: false });
  });

  it('requires every direct category across a four-step course before stopping discovery', async () => {
    const fourStepRequest = {
      ...request,
      courseSteps: [
        { id: 'meal', category: 'meal' as const, label: '식사' },
        { id: 'cafe', category: 'cafe' as const, label: '카페' },
        { id: 'culture', category: 'culture' as const, label: '문화' },
        { id: 'activity', category: 'activity' as const, label: '활동' },
      ],
    };
    const noMeal = jest.fn(async () => [
      place('cafe-1', 'cafe'), place('cafe-2', 'cafe'), place('cafe-3', 'cafe'),
      place('culture-1', 'culture'), place('culture-2', 'culture'), place('activity-1', 'activity'),
      place('activity-2', 'activity'), place('activity-3', 'activity'),
    ]);
    const fallback = jest.fn(async () => [place('meal-from-kakao', 'meal', 'kakao')]);

    const result = await discoverProviderNeutralCandidates({
      request: fourStepRequest, primaryAttempts: [noMeal], fallbackAttempts: [fallback], minQualifiedCandidates: 8,
    });

    expect(fallback).toHaveBeenCalledTimes(1);
    expect(result.discovery.fallbackUsed).toBe(true);
    expect(result.diagnostics?.attempts[0]).toMatchObject({
      qualifiedByCategory: { cafe: 3, culture: 2, activity: 3 }, sufficient: false,
    });
  });

  it('treats direct drinks and bar as the same required category', async () => {
    const drinksRequest = {
      ...request,
      courseSteps: [{ id: 'drinks', category: 'drinks' as const, label: '술' }, { id: 'cafe', category: 'cafe' as const, label: '카페' }],
    };
    const cafeOnly = jest.fn(async () => [
      place('cafe-1', 'cafe'), place('cafe-2', 'cafe'), place('cafe-3', 'cafe'), place('cafe-4', 'cafe'),
    ]);
    const fallback = jest.fn(async () => [place('drinks-from-kakao', 'drinks', 'kakao')]);

    const result = await discoverProviderNeutralCandidates({
      request: drinksRequest, primaryAttempts: [cafeOnly], fallbackAttempts: [fallback], minQualifiedCandidates: 4,
    });

    expect(fallback).toHaveBeenCalledTimes(1);
    expect(result.discovery.fallbackUsed).toBe(true);
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

  it('does not consider a generic category candidate sufficient for a required step keyword', async () => {
    const taggedRequest = {
      ...request,
      location: { ...request.location, source: 'kakao' as const },
      resolvedStepIntents: [{
        stepId: 'meal', stepCategory: 'meal', intentType: 'dish' as const,
        canonicalTerm: '삼겹살', kakaoSearchTerms: ['삼겹살'], strength: 'required' as const,
        displayLabel: { ko: '삼겹살', en: 'Samgyeopsal' },
      }],
    };
    const result = await discoverProviderNeutralCandidates({
      request: taggedRequest,
      primaryAttempts: [async () => [place('generic-meal', 'meal'), place('n-cafe', 'cafe')]],
      fallbackAttempts: [],
      minQualifiedCandidates: 2,
    });

    expect(result.discovery.fewerResults).toBe(true);
    expect(result.candidates.map((candidate) => candidate.place.identity.providerPlaceId)).toEqual(['generic-meal', 'n-cafe']);
  });

  it('does not re-add the same place from Kakao fallback when address forms differ', async () => {
    const naverMeal = {
      ...place('n-meal', 'meal'),
      name: '성수 식당',
      address: { display: '서울 성동구 성수동 1' },
    };
    const kakaoMeal = {
      ...place('k-meal', 'meal', 'kakao'),
      name: '성수 식당',
      address: { display: '서울 성동구 성수동 1', road: '서울 성동구 성수이로 1' },
    };
    const result = await discoverProviderNeutralCandidates({
      request,
      primaryAttempts: [async () => [naverMeal]],
      fallbackAttempts: [async () => [kakaoMeal, place('k-cafe', 'cafe', 'kakao')]],
      minQualifiedCandidates: 4,
    });

    expect(result.candidates.map((candidate) => candidate.place.identity.providerPlaceId)).toEqual(['k-cafe', 'n-meal']);
  });
});
