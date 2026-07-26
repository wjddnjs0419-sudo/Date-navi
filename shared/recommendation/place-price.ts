// shared/recommendation/place-price.ts
// 장소 가격 두 계층(추정/관측)의 순수 계산. 스펙 §2·§5-1 참조. DB·네트워크 의존 없음.
// observedBoundsFromAnswers는 아직 SQL recompute_place_observed_price와 규칙이 다르다
// (SQL은 보간 percentile_cont, 여기는 비보간 표본 선택). 어느 쪽을 단일 소스로 삼을지는
// 마이그레이션 작성 시점의 결정 사항이며, 그때까지 이 함수의 프로덕션 소비자는 없다.

export const PRICE_LEVEL = { cheap: 1, normal: 2, expensive: 3 } as const;
export type PriceLevel = (typeof PRICE_LEVEL)[keyof typeof PRICE_LEVEL];

// 미결정 사항(스펙): 안쪽 백분위 값. 실측 분포 확인 전까지의 초기값.
export const OBSERVED_BOUND_INNER_PERCENTILE = 0.25;

export type PriceAnswer = { priceLevel: PriceLevel; anchorKRW: number };
export type ObservedBounds = { minKRW: number | null; maxKRW: number | null; contradictory: boolean };

export function priceAnchorKRW(totalBudgetKRW: number | null | undefined, stepCount: number): number | null {
  if (!totalBudgetKRW || !Number.isFinite(totalBudgetKRW) || totalBudgetKRW <= 0) return null;
  if (!Number.isFinite(stepCount) || stepCount <= 0) return null;
  const anchor = Math.round(totalBudgetKRW / stepCount);
  // 0원 앵커는 모든 장소를 예산 초과로 만든다. 몫이 0으로 반올림될 만큼
  // 작은 예산은 앵커가 없는 것과 같게 다룬다(점수 0).
  return anchor > 0 ? anchor : null;
}

// 보간하지 않고 실제 표본값을 고른다. 보간은 이상치를 부분적으로 섞어 들여
// (표본 3건에서 [5000, 5200, 90000]의 0.75분위는 47600) 구간을 붕괴시킨다.
// round 방향은 항상 이상치 반대쪽: 하한은 아래로, 상한은 위로.
function samplePercentile(sorted: readonly number[], fraction: number, towards: 'floor' | 'ceil'): number {
  const index = (sorted.length - 1) * fraction;
  return sorted[towards === 'floor' ? Math.floor(index) : Math.ceil(index)];
}

// "비쌈"(하한 주장)들은 극단 최대 대신 위에서 안쪽 백분위, "저렴"(상한 주장)들은
// 아래에서 안쪽 백분위. 한 답이 틀려도 구간이 붕괴하지 않는다(스펙 §5-1 가격).
export function observedBoundsFromAnswers(answers: readonly PriceAnswer[]): ObservedBounds {
  const lowers = answers.filter((a) => a.priceLevel === PRICE_LEVEL.expensive).map((a) => a.anchorKRW).sort((a, b) => a - b);
  const uppers = answers.filter((a) => a.priceLevel === PRICE_LEVEL.cheap).map((a) => a.anchorKRW).sort((a, b) => a - b);
  const minKRW = lowers.length > 0 ? samplePercentile(lowers, 1 - OBSERVED_BOUND_INNER_PERCENTILE, 'floor') : null;
  const maxKRW = uppers.length > 0 ? samplePercentile(uppers, OBSERVED_BOUND_INNER_PERCENTILE, 'ceil') : null;
  if (minKRW !== null && maxKRW !== null && minKRW > maxKRW) {
    // 모순이면 관측을 버리고 추정으로 되돌린다(신뢰도 낮음 취급).
    return { minKRW: null, maxKRW: null, contradictory: true };
  }
  return { minKRW, maxKRW, contradictory: false };
}

export type PlacePriceFields = {
  estimatedMinKRW: number | null;
  estimatedMaxKRW: number | null;
  observedMinKRW: number | null;
  observedMaxKRW: number | null;
};
export type PriceRange = { source: 'observed' | 'estimated' | 'unknown'; minKRW: number | null; maxKRW: number | null };

export function pickPriceRange(place: PlacePriceFields): PriceRange {
  if (place.observedMinKRW !== null || place.observedMaxKRW !== null) {
    return { source: 'observed', minKRW: place.observedMinKRW, maxKRW: place.observedMaxKRW };
  }
  if (place.estimatedMinKRW !== null || place.estimatedMaxKRW !== null) {
    return { source: 'estimated', minKRW: place.estimatedMinKRW, maxKRW: place.estimatedMaxKRW };
  }
  return { source: 'unknown', minKRW: null, maxKRW: null };
}

export const BUDGET_SCORE_WEIGHTS = {
  fit: 10,
  overPenalty: -15,
  // 하한이 몫을 얼마나 초과해야 감점하는지의 여유 계수. 균등 분할 앵커의 거칠기를 흡수한다.
  overHeadroomRatio: 1.5,
} as const;

export function budgetScoreFor(range: PriceRange, shareKRW: number | null): number {
  if (shareKRW === null || range.source === 'unknown') return 0;
  if (range.minKRW !== null && range.minKRW > shareKRW * BUDGET_SCORE_WEIGHTS.overHeadroomRatio) {
    return BUDGET_SCORE_WEIGHTS.overPenalty;
  }
  if (range.maxKRW !== null && range.maxKRW <= shareKRW) return BUDGET_SCORE_WEIGHTS.fit;
  return 0;
}

// 만족도 비율 축소 보정(shrinkage): (positives + prior*strength) / (total + strength).
// 표본 1건이 100%가 되지 않게 하는 것이 존재 이유(스펙 §5-1 만족도).
export function shrunkPositiveRate(input: {
  positives: number; total: number; priorRate: number; priorStrength: number;
}): number {
  const denominator = input.total + input.priorStrength;
  if (denominator <= 0) return input.priorRate;
  return (input.positives + input.priorRate * input.priorStrength) / denominator;
}
