import {
  recordPlaceKnowledge,
  type PlaceLedgerCandidate,
  type PlaceLedgerRow,
} from '../supabase/functions/_shared/place-ledger';

function fakeDb() {
  const upserts: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  let existing: Partial<PlaceLedgerRow>[] = [];
  const client = {
    from: (_table: string) => ({
      upsert: async (rows: Record<string, unknown>[]) => {
        upserts.push(...rows);
        return { error: null };
      },
      select: (_columns: string) => ({
        in: async () => ({ data: existing, error: null }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          updates.push({ id, patch });
          return { error: null };
        },
      }),
    }),
  };
  return {
    client,
    upserts,
    updates,
    setExisting: (rows: Partial<PlaceLedgerRow>[]) => {
      existing = rows;
    },
  };
}

const place: PlaceLedgerCandidate = {
  kakaoPlaceId: 'k1',
  name: '가마솥김치전골',
  categoryName: '음식점 > 한식',
  categoryGroupCode: 'FD6',
  address: '서울 어딘가',
  roadAddress: '',
  mapUrl: '',
  latitude: 37.5,
  longitude: 127.0,
};

describe('recordPlaceKnowledge', () => {
  // 실패 경로는 의도적으로 구조화 로그를 남긴다 — 테스트 출력만 조용히 한다.
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('선정된 장소를 원장에 upsert하고 last_seen_at을 갱신한다', async () => {
    const db = fakeDb();
    db.setExisting([{ kakao_place_id: 'k1', estimated_at: '2026-07-01T00:00:00Z' }]);
    await recordPlaceKnowledge({
      client: db.client as never,
      places: [place],
      estimate: async () => ({ minKRW: 8000, maxKRW: 12000 }),
      model: 'claude-haiku-4-5',
    });
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({ kakao_place_id: 'k1', place_name: '가마솥김치전골' });
    expect(typeof db.upserts[0].last_seen_at).toBe('string');
  });

  it('원장 신원 스냅샷에 first_seen_at을 실지 않는다 — 최초 1회 default를 덮지 않기 위함', async () => {
    const db = fakeDb();
    db.setExisting([{ kakao_place_id: 'k1', estimated_at: '2026-07-01T00:00:00Z' }]);
    await recordPlaceKnowledge({
      client: db.client as never,
      places: [place],
      estimate: async () => null,
      model: 'm',
    });
    expect(db.upserts[0]).not.toHaveProperty('first_seen_at');
  });

  it('추정이 이미 있는 장소는 다시 추정하지 않는다', async () => {
    const db = fakeDb();
    db.setExisting([{ kakao_place_id: 'k1', estimated_at: '2026-07-01T00:00:00Z' }]);
    let called = 0;
    await recordPlaceKnowledge({
      client: db.client as never,
      places: [place],
      estimate: async () => {
        called += 1;
        return { minKRW: 1, maxKRW: 2 };
      },
      model: 'm',
    });
    expect(called).toBe(0);
    expect(db.updates).toHaveLength(0);
  });

  it('추정이 없는 장소만 추정해 estimated_* 컬럼을 채운다', async () => {
    const db = fakeDb();
    db.setExisting([{ kakao_place_id: 'k1', estimated_at: null }]);
    await recordPlaceKnowledge({
      client: db.client as never,
      places: [place],
      estimate: async () => ({ minKRW: 8000, maxKRW: 12000 }),
      model: 'claude-haiku-4-5',
    });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].id).toBe('k1');
    expect(db.updates[0].patch).toMatchObject({
      estimated_min_krw: 8000,
      estimated_max_krw: 12000,
      estimate_model: 'claude-haiku-4-5',
    });
  });

  it('추정 실패는 삼켜지고 장소는 모름으로 남는다 — 다음 노출 때 재시도', async () => {
    const db = fakeDb();
    db.setExisting([{ kakao_place_id: 'k1', estimated_at: null }]);
    await expect(
      recordPlaceKnowledge({
        client: db.client as never,
        places: [place],
        estimate: async () => {
          throw new Error('ai down');
        },
        model: 'm',
      }),
    ).resolves.toBeUndefined();
    expect(db.updates).toHaveLength(0);
  });

  it('추정 파싱 실패(null)도 컬럼을 채우지 않는다', async () => {
    const db = fakeDb();
    db.setExisting([{ kakao_place_id: 'k1', estimated_at: null }]);
    await recordPlaceKnowledge({
      client: db.client as never,
      places: [place],
      estimate: async () => null,
      model: 'm',
    });
    expect(db.updates).toHaveLength(0);
  });

  it('upsert 실패도 밖으로 던지지 않는다 — 부가 기록이 원본 흐름을 되돌리지 않는다', async () => {
    const client = {
      from: () => ({
        upsert: async () => ({ error: new Error('db down') }),
        select: () => ({ in: async () => ({ data: [], error: null }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    await expect(
      recordPlaceKnowledge({
        client: client as never,
        places: [place],
        estimate: async () => ({ minKRW: 1, maxKRW: 2 }),
        model: 'm',
      }),
    ).resolves.toBeUndefined();
  });

  it('장소가 없으면 아무것도 쓰지 않는다', async () => {
    const db = fakeDb();
    await recordPlaceKnowledge({
      client: db.client as never,
      places: [],
      estimate: async () => ({ minKRW: 1, maxKRW: 2 }),
      model: 'm',
    });
    expect(db.upserts).toHaveLength(0);
  });
});
