import { buildCourseInput } from '../lib/modeForm';
import { recommendationLocationSchema } from '../shared/recommendation/schemas';
import {
  LOCATION_SEARCH_DEBOUNCE_MS,
  LOCATION_SUGGESTION_LIMIT,
  createLatestLocationSearch,
  rankLocationDocuments,
  searchLocations,
  shouldSearchLocations,
  type KakaoLocationDocument,
} from '../lib/locationSearch';

const document = (
  id: string,
  name: string,
  categoryName: string,
  overrides: Partial<KakaoLocationDocument> = {},
): KakaoLocationDocument => ({
  id,
  placeName: name,
  categoryName,
  categoryGroupCode: '',
  addressName: '서울특별시',
  roadAddressName: '',
  x: `127.${id}`,
  y: `37.${id}`,
  ...overrides,
});

describe('location autocomplete search contract', () => {
  it('starts only at two trimmed characters and uses a 300ms debounce', () => {
    expect(shouldSearchLocations(' 강 ')).toBe(false);
    expect(shouldSearchLocations(' 강남 ')).toBe(true);
    expect(LOCATION_SEARCH_DEBOUNCE_MS).toBe(300);
  });

  it('does not invoke the Edge Function below the minimum query length', async () => {
    const invoke = jest.fn();

    await expect(searchLocations('강', invoke)).resolves.toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('ranks exact, prefix, station, neighborhood/landmark, public destinations, then general places', () => {
    const ranked = rankLocationDocuments('강남', [
      document('7', '강남식당', '음식점 > 한식'),
      document('6', '코엑스 전시장', '문화,예술 > 전시장'),
      document('5', '건국대학교', '교육,학문 > 대학교'),
      document('4', '역삼동', '지역 > 동'),
      document('3', '역삼역', '교통,수송 > 지하철역'),
      document('2', '강남역 지하상가', '가정,생활 > 시장'),
      document('1', '강남', '여행 > 명소'),
      document('8', '아무 식당', '음식점 > 한식'),
      document('9', '일반 장소', '서비스,산업'),
    ]);

    expect(ranked.map((item) => item.label)).toEqual([
      '강남',
      '강남역 지하상가',
      '역삼역',
      '역삼동',
      '코엑스 전시장',
      '건국대학교',
      '강남식당',
      '일반 장소',
    ]);
    expect(ranked.map((item) => item.kind)).toEqual([
      'landmark',
      'culture',
      'station',
      'neighborhood',
      'culture',
      'school',
      'place',
      'place',
    ]);
    expect(recommendationLocationSchema.safeParse(ranked[0]).success).toBe(true);
  });

  it('returns at most eight deterministic suggestions', () => {
    const docs = Array.from({ length: 12 }, (_, index) => (
      document(String(index + 1), `장소 ${index + 1}`, '서비스,산업')
    ));

    const ranked = rankLocationDocuments('장소', docs);

    expect(LOCATION_SUGGESTION_LIMIT).toBe(8);
    expect(ranked).toHaveLength(8);
    expect(ranked.map((item) => item.kakaoPlaceId)).toEqual(
      Array.from({ length: 8 }, (_, index) => String(index + 1)),
    );
  });

  it('accepts an address-search neighborhood without inventing a Kakao place ID', () => {
    const neighborhood = {
      ...document('unused', '성수동1가', '지역 > 주소', { x: '127.043', y: '37.544' }),
      id: undefined as unknown as string,
    };

    const [result] = rankLocationDocuments('성수동', [neighborhood]);

    expect(result).toMatchObject({
      source: 'kakao',
      label: '성수동1가',
      kind: 'neighborhood',
      latitude: 37.544,
      longitude: 127.043,
    });
    expect(result.kakaoPlaceId).toBeUndefined();
    expect(recommendationLocationSchema.safeParse(result).success).toBe(true);
  });

  it('prevents an older response from replacing the latest result', async () => {
    let resolveFirst!: (value: ReturnType<typeof rankLocationDocuments>) => void;
    let resolveSecond!: (value: ReturnType<typeof rankLocationDocuments>) => void;
    const first = new Promise<ReturnType<typeof rankLocationDocuments>>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<ReturnType<typeof rankLocationDocuments>>((resolve) => { resolveSecond = resolve; });
    const searcher = jest.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const latest = createLatestLocationSearch(searcher);

    const olderRequest = latest.search('성수');
    const latestRequest = latest.search('홍대');
    const hongdae = rankLocationDocuments('홍대', [document('2', '홍대입구역', '교통,수송 > 지하철역')]);
    resolveSecond(hongdae);
    await expect(latestRequest).resolves.toEqual(hongdae);
    resolveFirst(rankLocationDocuments('성수', [document('1', '성수역', '교통,수송 > 지하철역')]));

    await expect(olderRequest).resolves.toBeNull();
  });

  it('keeps a selected RecommendationLocation and mirrors its coordinates into the legacy search center', () => {
    const selected = rankLocationDocuments('서울숲', [
      document('123', '서울숲', '여행 > 공원', {
        addressName: '서울 성동구 성수동1가',
        x: '127.0374',
        y: '37.5444',
      }),
    ])[0];

    const input = buildCourseInput({ idea: '산책', recommendationLocation: selected });

    expect(input.recommendationLocation).toEqual(selected);
    expect(input.coords).toEqual({ x: '127.0374', y: '37.5444' });
    expect(input.location).toBeUndefined();
  });
});
