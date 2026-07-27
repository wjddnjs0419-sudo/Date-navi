// 코스 응답 전송 후 백그라운드에서 도는 원장 기록. 어떤 실패도 밖으로 던지지 않는다 —
// 부가 기록이 원본 흐름을 되돌리는 구조를 만들지 않는다(스펙 오류 처리).
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
    select: (columns: string) => {
      in: (col: string, ids: string[]) => Promise<{ data: PlaceLedgerRow[] | null; error: unknown }>;
    };
    update: (patch: Record<string, unknown>) => { eq: (col: string, id: string) => Promise<{ error: unknown }> };
  };
};

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

    const { data: rows, error: selectError } = await input.client
      .from('places')
      .select('kakao_place_id, estimated_at')
      .in(
        'kakao_place_id',
        input.places.map((place) => place.kakaoPlaceId),
      );
    if (selectError) throw selectError;
    const needsEstimate = new Set(
      (rows ?? []).filter((row) => row.estimated_at === null).map((row) => row.kakao_place_id),
    );

    for (const place of input.places) {
      if (!needsEstimate.has(place.kakaoPlaceId)) continue;
      try {
        const estimate = await input.estimate(place);
        // 추정 실패는 컬럼을 비워둔 채 넘어간다 — 다음 노출 때 자연히 재시도된다.
        if (!estimate) continue;
        const estimatedAt = new Date().toISOString();
        await input.client
          .from('places')
          .update({
            estimated_min_krw: estimate.minKRW,
            estimated_max_krw: estimate.maxKRW,
            estimated_at: estimatedAt,
            estimate_model: input.model,
            updated_at: estimatedAt,
          })
          .eq('kakao_place_id', place.kakaoPlaceId);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: 'place_price_estimate_failed',
            kakaoPlaceId: place.kakaoPlaceId,
            error: String(error),
          }),
        );
      }
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'place_ledger_record_failed', error: String(error) }));
  }
}
