// __tests__/place-price.test.ts
import {
  priceAnchorKRW,
  observedBoundsFromAnswers,
  pickPriceRange,
  budgetScoreFor,
  shrunkPositiveRate,
  PRICE_LEVEL,
} from '../shared/recommendation/place-price';

describe('priceAnchorKRW', () => {
  it('예산을 코스 장소 수로 나눈 몫이 앵커다', () => {
    expect(priceAnchorKRW(30000, 3)).toBe(10000);
  });
  it('장소 수 0 이하나 예산 없음은 null', () => {
    expect(priceAnchorKRW(30000, 0)).toBeNull();
    expect(priceAnchorKRW(undefined, 3)).toBeNull();
  });
});

describe('observedBoundsFromAnswers', () => {
  it('비쌈은 하한, 저렴은 상한을 준다', () => {
    const result = observedBoundsFromAnswers([
      { priceLevel: PRICE_LEVEL.expensive, anchorKRW: 10000 },
      { priceLevel: PRICE_LEVEL.cheap, anchorKRW: 20000 },
    ]);
    expect(result).toEqual({ minKRW: 10000, maxKRW: 20000, contradictory: false });
  });
  it('극단값 한 건이 구간을 붕괴시키지 않는다(안쪽 백분위)', () => {
    // 하한 후보 [5000, 5200, 90000] — p75가 아닌 극단 max(90000)를 쓰면 상한과 모순난다.
    const result = observedBoundsFromAnswers([
      { priceLevel: PRICE_LEVEL.expensive, anchorKRW: 5000 },
      { priceLevel: PRICE_LEVEL.expensive, anchorKRW: 5200 },
      { priceLevel: PRICE_LEVEL.expensive, anchorKRW: 90000 },
      { priceLevel: PRICE_LEVEL.cheap, anchorKRW: 12000 },
    ]);
    expect(result.contradictory).toBe(false);
    expect(result.minKRW).toBeLessThanOrEqual(result.maxKRW!);
  });
  it('보정 후에도 하한 > 상한이면 contradictory', () => {
    const result = observedBoundsFromAnswers([
      { priceLevel: PRICE_LEVEL.expensive, anchorKRW: 30000 },
      { priceLevel: PRICE_LEVEL.cheap, anchorKRW: 5000 },
    ]);
    expect(result.contradictory).toBe(true);
    expect(result.minKRW).toBeNull();
    expect(result.maxKRW).toBeNull();
  });
  it('보통 답변은 구간에 관여하지 않는다', () => {
    expect(observedBoundsFromAnswers([{ priceLevel: PRICE_LEVEL.normal, anchorKRW: 10000 }]))
      .toEqual({ minKRW: null, maxKRW: null, contradictory: false });
  });
});

describe('pickPriceRange (소비 규칙: 관측 > 추정 > 모름)', () => {
  const base = {
    estimatedMinKRW: 8000, estimatedMaxKRW: 12000,
    observedMinKRW: null as number | null, observedMaxKRW: null as number | null,
  };
  it('관측이 하나라도 있으면 관측만 쓴다', () => {
    expect(pickPriceRange({ ...base, observedMinKRW: 15000 }))
      .toEqual({ source: 'observed', minKRW: 15000, maxKRW: null });
  });
  it('관측 없으면 추정', () => {
    expect(pickPriceRange(base)).toEqual({ source: 'estimated', minKRW: 8000, maxKRW: 12000 });
  });
  it('둘 다 없으면 unknown', () => {
    expect(pickPriceRange({ estimatedMinKRW: null, estimatedMaxKRW: null, observedMinKRW: null, observedMaxKRW: null }))
      .toEqual({ source: 'unknown', minKRW: null, maxKRW: null });
  });
});

describe('budgetScoreFor', () => {
  it('상한이 1인 몫 이하이면 가점', () => {
    expect(budgetScoreFor({ source: 'estimated', minKRW: 5000, maxKRW: 9000 }, 10000)).toBeGreaterThan(0);
  });
  it('하한이 몫의 1.5배를 넘으면 감점', () => {
    expect(budgetScoreFor({ source: 'estimated', minKRW: 20000, maxKRW: 30000 }, 10000)).toBeLessThan(0);
  });
  it('unknown은 0 — 어떤 필터링에도 관여하지 않는다', () => {
    expect(budgetScoreFor({ source: 'unknown', minKRW: null, maxKRW: null }, 10000)).toBe(0);
  });
  it('앵커 없으면 0', () => {
    expect(budgetScoreFor({ source: 'estimated', minKRW: 5000, maxKRW: 9000 }, null)).toBe(0);
  });
});

describe('shrunkPositiveRate (축소 보정)', () => {
  it('회귀: 표본 1건 긍정이 100%가 되지 않는다', () => {
    const rate = shrunkPositiveRate({ positives: 1, total: 1, priorRate: 0.6, priorStrength: 10 });
    expect(rate).toBeLessThan(1);
    expect(rate).toBeGreaterThan(0.6);
  });
  it('표본이 쌓일수록 자기 값에 수렴한다', () => {
    const small = shrunkPositiveRate({ positives: 1, total: 1, priorRate: 0.6, priorStrength: 10 });
    const large = shrunkPositiveRate({ positives: 100, total: 100, priorRate: 0.6, priorStrength: 10 });
    expect(large).toBeGreaterThan(small);
    expect(large).toBeCloseTo(1, 1);
  });
  it('표본 0이면 prior 그대로', () => {
    expect(shrunkPositiveRate({ positives: 0, total: 0, priorRate: 0.6, priorStrength: 10 })).toBe(0.6);
  });
});
