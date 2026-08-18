import { dedupeNormalizedPlaces } from '../supabase/functions/_shared/place-dedup';
import type { NormalizedPlace } from '../supabase/functions/_shared/place-provider';

const place = (overrides: Partial<NormalizedPlace>): NormalizedPlace => ({
  identity: { provider: 'naver', providerPlaceId: 'naver-1' },
  name: '카페 레이어드 성수',
  category: { normalized: 'cafe' },
  address: { display: '서울 성동구 성수이로 1', road: '서울 성동구 성수이로 1' },
  coordinates: { latitude: 37.544, longitude: 127.055 },
  evidence: { provider: 'naver', searchTerms: ['성수 카페'] },
  ...overrides,
});

describe('dedupeNormalizedPlaces', () => {
  it('suppresses a high-confidence cross-provider duplicate only within the request', () => {
    const naver = place({
      identity: { provider: 'naver', providerPlaceId: 'naver-layered' },
      name: '카페 레이어드 성수',
    });
    const kakao = place({
      identity: { provider: 'kakao', providerPlaceId: 'kakao-layered' },
      name: '카페레이어드 성수점',
      coordinates: { latitude: 37.5441, longitude: 127.0551 },
      evidence: { provider: 'kakao', searchTerms: ['CE7'] },
      legacy: { kakaoPlaceId: 'kakao-layered' },
    });

    const result = dedupeNormalizedPlaces([naver, kakao]);

    expect(result.places).toEqual([naver]);
    expect(result.suppressed).toEqual([{
      suppressed: { provider: 'kakao', providerPlaceId: 'kakao-layered' },
      representative: { provider: 'naver', providerPlaceId: 'naver-layered' },
      reason: 'cross_provider_match',
    }]);
  });
});
