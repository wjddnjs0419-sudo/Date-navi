// 코스 응답 전송 후 백그라운드에서 도는 원장 기록. 어떤 실패도 밖으로 던지지 않는다 —
// 부가 기록이 원본 흐름을 되돌리는 구조를 만들지 않는다(스펙 오류 처리).
import type { PlacePriceFields } from '../../../shared/recommendation/place-price.ts';

export type PlaceLedgerCandidate = {
  kakaoPlaceId: string;
  name: string;
  categoryGroupCode: string;
  categoryName: string;
  address: string;
  roadAddress: string;
  mapUrl: string;
  latitude: number;
  longitude: number;
};

export type PlaceLedgerRow = {
  kakao_place_id: string;
  estimated_at: string | null;
};

type MinimalClient = {
  from: (table: string) => {
    upsert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>;
  };
  rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type PlacePriceRow = {
  kakao_place_id: string;
  estimated_min_krw: number | null;
  estimated_max_krw: number | null;
  observed_min_krw: number | null;
  observed_max_krw: number | null;
  observed_min_sample_count: number | null;
  observed_max_sample_count: number | null;
};

type PriceLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (col: string, ids: string[]) => Promise<{ data: PlacePriceRow[] | null; error: unknown }>;
    };
  };
};

export const PLACE_PRICE_COLUMNS =
  'kakao_place_id, estimated_min_krw, estimated_max_krw, observed_min_krw, observed_max_krw, '
  + 'observed_min_sample_count, observed_max_sample_count';

export function placePriceFieldsFromRows(rows: readonly PlacePriceRow[] | null): Map<string, PlacePriceFields> {
  return new Map((rows ?? []).map((row) => [row.kakao_place_id, {
    estimatedMinKRW: row.estimated_min_krw,
    estimatedMaxKRW: row.estimated_max_krw,
    observedMinKRW: row.observed_min_krw,
    observedMaxKRW: row.observed_max_krw,
    observedMinSampleCount: row.observed_min_sample_count ?? 0,
    observedMaxSampleCount: row.observed_max_sample_count ?? 0,
  }]));
}

// supabase-js는 조회 오류에 던지지 않는다. error를 버리면 예산 점수만 무증상으로 정지하므로
// 빈 맵을 돌려주되 반드시 로그를 남긴다(추천 자체는 계속되어야 한다).
export async function lookupPlacePrices(input: {
  client: PriceLookupClient;
  kakaoPlaceIds: readonly string[];
}): Promise<Map<string, PlacePriceFields>> {
  if (input.kakaoPlaceIds.length === 0) return new Map();
  const { data, error } = await input.client
    .from('places')
    .select(PLACE_PRICE_COLUMNS)
    .in('kakao_place_id', [...input.kakaoPlaceIds]);
  if (error) {
    console.error(JSON.stringify({ event: 'place_price_lookup_failed', error: String(error) }));
    return new Map();
  }
  return placePriceFieldsFromRows(data);
}

export async function recordPlaceKnowledge(input: {
  client: MinimalClient;
  places: readonly PlaceLedgerCandidate[];
  estimate: (place: PlaceLedgerCandidate) => Promise<{ minKRW: number; maxKRW: number } | null>;
  model: string;
}): Promise<void> {
  if (input.places.length === 0) return;
  try {
    const now = new Date().toISOString();
    // first_seen_at은 payload에서 제외한다 — upsert가 갱신하면 "언제부터 아는 장소인가"가 사라진다.
    const { error: upsertError } = await input.client.from('places').upsert(
      input.places.map((place) => ({
        kakao_place_id: place.kakaoPlaceId,
        place_name: place.name,
        address: place.address,
        road_address: place.roadAddress,
        map_url: place.mapUrl,
        category_group_code: place.categoryGroupCode,
        category_name: place.categoryName,
        latitude: place.latitude,
        longitude: place.longitude,
        last_seen_at: now,
        updated_at: now,
      })),
    );
    if (upsertError) throw upsertError;

    const claimId = crypto.randomUUID();
    const { data: claimedRows, error: claimError } = await input.client.rpc('claim_place_price_estimation', {
      p_kakao_place_ids: input.places.map((place) => place.kakaoPlaceId),
      p_claim_id: claimId,
    });
    if (claimError || !Array.isArray(claimedRows)) throw claimError ?? new Error('place price claim returned malformed data');
    const claimedPlaceIds = new Set(
      claimedRows
        .filter((row): row is { kakao_place_id: string } => (
          typeof row === 'object' && row !== null && typeof (row as { kakao_place_id?: unknown }).kakao_place_id === 'string'
        ))
        .map((row) => row.kakao_place_id),
    );

    let estimated = 0;
    let estimateFailed = 0;
    for (const place of input.places) {
      if (!claimedPlaceIds.has(place.kakaoPlaceId)) continue;
      try {
        const estimate = await input.estimate(place);
        // 추정 실패는 컬럼을 비워둔 채 넘어간다 — 다음 노출 때 자연히 재시도된다.
        if (!estimate) {
          estimateFailed += 1;
          await input.client.rpc('release_place_price_estimation_claim', {
            p_kakao_place_id: place.kakaoPlaceId,
            p_claim_id: claimId,
          });
          continue;
        }
        const { data: completed, error: completeError } = await input.client.rpc('complete_place_price_estimation', {
          p_kakao_place_id: place.kakaoPlaceId,
          p_claim_id: claimId,
          p_min_krw: estimate.minKRW,
          p_max_krw: estimate.maxKRW,
          p_model: input.model,
        });
        if (completeError || completed !== true) throw completeError ?? new Error('place price completion claim was lost');
        estimated += 1;
      } catch (error) {
        estimateFailed += 1;
        try {
          await input.client.rpc('release_place_price_estimation_claim', {
            p_kakao_place_id: place.kakaoPlaceId,
            p_claim_id: claimId,
          });
        } catch { /* release failure is reported with the original estimate failure */ }
        console.error(
          JSON.stringify({
            event: 'place_price_estimate_failed',
            kakaoPlaceId: place.kakaoPlaceId,
            error: String(error),
          }),
        );
      }
    }
    // 전 경로가 예외를 삼키므로 성공/실패는 이 요약으로만 드러난다 —
    // 추정이 전부 실패해도 사용자 화면은 정상으로 보인다.
    console.error(JSON.stringify({
      event: 'place_ledger_recorded',
      upserted: input.places.length,
      needsEstimate: claimedPlaceIds.size,
      estimated,
      estimateFailed,
    }));
  } catch (error) {
    console.error(JSON.stringify({ event: 'place_ledger_record_failed', error: String(error) }));
  }
}
