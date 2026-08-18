import {
  naverShadowQueries,
  providerNeutralSessionPersistenceEnabled,
  resolveRecommendationDiscoveryStrategy,
} from '../supabase/functions/_shared/recommendation-discovery-strategy';

describe('recommendation discovery strategy', () => {
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

  it('uses bounded semantic labels rather than user free text for Naver shadow queries', () => {
    expect(naverShadowQueries({
      locationLabel: '성수역',
      stepLabels: ['저녁 식사', '카페', '카페', '산책', '전시', '무시됨'],
    })).toEqual(['성수역 저녁 식사', '성수역 카페', '성수역 산책']);
  });

  it('does not create text queries for a GPS-only current location', () => {
    expect(naverShadowQueries({
      locationLabel: '내 위치 사용 중',
      locationSource: 'current',
      stepLabels: ['카페'],
    })).toEqual([]);
  });
});
