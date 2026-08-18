import { buildProviderNeutralRecommendationPrompt } from '../supabase/functions/_shared/recommendation-prompt';

describe('provider-neutral recommendation prompt', () => {
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
