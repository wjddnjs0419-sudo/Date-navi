import { resolveKakaoPlaceLink } from '../supabase/functions/_shared/kakao-place-link';
import type { NormalizedPlace } from '../supabase/functions/_shared/place-provider';

const naverPlace: NormalizedPlace = {
  identity: { provider: 'naver', providerPlaceId: 'naver-1' },
  name: '역전할머니맥주 서울낙성대역점',
  category: { normalized: 'drinks' },
  address: { display: '서울 관악구 봉천동 1', road: '서울 관악구 남부순환로 1' },
  coordinates: { latitude: 37.476, longitude: 126.963 },
  evidence: { provider: 'naver', searchTerms: ['낙성대 술집'] },
};

const kakaoPlace = (overrides: Partial<NormalizedPlace> = {}): NormalizedPlace => ({
  identity: { provider: 'kakao', providerPlaceId: 'kakao-1' },
  name: naverPlace.name,
  category: { normalized: 'drinks' },
  address: { display: naverPlace.address!.display, road: naverPlace.address!.road },
  coordinates: { latitude: 37.47605, longitude: 126.96305 },
  mapUrl: 'https://place.map.kakao.com/kakao-1',
  evidence: { provider: 'kakao', searchTerms: ['역전할머니맥주 서울낙성대역점'] },
  legacy: { kakaoPlaceId: 'kakao-1' },
  ...overrides,
});

describe('resolveKakaoPlaceLink', () => {
  it('returns a Kakao link for one same-address, same-place match', async () => {
    const result = await resolveKakaoPlaceLink(naverPlace, async () => [kakaoPlace()]);
    expect(result).toEqual({ kakaoPlaceId: 'kakao-1', mapUrl: 'https://place.map.kakao.com/kakao-1' });
  });

  it('allows branch suffix differences when the road address is the same', async () => {
    const result = await resolveKakaoPlaceLink(naverPlace, async () => [kakaoPlace({
      name: '역전할머니맥주 서울낙성대역직영점',
      address: { display: '서울 관악구 봉천동 1 (1층)', road: '서울 관악구 남부순환로 1' },
    })]);
    expect(result).toEqual({ kakaoPlaceId: 'kakao-1', mapUrl: 'https://place.map.kakao.com/kakao-1' });
  });

  it('falls back to an address-only search when the provider names differ', async () => {
    const queries: string[] = [];
    const result = await resolveKakaoPlaceLink(naverPlace, async (query) => {
      queries.push(query);
      return query === naverPlace.address!.road ? [kakaoPlace({ name: '역전할머니맥주 서울낙성대역직영점' })] : [];
    });
    expect(queries).toEqual([
      naverPlace.address!.road,
    ]);
    expect(result).toEqual({ kakaoPlaceId: 'kakao-1', mapUrl: 'https://place.map.kakao.com/kakao-1' });
  });

  it('falls back when the primary query returns only unrelated candidates', async () => {
    const queries: string[] = [];
    const result = await resolveKakaoPlaceLink(naverPlace, async (query) => {
      queries.push(query);
      if (query === naverPlace.address!.road) return [];
      if (query === `${naverPlace.name} ${naverPlace.address!.road}`) return [kakaoPlace({ name: '역전할머니맥주 서울낙성대역직영점' })];
      return [];
    });
    expect(queries).toEqual([
      naverPlace.address!.road,
      `${naverPlace.name} ${naverPlace.address!.road}`,
    ]);
    expect(result).toEqual({ kakaoPlaceId: 'kakao-1', mapUrl: 'https://place.map.kakao.com/kakao-1' });
  });

  it.each([
    ['different road address', kakaoPlace({ address: { display: '서울 관악구 봉천동 2', road: '서울 관악구 남부순환로 2' } })],
    ['distant coordinate', kakaoPlace({ coordinates: { latitude: 37.477, longitude: 126.963 } })],
  ])('rejects a %s', async (_case, result) => {
    await expect(resolveKakaoPlaceLink(naverPlace, async () => [result])).resolves.toBeUndefined();
  });

  it('rejects an ambiguous set of otherwise matching Kakao results', async () => {
    await expect(resolveKakaoPlaceLink(naverPlace, async () => [kakaoPlace(), kakaoPlace({ identity: { provider: 'kakao', providerPlaceId: 'kakao-2' }, legacy: { kakaoPlaceId: 'kakao-2' } })])).resolves.toBeUndefined();
  });
});
