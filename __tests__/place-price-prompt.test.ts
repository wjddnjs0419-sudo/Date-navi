import {
  buildPlacePriceEstimationPrompt,
  parsePlacePriceEstimate,
  PLACE_PRICE_PROMPT_VERSION,
} from '../supabase/functions/_shared/place-price-prompt';

const place = {
  placeName: '메가MGC커피 강남점',
  categoryName: '음식점 > 카페 > 커피전문점',
  address: '서울 강남구 역삼동 123-4',
};

describe('buildPlacePriceEstimationPrompt', () => {
  it('추정 입력값 3종(카테고리·이름·주소)이 모두 프롬프트에 들어간다', () => {
    const prompt = buildPlacePriceEstimationPrompt(place);
    expect(prompt).toContain(place.placeName);
    expect(prompt).toContain(place.categoryName);
    expect(prompt).toContain(place.address);
    expect(prompt).toContain('1인');
  });

  it('버전 상수가 있다', () => {
    expect(PLACE_PRICE_PROMPT_VERSION).toMatch(/^place-price-v\d+$/);
  });
});

describe('parsePlacePriceEstimate', () => {
  it('정상 응답을 파싱한다', () => {
    expect(parsePlacePriceEstimate({ minKRW: 4000, maxKRW: 7000 })).toEqual({ minKRW: 4000, maxKRW: 7000 });
  });

  it('min > max, 음수, 비정수, 상한 초과는 null', () => {
    expect(parsePlacePriceEstimate({ minKRW: 9000, maxKRW: 4000 })).toBeNull();
    expect(parsePlacePriceEstimate({ minKRW: -1, maxKRW: 4000 })).toBeNull();
    expect(parsePlacePriceEstimate({ minKRW: 1000.5, maxKRW: 4000 })).toBeNull();
    expect(parsePlacePriceEstimate({ minKRW: 0, maxKRW: 2_000_000 })).toBeNull();
    expect(parsePlacePriceEstimate('garbage')).toBeNull();
  });
});
