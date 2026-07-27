// 가격 추정은 코스 생성 인라인이 아니라 별도 호출이다 — 같은 장소가 세션마다 다른 값을
// 받으면 안 되고(가격은 장소의 속성), 코스 선택 프롬프트 품질을 흔들지 않기 위함(스펙 §4).
import { z } from 'zod';

export const PLACE_PRICE_PROMPT_VERSION = 'place-price-v1';

export type PlacePriceEstimationInput = {
  placeName: string;
  categoryName: string;
  address: string;
};

export function buildPlacePriceEstimationPrompt(place: PlacePriceEstimationInput): string {
  return [
    '너는 한국 데이트 장소의 1인 기준 예상 지출을 추정한다.',
    '아래 장소에서 방문자 1명이 통상적으로 쓰는 금액 범위를 원 단위 정수로 답하라.',
    '식당이면 1인 식사, 카페면 음료 1잔+디저트 절반, 관람·체험이면 1인 입장/이용료 기준.',
    '',
    `장소명: ${place.placeName}`,
    `카테고리: ${place.categoryName}`,
    `주소: ${place.address}`,
    '',
    'JSON만 출력: {"minKRW": <정수>, "maxKRW": <정수>}',
  ].join('\n');
}

const estimateSchema = z
  .object({
    minKRW: z.number().int().min(0).max(1_000_000),
    maxKRW: z.number().int().min(0).max(1_000_000),
  })
  .refine((v) => v.minKRW <= v.maxKRW);

export function parsePlacePriceEstimate(raw: unknown): { minKRW: number; maxKRW: number } | null {
  const parsed = estimateSchema.safeParse(raw);
  return parsed.success ? { minKRW: parsed.data.minKRW, maxKRW: parsed.data.maxKRW } : null;
}
