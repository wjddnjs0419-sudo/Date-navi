import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// 배선이 빠지면 generate-ai가 400을 내고, 원장 쪽은 예외를 삼켜 100% 추정 실패가 무증상이 된다.
describe('generate-ai estimate_place_price 액션 배선', () => {
  const source = readFileSync(join(process.cwd(), 'supabase/functions/generate-ai/index.ts'), 'utf8');

  it('ACTION_CONFIG에 estimate_place_price가 등록돼 있다', () => {
    expect(source).toContain('estimate_place_price: { schema: PLACE_PRICE_SCHEMA');
  });

  it('_usage 봉투 없이 파싱 결과를 그대로 돌려준다', () => {
    expect(source).toMatch(/RAW_PASSTHROUGH_ACTIONS = new Set\(\[[^\]]*'estimate_place_price'[^\]]*\]\)/s);
  });
});
