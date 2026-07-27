import type { RecommendationRequest } from '../shared/recommendation/schemas';
import type { KakaoFetch } from '../supabase/functions/_shared/recommendation-search';
import type { PlacePriceFields } from '../shared/recommendation/place-price';
import { searchAndRankRecommendation } from '../supabase/functions/_shared/recommendation-search-pipeline';

const baseRequest = (): RecommendationRequest => ({
  requestId: 'request-price',
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

const response = (body: unknown): Response => ({
  ok: true,
  status: 200,
  json: jest.fn(async () => body),
} as unknown as Response);

const fetcher: KakaoFetch = jest.fn(async (input: string | URL | Request) => {
  const query = new URL(String(input)).searchParams.get('query') ?? '';
  return response({
    documents: Array.from({ length: 12 }, (_, index) => ({
      id: `place-${query}-${index}`,
      place_name: `Place ${query} ${index}`,
      category_group_code: 'CE7',
      category_group_name: '카페',
      category_name: '음식점 > 카페',
      address_name: '서울 성동구',
      road_address_name: '서울 성동구 왕십리로',
      x: '127.038',
      y: '37.545',
      place_url: 'https://place.map.kakao.com/1',
    })),
  });
}) as KakaoFetch;

const priceFields = (over: Partial<PlacePriceFields> = {}): PlacePriceFields => ({
  estimatedMinKRW: null,
  estimatedMaxKRW: null,
  observedMinKRW: null,
  observedMaxKRW: null,
  observedSampleCount: 0,
  ...over,
});

describe('searchAndRankRecommendation — 장소 가격 조회', () => {
  it('예산이 있으면 검색된 장소 id들로 priceLookup을 호출해 budget 점수에 반영한다', async () => {
    const lookedUp: string[][] = [];
    const result = await searchAndRankRecommendation(
      { ...baseRequest(), totalBudgetKRW: 30000 },
      {
        kakaoRestApiKey: 'key',
        fetcher,
        priceLookup: async (ids) => {
          lookedUp.push(ids);
          return new Map(ids.map((id) => [id, priceFields({ estimatedMinKRW: 4000, estimatedMaxKRW: 9000 })]));
        },
      },
    );

    expect(lookedUp).toHaveLength(1);
    expect(lookedUp[0].length).toBeGreaterThan(0);
    expect(result.candidates.every((candidate) => candidate.scoreBreakdown.budget > 0)).toBe(true);
  });

  it('예산이 없으면 조회하지 않는다 — 쓰지 않을 값을 위해 DB를 때리지 않는다', async () => {
    let called = 0;
    await searchAndRankRecommendation(baseRequest(), {
      kakaoRestApiKey: 'key',
      fetcher,
      priceLookup: async () => {
        called += 1;
        return new Map();
      },
    });

    expect(called).toBe(0);
  });

  it('가격 조회 실패는 추천을 막지 않는다', async () => {
    const result = await searchAndRankRecommendation(
      { ...baseRequest(), totalBudgetKRW: 30000 },
      {
        kakaoRestApiKey: 'key',
        fetcher,
        priceLookup: async () => {
          throw new Error('db down');
        },
      },
    );

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((candidate) => candidate.scoreBreakdown.budget === 0)).toBe(true);
  });
});
