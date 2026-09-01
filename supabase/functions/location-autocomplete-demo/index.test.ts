import {
  createLocationAutocompleteDemoHandler,
  type LocationDocument,
} from './index';
import {
  handleLocationAutocomplete,
  type LocationSearchFetcher,
} from '../_shared/location-autocomplete-handler';
import { WebDemoRateLimitError } from '../_shared/web-demo-rate-limit';

const visitorHash = 'a'.repeat(64);
const networkHash = 'b'.repeat(64);

const response = (status: number, body: unknown): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const keywordDocument = (id: string, placeName: string, categoryName = '서비스,산업'): LocationDocument => ({
  id,
  placeName,
  categoryName,
  categoryGroupCode: '',
  addressName: '서울특별시',
  roadAddressName: '',
  x: '127.0276',
  y: '37.4979',
});

const request = (body: unknown, overrides: Record<string, string> = {}) => new Request('https://supabase.example/functions/v1/location-autocomplete-demo', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-web-demo-internal-token': 'internal-secret',
    'x-web-demo-visitor': visitorHash,
    'x-web-demo-network': networkHash,
    ...overrides,
  },
  body: JSON.stringify(body),
});

describe('location autocomplete demo', () => {
  it('normalizes Kakao keyword and address responses in the provider-neutral handler', async () => {
    const fetcher: LocationSearchFetcher = jest.fn(async (url) => (
      url.toString().includes('/keyword.json')
        ? response(200, { documents: [keywordDocument('1', '강남역')] })
        : response(200, { documents: [{ address_name: '서울 강남구 역삼동', x: '127.03', y: '37.5', address: { region_3depth_name: '역삼동' } }] })
    ));

    await expect(handleLocationAutocomplete('강남', fetcher)).resolves.toEqual([
      expect.objectContaining({ id: '1', placeName: '강남역' }),
      expect.objectContaining({ placeName: '역삼동', categoryName: '지역 > 주소' }),
    ]);
  });

  it.each([
    ['missing token', { 'x-web-demo-internal-token': '' }],
    ['wrong token', { 'x-web-demo-internal-token': 'wrong' }],
    ['invalid visitor hash', { 'x-web-demo-visitor': 'not-a-hash' }],
    ['invalid network hash', { 'x-web-demo-network': 'not-a-hash' }],
  ])('rejects %s before quota or Kakao access', async (_label, headers) => {
    const quota = jest.fn(async () => undefined);
    const search = jest.fn(async () => []);
    const handler = createLocationAutocompleteDemoHandler({ expectedToken: 'internal-secret', quota, search });

    const result = await handler(request({ query: '강남' }, headers));

    expect(result.status).toBe(401);
    expect(quota).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it.each([
    ['one character', '강'],
    ['empty', ''],
    ['81 characters', '가'.repeat(81)],
  ])('rejects %s query with 400', async (_label, query) => {
    const quota = jest.fn(async () => undefined);
    const search = jest.fn(async () => []);
    const handler = createLocationAutocompleteDemoHandler({ expectedToken: 'internal-secret', quota, search });

    await expect(handler(request({ query }))).resolves.toMatchObject({ status: 400 });
    expect(quota).not.toHaveBeenCalled();
  });

  it('rejects a request body above 1KB', async () => {
    const quota = jest.fn(async () => undefined);
    const search = jest.fn(async () => []);
    const handler = createLocationAutocompleteDemoHandler({ expectedToken: 'internal-secret', quota, search });

    const result = await handler(request({ query: '강남', padding: 'x'.repeat(1100) }));

    expect(result.status).toBe(413);
    expect(quota).not.toHaveBeenCalled();
  });

  it.each([
    ['visitor daily', 'WEB_DEMO_DAILY_LIMIT'],
    ['network daily', 'WEB_DEMO_NETWORK_LIMIT'],
    ['global daily', 'WEB_DEMO_GLOBAL_LIMIT'],
  ])('maps %s quota exhaustion to 429', async (_label, code) => {
    const quota = jest.fn(async () => {
      throw new WebDemoRateLimitError(code as 'WEB_DEMO_DAILY_LIMIT' | 'WEB_DEMO_NETWORK_LIMIT' | 'WEB_DEMO_GLOBAL_LIMIT');
    });
    const search = jest.fn(async () => []);
    const handler = createLocationAutocompleteDemoHandler({ expectedToken: 'internal-secret', quota, search });

    const result = await handler(request({ query: '강남' }));

    expect(result.status).toBe(429);
    expect(await result.json()).toMatchObject({ error: { code } });
    expect(search).not.toHaveBeenCalled();
  });

  it('passes both hashes to quota and returns at most eight deterministically ranked documents', async () => {
    const quota = jest.fn(async () => undefined);
    const documents = [
      keywordDocument('8', '강남식당', '음식점 > 한식'),
      keywordDocument('7', '강남', '여행 > 명소'),
      keywordDocument('6', '강남역', '교통,수송 > 지하철역'),
      keywordDocument('5', '역삼동', '지역 > 동'),
      keywordDocument('4', '코엑스 전시장', '문화,예술 > 전시장'),
      keywordDocument('3', '건국대학교', '교육,학문 > 대학교'),
      keywordDocument('2', '강남역 지하상가', '가정,생활 > 시장'),
      keywordDocument('1', '또 다른 일반 장소'),
      keywordDocument('9', '일반 장소'),
    ];
    const search = jest.fn(async () => documents);
    const handler = createLocationAutocompleteDemoHandler({ expectedToken: 'internal-secret', quota, search });

    const result = await handler(request({ query: '강남' }));

    expect(result.status).toBe(200);
    expect(quota).toHaveBeenCalledWith({ visitorHash, networkHash });
    expect((await result.json()).documents.map((document: LocationDocument) => document.placeName)).toEqual([
      '강남',
      '강남역',
      '강남역 지하상가',
      '역삼동',
      '코엑스 전시장',
      '건국대학교',
      '강남식당',
      '또 다른 일반 장소',
    ]);
  });

  it('returns 502 when both Kakao provider searches fail', async () => {
    const fetcher: LocationSearchFetcher = jest.fn(async () => response(503, {}));

    await expect(handleLocationAutocomplete('강남', fetcher)).rejects.toThrow('Location search failed');
  });
});
