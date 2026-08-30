import type { NormalizedPlace } from '../supabase/functions/_shared/place-provider';
import { resolveProviderNeutralReplacementKakaoLink } from '../supabase/functions/_shared/provider-neutral-replacement-link';

const naverPlace: NormalizedPlace = {
  identity: { provider: 'naver', providerPlaceId: 'local:naver-candidate' },
  name: '티티티',
  category: { normalized: 'meal' },
  address: { display: '부산 수영구 광안동 1', road: '부산 수영구 광안해변로 123' },
  coordinates: { latitude: 35.153, longitude: 129.118 },
  mapUrl: 'https://map.naver.com/p/search/%ED%8B%B0%ED%8B%B0%ED%8B%B0',
  evidence: { provider: 'naver', searchTerms: ['부산 식당'] },
};

const kakaoPlace = (id: string): NormalizedPlace => ({
  identity: { provider: 'kakao', providerPlaceId: id },
  name: '티티티',
  category: { normalized: 'meal' },
  address: { display: '부산 수영구 광안동 1', road: '부산 수영구 광안해변로 123' },
  coordinates: { latitude: 35.15301, longitude: 129.11801 },
  mapUrl: `https://place.map.kakao.com/${id}`,
  evidence: { provider: 'kakao', searchTerms: ['티티티'] },
  legacy: { kakaoPlaceId: id },
});

describe('provider-neutral replacement Kakao link resolution', () => {
  it('returns the established verified Kakao link for a matching Naver place', async () => {
    await expect(resolveProviderNeutralReplacementKakaoLink(naverPlace, async () => [kakaoPlace('kakao-1')]))
      .resolves.toEqual({ kakaoPlaceId: 'kakao-1', mapUrl: 'https://place.map.kakao.com/kakao-1' });
  });

  it('fails closed when the established resolver finds ambiguous matches', async () => {
    await expect(resolveProviderNeutralReplacementKakaoLink(naverPlace, async () => [kakaoPlace('kakao-1'), kakaoPlace('kakao-2')]))
      .resolves.toBeUndefined();
  });
});
