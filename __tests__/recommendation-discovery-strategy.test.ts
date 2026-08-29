import {
  naverStepQueries,
  naverShadowQueries,
  providerNeutralSessionPersistenceEnabled,
  resolveRecommendationDiscoveryStrategy,
} from '../supabase/functions/_shared/recommendation-discovery-strategy';

describe('recommendation discovery strategy', () => {
  it('retains step ownership for provider-neutral Naver attempts', () => {
    expect(naverStepQueries({
      locationLabel: '성수역',
      stepCategories: ['meal', 'cafe'],
      stepIds: ['meal-step', 'cafe-step'],
    })).toEqual([
      { stepId: 'meal-step', query: '성수역 음식점', querySource: 'category' },
      { stepId: 'cafe-step', query: '성수역 카페', querySource: 'category' },
    ]);
  });

  it('defaults unknown and absent configuration to Kakao-only', () => {
    expect(resolveRecommendationDiscoveryStrategy(undefined)).toBe('kakao_only');
    expect(resolveRecommendationDiscoveryStrategy('all_providers')).toBe('kakao_only');
  });

  it('recognizes shadow and Naver-primary rollout modes explicitly', () => {
    expect(resolveRecommendationDiscoveryStrategy('naver_shadow')).toBe('naver_shadow');
    expect(resolveRecommendationDiscoveryStrategy('naver_primary_with_kakao_fallback'))
      .toBe('naver_primary_with_kakao_fallback');
  });

  it('requires an explicit persistence gate before emitting provider-neutral sessions', () => {
    expect(providerNeutralSessionPersistenceEnabled(undefined)).toBe(false);
    expect(providerNeutralSessionPersistenceEnabled('true')).toBe(false);
    expect(providerNeutralSessionPersistenceEnabled('enabled')).toBe(true);
  });

  it('uses fixed Korean category queries rather than localized display labels', () => {
    expect(naverShadowQueries({
      locationLabel: '성수역',
      stepCategories: ['meal', 'cafe', 'walk', 'culture'],
    })).toEqual(['성수역 음식점', '성수역 카페', '성수역 산책', '성수역 문화시설']);
  });

  it('does not create text queries for a GPS-only current location', () => {
    expect(naverShadowQueries({
      locationLabel: '내 위치 사용 중',
      locationSource: 'current',
      stepCategories: ['cafe'],
    })).toEqual([]);
  });

  it('uses only the selected keyword instead of a category term for its matching Naver step', () => {
    expect(naverShadowQueries({
      locationLabel: '성수역',
      locationSource: 'kakao',
      stepCategories: ['meal', 'cafe'],
      stepIntents: [{ stepId: 'meal', canonicalTerm: '삼겹살' }],
      stepIds: ['meal', 'cafe'],
    })).toEqual(['성수역 삼겹살', '성수역 카페']);
  });

  it('preserves cafe in descriptive cafe intent search phrases', () => {
    expect(naverShadowQueries({
      locationLabel: '홍대입구',
      locationSource: 'kakao',
      stepCategories: ['cafe'],
      stepIds: ['cafe'],
      stepIntents: [{ stepId: 'cafe', canonicalTerm: '조용한', kakaoSearchTerms: ['조용한', '조용한 카페'] }],
    })).toEqual(['홍대입구 조용한 카페']);
  });

  it('maps every course category to a Korean Naver search term', () => {
    const cases = [
      ['meal', '낙성대역 음식점'], ['restaurant', '낙성대역 음식점'],
      ['cafe', '낙성대역 카페'], ['drinks', '낙성대역 술집'], ['bar', '낙성대역 술집'],
      ['culture', '낙성대역 문화시설'], ['walk', '낙성대역 산책'], ['attraction', '낙성대역 산책'],
      ['activity', '낙성대역 체험'], ['ai_decide', '낙성대역 데이트 장소'],
    ] as const;

    for (const [category, expected] of cases) {
      expect(naverShadowQueries({ locationLabel: '낙성대역', stepCategories: [category] })).toEqual([expected]);
    }
  });
});
