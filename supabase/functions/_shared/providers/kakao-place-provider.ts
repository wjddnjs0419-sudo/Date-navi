import type { RecommendationLocation } from '../../../../shared/recommendation/contracts.ts';
import type { EvidencedKakaoPlace, KakaoSearchPlanItem } from '../recommendation-search.ts';
import { normalizeKakaoPlace, type NormalizedPlace } from '../place-provider.ts';

export type SemanticSearchPlan = {
  center: RecommendationLocation;
  radiusMeters: number;
  items: KakaoSearchPlanItem[];
};

export type KakaoPlaceProvider = {
  provider: 'kakao';
  search: (plan: SemanticSearchPlan) => Promise<NormalizedPlace[]>;
};

export function createKakaoPlaceProvider(input: {
  search: (plan: SemanticSearchPlan) => Promise<EvidencedKakaoPlace[]>;
}): KakaoPlaceProvider {
  return {
    provider: 'kakao',
    async search(plan) {
      return (await input.search(plan)).map(normalizeKakaoPlace);
    },
  };
}
