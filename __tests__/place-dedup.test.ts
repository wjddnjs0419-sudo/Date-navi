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
      address: { display: '서울 성동구 성수이로 1', road: '서울 성동구 성수이로1' },
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

  it('matches provider records when one side has only the parcel address', () => {
    const naver = place({
      identity: { provider: 'naver', providerPlaceId: 'naver-layered-parcel' },
      address: { display: '서울 성동구 성수동 1' },
    });
    const kakao = place({
      identity: { provider: 'kakao', providerPlaceId: 'kakao-layered-parcel' },
      address: { display: '서울 성동구 성수동 1', road: '서울 성동구 성수이로 1' },
      evidence: { provider: 'kakao', searchTerms: ['CE7'] },
      legacy: { kakaoPlaceId: 'kakao-layered-parcel' },
    });

    expect(dedupeNormalizedPlaces([naver, kakao]).places).toEqual([naver]);
  });

  it('suppresses the same physical Naver place even when search identities differ', () => {
    const first = place({
      identity: { provider: 'naver', providerPlaceId: 'naver-a' },
      name: '베이글랜드 홍대점',
      address: {
        display: '서울특별시 마포구 서교동 332-15 삼이빌딩 1층',
        road: '서울특별시 마포구 와우산로29바길 19 삼이빌딩 1층',
      },
      coordinates: { latitude: 37.5554909, longitude: 126.9259638 },
    });
    const duplicate = place({
      identity: { provider: 'naver', providerPlaceId: 'naver-b' },
      name: '베이글랜드 홍대',
      address: {
        display: '서울 마포구 서교동 332-15',
        road: '서울 마포구 와우산로29바길 19',
      },
      coordinates: { latitude: 37.55558, longitude: 126.92602 },
    });

    expect(dedupeNormalizedPlaces([first, duplicate])).toEqual({
      places: [first],
      suppressed: [{
        suppressed: duplicate.identity,
        representative: first.identity,
        reason: 'same_provider_identity',
      }],
    });
  });

  it('preserves a different branch even when its address and coordinates are close', () => {
    const hongdae = place({
      identity: { provider: 'naver', providerPlaceId: 'naver-hongdae' },
      name: '베이글랜드 홍대점',
    });
    const hapjeong = place({
      identity: { provider: 'naver', providerPlaceId: 'naver-hapjeong' },
      name: '베이글랜드 합정점',
      coordinates: { latitude: 37.54405, longitude: 127.05505 },
    });

    expect(dedupeNormalizedPlaces([hongdae, hapjeong]).places).toEqual([hongdae, hapjeong]);
  });
});
