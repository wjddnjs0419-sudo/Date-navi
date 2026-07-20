import type { RecommendationRequest } from '../shared/recommendation/schemas';
import type { KakaoFetch } from '../supabase/functions/_shared/recommendation-search';
import { searchAndRankRecommendation } from '../supabase/functions/_shared/recommendation-search-pipeline';

const baseRequest = (): RecommendationRequest => ({
  requestId: 'request-picked',
  mode: 'course',
  language: 'ko',
  location: {
    source: 'kakao',
    label: 'Seoul Forest',
    latitude: 37.5444,
    longitude: 127.0374,
    kind: 'landmark',
  },
  courseSteps: [
    { id: 'step-0', category: 'meal', label: '식사' },
    { id: 'step-1', category: 'cafe', label: '카페' },
  ],
});

const document = (id: string, overrides: Record<string, string> = {}) => ({
  id,
  place_name: `Place ${id}`,
  category_group_code: 'CE7',
  category_group_name: '카페',
  category_name: '음식점 > 카페',
  address_name: '서울 성동구',
  road_address_name: '서울 성동구 왕십리로',
  x: '127.038',
  y: '37.545',
  place_url: `https://place.map.kakao.com/${id}`,
  ...overrides,
});

const response = (status: number, body: unknown): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn(async () => body),
} as unknown as Response);

const PICKED_NAME = '블루보틀 성수';

// query=PICKED_NAME인 keyword 검색에만 picked-1을 노출하고, 그 외 검색엔 노출하지 않는 fetcher.
const makeFetcher = (executedQueries: string[]): KakaoFetch => jest.fn(async (input: string | URL | Request) => {
  const query = new URL(String(input)).searchParams.get('query') ?? '';
  executedQueries.push(query);
  if (query === PICKED_NAME) {
    return response(200, { documents: [document('picked-1', {
      category_group_code: 'CE7', category_group_name: '카페', category_name: '음식점 > 카페',
    })] });
  }
  return response(200, {
    documents: Array.from({ length: 12 }, (_, index) => document(`plain-${query}-${index}`)),
  });
}) as KakaoFetch;

describe('searchAndRankRecommendation — 수동 지정 장소 병합', () => {
  it('replacement.pickedName을 이름으로 재검색해 후보 풀에 병합한다', async () => {
    const executedQueries: string[] = [];
    const request: RecommendationRequest = {
      ...baseRequest(),
      replacement: { stepId: 'step-0', kakaoPlaceId: 'picked-1', pickedName: PICKED_NAME },
    };

    const result = await searchAndRankRecommendation(request, {
      kakaoRestApiKey: 'x',
      fetcher: makeFetcher(executedQueries),
    });

    expect(executedQueries).toContain(PICKED_NAME);
    expect(result.candidates.some((candidate) => candidate.kakaoPlaceId === 'picked-1')).toBe(true);
  });

  it('courseSteps의 pinnedName들을 각각 재검색해 후보 풀에 병합한다', async () => {
    const executedQueries: string[] = [];
    const request: RecommendationRequest = {
      ...baseRequest(),
      courseSteps: [
        { id: 'step-0', category: 'meal', label: '블루보틀 성수', pinnedKakaoPlaceId: 'picked-1', pinnedName: PICKED_NAME },
        { id: 'step-1', category: 'cafe', label: '카페' },
      ],
    };

    const result = await searchAndRankRecommendation(request, {
      kakaoRestApiKey: 'x',
      fetcher: makeFetcher(executedQueries),
    });

    expect(executedQueries).toContain(PICKED_NAME);
    expect(result.candidates.some((candidate) => candidate.kakaoPlaceId === 'picked-1')).toBe(true);
  });

  it('이미 풀에 있는 핀은 재검색하지 않는다', async () => {
    const executedQueries: string[] = [];
    const alreadyPresentFetcher: KakaoFetch = jest.fn(async (input: string | URL | Request) => {
      const query = new URL(String(input)).searchParams.get('query') ?? '';
      executedQueries.push(query);
      return response(200, { documents: [document('picked-1'), ...Array.from({ length: 11 }, (_, i) => document(`p-${query}-${i}`))] });
    }) as KakaoFetch;
    const request: RecommendationRequest = {
      ...baseRequest(),
      courseSteps: [
        { id: 'step-0', category: 'meal', label: 'x', pinnedKakaoPlaceId: 'picked-1', pinnedName: PICKED_NAME },
        { id: 'step-1', category: 'cafe', label: '카페' },
      ],
    };

    await searchAndRankRecommendation(request, { kakaoRestApiKey: 'x', fetcher: alreadyPresentFetcher });

    expect(executedQueries).not.toContain(PICKED_NAME);
  });

  it('replacement가 없으면 지정 장소 재검색을 하지 않는다', async () => {
    const executedQueries: string[] = [];

    const result = await searchAndRankRecommendation(baseRequest(), {
      kakaoRestApiKey: 'x',
      fetcher: makeFetcher(executedQueries),
    });

    expect(executedQueries).not.toContain(PICKED_NAME);
    expect(result.candidates.some((candidate) => candidate.kakaoPlaceId === 'picked-1')).toBe(false);
  });
});
