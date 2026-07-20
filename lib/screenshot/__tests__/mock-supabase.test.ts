import { createMockSupabase } from '../mock-supabase';

describe('createMockSupabase (스크린샷 목업 클라이언트)', () => {
  const fixtures = {
    date_planner_profiles: [{ user_id: 'u1', display_name: '테스터', couple_id: 'c1' }],
    date_cards: [{ id: 'card1', title: '코스 A' }, { id: 'card2', title: '코스 B' }],
  };

  it('from().select().eq() 체이닝 후 await 하면 fixture 배열을 반환한다', async () => {
    const mock = createMockSupabase({ fixtures });
    const { data, error } = await mock
      .from('date_cards')
      .select('*')
      .eq('couple_id', 'c1')
      .order('created_at');
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data[0].title).toBe('코스 A');
  });

  it('maybeSingle()/single() 은 첫 행을 반환한다', async () => {
    const mock = createMockSupabase({ fixtures });
    const { data } = await mock
      .from('date_planner_profiles')
      .select('display_name, couple_id')
      .eq('user_id', 'u1')
      .maybeSingle();
    expect(data).toEqual({ user_id: 'u1', display_name: '테스터', couple_id: 'c1' });
  });

  it('픽스처 없는 테이블은 빈 배열 / null 을 반환한다', async () => {
    const mock = createMockSupabase({ fixtures });
    const list = await mock.from('unknown_table').select('*');
    expect(list.data).toEqual([]);
    const one = await mock.from('unknown_table').select('*').maybeSingle();
    expect(one.data).toBeNull();
  });

  it('insert/update/delete/upsert 는 에러 없이 resolve 된다', async () => {
    const mock = createMockSupabase({ fixtures });
    for (const op of ['insert', 'update', 'delete', 'upsert'] as const) {
      const res = await mock.from('date_cards')[op]({});
      expect(res.error).toBeNull();
    }
  });

  it('auth.getSession 은 가짜 세션을, getUser 는 가짜 유저를 반환한다', async () => {
    const mock = createMockSupabase({ fixtures, userId: 'u1' });
    const { data: { session } } = await mock.auth.getSession();
    expect(session?.user?.id).toBe('u1');
    const { data: { user } } = await mock.auth.getUser();
    expect(user?.id).toBe('u1');
  });

  it('auth.onAuthStateChange 는 SIGNED_IN 을 비동기로 통지하고 unsubscribe 가능하다', async () => {
    const mock = createMockSupabase({ fixtures, userId: 'u1' });
    const events: string[] = [];
    const { data: { subscription } } = mock.auth.onAuthStateChange((event: string) => {
      events.push(event);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toContain('SIGNED_IN');
    expect(() => subscription.unsubscribe()).not.toThrow();
  });

  it('rpc 는 지정한 결과를, functions.invoke 는 지정한 데이터를 반환한다', async () => {
    const mock = createMockSupabase({
      fixtures,
      rpcResults: { get_recommendation_session: { id: 's1' } },
      functionResults: { 'recommend-date': { ok: true } },
    });
    const rpc = await mock.rpc('get_recommendation_session', {});
    expect(rpc.data).toEqual({ id: 's1' });
    const fn = await mock.functions.invoke('recommend-date', {});
    expect(fn.data).toEqual({ ok: true });
  });

  it('storage.from().getPublicUrl() 는 안전한 형태를 반환한다', () => {
    const mock = createMockSupabase({ fixtures });
    const res = mock.storage.from('avatars').getPublicUrl('x.png');
    expect(res.data).toHaveProperty('publicUrl');
  });
});
