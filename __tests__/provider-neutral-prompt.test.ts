import { buildProviderNeutralRecommendationPrompt } from '../supabase/functions/_shared/recommendation-prompt';

describe('provider-neutral recommendation prompt', () => {
  it('groups candidates by their owning step', () => {
    const prompt = buildProviderNeutralRecommendationPrompt({
      requestId: 'req', mode: 'course', language: 'ko',
      location: { source: 'current', label: '성수역', latitude: 37.5, longitude: 127, kind: 'station' },
      courseSteps: [{ id: 'meal', category: 'meal', label: '식사' }, { id: 'cafe', category: 'cafe', label: '카페' }],
    }, [{
      stepId: 'meal', sufficient: true,
      candidates: [{ candidateId: 'meal-1', sourceStepId: 'meal', place: { identity: { provider: 'naver', providerPlaceId: 'meal-place' }, name: '식당', category: { normalized: 'meal' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
      selectableCandidates: [{ candidateId: 'meal-1', sourceStepId: 'meal', place: { identity: { provider: 'naver', providerPlaceId: 'meal-place' }, name: '식당', category: { normalized: 'meal' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
    }, {
      stepId: 'cafe', sufficient: true,
      candidates: [{ candidateId: 'cafe-1', sourceStepId: 'cafe', place: { identity: { provider: 'naver', providerPlaceId: 'cafe-place' }, name: '카페', category: { normalized: 'cafe' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
      selectableCandidates: [{ candidateId: 'cafe-1', sourceStepId: 'cafe', place: { identity: { provider: 'naver', providerPlaceId: 'cafe-place' }, name: '카페', category: { normalized: 'cafe' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
    }] as never);

    expect(prompt).toContain('stepCandidateGroups');
    expect(prompt).toContain('meal-1');
    expect(prompt).toContain('cafe-1');
  });

  it('exposes provider identity without calling a Naver key a Kakao place ID', () => {
    const prompt = buildProviderNeutralRecommendationPrompt({
      requestId: 'req', mode: 'course', language: 'ko',
      location: { source: 'current', label: '성수역', latitude: 37.5, longitude: 127, kind: 'station' },
      courseSteps: [{ id: 'meal', category: 'restaurant', label: '저녁' }, { id: 'cafe', category: 'cafe', label: '카페' }],
    }, [{
      candidateId: 'n1', distanceFromSearchCenterMeters: 100, popularityBonus: 1,
      place: { identity: { provider: 'naver', providerPlaceId: 'https://map.naver.com/p/1' }, name: '식당', category: { normalized: 'meal' }, evidence: { provider: 'naver', searchTerms: ['성수역 저녁'] } },
    }]);

    expect(prompt).toContain('"placeIdentity"');
    expect(prompt).toContain('https://map.naver.com/p/1');
    expect(prompt).not.toContain('kakaoPlaceId');
  });
});
