import { normalizeKakaoPlace } from '../supabase/functions/_shared/place-provider';

describe('normalizeKakaoPlace', () => {
  it('preserves Kakao facts behind a provider-scoped identity', () => {
    const place = normalizeKakaoPlace({
      kakaoPlaceId: '12345',
      name: '카페 레이어드 성수점',
      categoryGroupCode: 'CE7',
      categoryGroupName: '카페',
      categoryName: '음식점 > 카페 > 커피전문점',
      address: '서울 성동구 성수동1가 1',
      roadAddress: '서울 성동구 성수이로 1',
      latitude: 37.544,
      longitude: 127.055,
      mapUrl: 'https://place.map.kakao.com/12345',
      matchedSearchEvidence: [{ queryId: 'query_001', source: 'category', page: 1, categoryCode: 'CE7' }],
    });

    expect(place).toMatchObject({
      identity: { provider: 'kakao', providerPlaceId: '12345' },
      name: '카페 레이어드 성수점',
      category: {
        providerRaw: '음식점 > 카페 > 커피전문점',
        normalized: 'cafe',
        specificity: 'specific',
      },
      address: {
        display: '서울 성동구 성수동1가 1',
        road: '서울 성동구 성수이로 1',
      },
      coordinates: { latitude: 37.544, longitude: 127.055 },
      legacy: { kakaoPlaceId: '12345' },
    });
    expect(place.evidence.searchTerms).toEqual(['CE7']);
  });
});
