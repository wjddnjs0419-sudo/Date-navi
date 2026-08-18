import { fetchNaverLocalPlaces, fetchNaverLocalPlacesWithStatus } from '../supabase/functions/_shared/providers/naver-place-provider';

describe('fetchNaverLocalPlaces', () => {
  it('uses comment sort, keeps credentials server-side, and normalizes WGS84 coordinates', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true,
      json: async () => ({ items: [{
        title: '<b>카페</b> 레이어드 성수', category: '음식점>카페', address: '서울 성동구 성수동1가 1',
        roadAddress: '서울 성동구 성수이로 1', link: 'https://example.com/layered',
        mapx: '1270550000', mapy: '375440000',
      }] }),
    })) as unknown as typeof fetch;

    const result = await fetchNaverLocalPlaces({
      query: '성수 카페', clientId: 'server-id', clientSecret: 'server-secret', fetcher,
    });

    const [url, init] = (fetcher as jest.Mock).mock.calls[0];
    expect(url).toContain('https://naverapihub.apigw.ntruss.com/search/v1/local?');
    expect(url).toContain('query=%EC%84%B1%EC%88%98+%EC%B9%B4%ED%8E%98');
    expect(url).toContain('display=5');
    expect(url).toContain('sort=comment');
    expect(init.headers).toEqual({ 'X-NCP-APIGW-API-KEY-ID': 'server-id', 'X-NCP-APIGW-API-KEY': 'server-secret' });
    expect(result[0]).toMatchObject({
      identity: { provider: 'naver', providerPlaceId: expect.stringMatching(/^local:[a-f0-9]{64}$/) },
      name: '카페 레이어드 성수',
      coordinates: { latitude: 37.544, longitude: 127.055 },
      category: { normalized: 'cafe' },
    });
  });

  it('creates the same provider-scoped identity when the local result has no detail link', async () => {
    const item = {
      title: '카페 레이어드 성수', category: '음식점>카페', address: '서울 성동구 성수동1가 1',
      roadAddress: '서울 성동구 성수이로 1', mapx: '1270550000', mapy: '375440000',
    };
    const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ items: [item] }) })) as unknown as typeof fetch;

    const [first] = await fetchNaverLocalPlaces({ query: '성수 카페', clientId: 'server-id', clientSecret: 'server-secret', fetcher });
    const [second] = await fetchNaverLocalPlaces({ query: '성수 카페', clientId: 'server-id', clientSecret: 'server-secret', fetcher });

    expect(first).toMatchObject({
      identity: { provider: 'naver', providerPlaceId: expect.stringMatching(/^local:[a-f0-9]{64}$/) },
    });
    expect(first).not.toHaveProperty('mapUrl');
    expect(second.identity).toEqual(first.identity);
  });

  it('reports the upstream HTTP status when Naver rejects a search request', async () => {
    const fetcher = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ errorMessage: 'Unauthorized' }),
    })) as unknown as typeof fetch;

    const result = await fetchNaverLocalPlacesWithStatus({
      query: '성수 카페', clientId: 'server-id', clientSecret: 'server-secret', fetcher,
    });

    expect(result).toEqual({ places: [], outcome: 'http_error', statusCode: 401, cacheHit: false });
  });
});
