import { resolveKakaoPlaceLink, resolveKakaoPlaceLinkDetailed, searchKakaoPlacesForLink, searchKakaoPlacesForLinkDetailed } from '../supabase/functions/_shared/kakao-place-link';
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

  it('retries a branch-labelled Naver name with its brand name when Kakao has no branch-labelled result', async () => {
    const villa: NormalizedPlace = {
      identity: { provider: 'naver', providerPlaceId: 'naver-villa' },
      name: '빌라 더 다이닝 홍대본점',
      category: { normalized: 'meal' },
      address: { display: '서울 마포구 동교동 150-9', road: '서울 마포구 동교로30길 16' },
      coordinates: { latitude: 37.5601583, longitude: 126.9249144 },
      evidence: { provider: 'naver', searchTerms: ['음식점'] },
    };
    const queries: string[] = [];

    const result = await resolveKakaoPlaceLink(villa, async (query) => {
      queries.push(query);
      return query === '빌라 더 다이닝'
        ? [kakaoPlace({
          identity: { provider: 'kakao', providerPlaceId: 'kakao-villa' },
          name: '빌라 더 다이닝 연남본점',
          category: { normalized: 'meal' },
          address: { display: '서울 마포구 동교동 150-9', road: '서울 마포구 동교로30길 16' },
          coordinates: { latitude: 37.56020, longitude: 126.92494 },
          mapUrl: 'https://place.map.kakao.com/kakao-villa',
          legacy: { kakaoPlaceId: 'kakao-villa' },
        })]
        : [];
    });

    expect(queries).toContain('빌라 더 다이닝');
    expect(result).toEqual({ kakaoPlaceId: 'kakao-villa', mapUrl: 'https://place.map.kakao.com/kakao-villa' });
  });

  it('matches when Naver has only a parcel address and Kakao has both address forms', async () => {
    const naverWithOnlyParcelAddress: NormalizedPlace = {
      ...naverPlace,
      address: { display: naverPlace.address!.display },
    };

    await expect(resolveKakaoPlaceLink(naverWithOnlyParcelAddress, async () => [kakaoPlace()]))
      .resolves.toEqual({ kakaoPlaceId: 'kakao-1', mapUrl: 'https://place.map.kakao.com/kakao-1' });
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

  it('classifies link failures without turning them into recommendation failures', async () => {
    await expect(resolveKakaoPlaceLinkDetailed(naverPlace, async () => [])).resolves.toEqual({ reason: 'no_eligible_candidate' });
    await expect(resolveKakaoPlaceLinkDetailed(naverPlace, async () => [
      kakaoPlace(),
      kakaoPlace({ identity: { provider: 'kakao', providerPlaceId: 'kakao-2' }, legacy: { kakaoPlaceId: 'kakao-2' } }),
    ])).resolves.toEqual({ reason: 'ambiguous_candidate' });
    await expect(resolveKakaoPlaceLinkDetailed({ ...naverPlace, coordinates: undefined }, async () => [])).resolves.toEqual({ reason: 'missing_coordinates_or_address' });
  });

  it('reports address rejection diagnostics only when explicitly requested', async () => {
    const result = await resolveKakaoPlaceLinkDetailed(
      naverPlace,
      async () => [kakaoPlace({
        address: { display: '서울 관악구 봉천동 2', road: '서울 관악구 남부순환로 2' },
      })],
      { includeDiagnostics: true },
    );

    expect(result).toMatchObject({
      reason: 'no_eligible_candidate',
      diagnostics: {
        candidateCount: 1,
        eligibleCount: 0,
        candidates: [{ name: naverPlace.name, address: '서울 관악구 봉천동 2', roadAddress: '서울 관악구 남부순환로 2' }],
        rejectionCounts: { addressMismatch: 1 },
      },
    });
  });

  it('reports a missing Kakao ID separately from other candidate rejections', async () => {
    const result = await resolveKakaoPlaceLinkDetailed(
      naverPlace,
      async () => [kakaoPlace({ legacy: undefined })],
      { includeDiagnostics: true },
    );

    expect(result).toMatchObject({
      reason: 'no_eligible_candidate',
      diagnostics: {
        candidateCount: 1,
        eligibleCount: 0,
        rejectionCounts: { missingKakaoId: 1 },
      },
    });
  });

  it.each([
    {
      label: '빌라 더 다이닝 홍대의 특별시·건물명 표기 차이',
      naver: {
        identity: { provider: 'naver' as const, providerPlaceId: 'live-villa' },
        name: '빌라 더 다이닝 홍대본점',
        category: { normalized: 'meal' as const },
        address: {
          display: '서울특별시 마포구 동교동 150-9 JnS.Bldg',
          road: '서울특별시 마포구 동교로30길 16 JnS.Bldg',
        },
        coordinates: { latitude: 37.5601583, longitude: 126.9249144 },
        evidence: { provider: 'naver' as const, searchTerms: ['음식점'] },
      },
      kakao: {
        identity: { provider: 'kakao' as const, providerPlaceId: 'kakao-villa' },
        name: '빌라 더 다이닝 홍대점',
        category: { normalized: 'meal' as const },
        address: {
          display: '서울 마포구 동교동 150-9',
          road: '서울 마포구 동교로30길 16',
        },
        coordinates: { latitude: 37.56020, longitude: 126.92494 },
        mapUrl: 'https://place.map.kakao.com/kakao-villa',
        evidence: { provider: 'kakao' as const, searchTerms: ['빌라 더 다이닝 홍대점'] },
        legacy: { kakaoPlaceId: 'kakao-villa' },
      },
      expected: { kakaoPlaceId: 'kakao-villa', mapUrl: 'https://place.map.kakao.com/kakao-villa' },
    },
    {
      label: '베이글랜드 홍대의 특별시·층 표기 차이',
      naver: {
        identity: { provider: 'naver' as const, providerPlaceId: 'live-bagel' },
        name: '베이글랜드 홍대점',
        category: { normalized: 'cafe' as const },
        address: {
          display: '서울특별시 마포구 서교동 332-15 삼이빌딩 1층',
          road: '서울특별시 마포구 와우산로29바길 19 삼이빌딩 1층',
        },
        coordinates: { latitude: 37.5554909, longitude: 126.9259638 },
        evidence: { provider: 'naver' as const, searchTerms: ['카페'] },
      },
      kakao: {
        identity: { provider: 'kakao' as const, providerPlaceId: 'kakao-bagel' },
        name: '베이글랜드 홍대',
        category: { normalized: 'cafe' as const },
        address: {
          display: '서울 마포구 서교동 332-15',
          road: '서울 마포구 와우산로29바길 19',
        },
        coordinates: { latitude: 37.55554, longitude: 126.92599 },
        mapUrl: 'https://place.map.kakao.com/kakao-bagel',
        evidence: { provider: 'kakao' as const, searchTerms: ['베이글랜드 홍대'] },
        legacy: { kakaoPlaceId: 'kakao-bagel' },
      },
      expected: { kakaoPlaceId: 'kakao-bagel', mapUrl: 'https://place.map.kakao.com/kakao-bagel' },
    },
  ])('links $label using canonical address keys', async ({ naver, kakao, expected }) => {
    await expect(resolveKakaoPlaceLink(naver, async () => [kakao])).resolves.toEqual(expected);
  });
});

describe('searchKakaoPlacesForLink', () => {
  it('uses Kakao Local API authentication for Naver-to-Kakao linking', async () => {
    const fetcher = jest.fn(async () => new Response(JSON.stringify({ documents: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await searchKakaoPlacesForLink({ query: '서울숲 식당', kakaoRestApiKey: 'rest-key', fetcher });

    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      headers: { Authorization: 'KakaoAK rest-key' },
    }));
  });

  it('exposes the Kakao API outcome for link observability', async () => {
    const fetcher = jest.fn(async () => new Response('{}', { status: 401 }));
    await expect(searchKakaoPlacesForLinkDetailed({ query: '서울숲 식당', kakaoRestApiKey: 'rest-key', fetcher })).resolves.toMatchObject({ outcome: 'http_error', statusCode: 401, places: [] });
  });

  it('keeps a valid Kakao ID when the API omits place_url', async () => {
    const fetcher = jest.fn(async () => new Response(JSON.stringify({ documents: [{
      id: 'kakao-no-url',
      place_name: naverPlace.name,
      category_group_code: 'FD6',
      category_group_name: '음식점',
      category_name: '음식점 > 한식',
      address_name: naverPlace.address!.display,
      road_address_name: naverPlace.address!.road,
      x: String(naverPlace.coordinates!.longitude),
      y: String(naverPlace.coordinates!.latitude),
    }] }), { status: 200 }));

    const result = await resolveKakaoPlaceLink(naverPlace, (query) => searchKakaoPlacesForLink({
      query,
      kakaoRestApiKey: 'rest-key',
      fetcher,
    }));

    expect(result).toEqual({
      kakaoPlaceId: 'kakao-no-url',
      mapUrl: 'https://place.map.kakao.com/kakao-no-url',
    });
  });
});
