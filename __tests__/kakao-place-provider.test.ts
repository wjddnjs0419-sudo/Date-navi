import {
  createKakaoPlaceProvider,
  type SemanticSearchPlan,
} from '../supabase/functions/_shared/providers/kakao-place-provider';
import type { RecommendationLocation } from '../shared/recommendation/contracts';

const center: RecommendationLocation = {
  source: 'kakao', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark',
};

const plan: SemanticSearchPlan = {
  center,
  radiusMeters: 10_000,
  items: [{ queryId: 'query_001', source: 'category', category: 'cafe', categoryCode: 'CE7', phase: 'required' }],
};

describe('KakaoPlaceProvider', () => {
  it('normalizes existing Kakao evidence without changing the adapter request contract', async () => {
    const search = jest.fn(async () => [{
      kakaoPlaceId: 'kakao-cafe', name: '개인 카페', categoryGroupCode: 'CE7', categoryGroupName: '카페',
      categoryName: '음식점 > 카페', address: '서울 성동구 성수동1가', roadAddress: '서울 성동구 성수이로 1',
      latitude: 37.544, longitude: 127.055, mapUrl: 'https://place.map.kakao.com/kakao-cafe',
      matchedSearchEvidence: [{ queryId: 'query_001', source: 'category' as const, page: 1, categoryCode: 'CE7' }],
    }]);
    const provider = createKakaoPlaceProvider({ search });

    const result = await provider.search(plan);

    expect(search).toHaveBeenCalledWith(plan);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      identity: { provider: 'kakao', providerPlaceId: 'kakao-cafe' },
      legacy: { kakaoPlaceId: 'kakao-cafe' },
      category: { normalized: 'cafe' },
    });
  });
});
