/**
 * 스크린샷 전용 목업 Supabase 클라이언트.
 *
 * EXPO_PUBLIC_SCREENSHOT=1 일 때만 lib/supabase.ts 가 이걸 export 한다.
 * 실제 네트워크/인증 없이 fixture 데이터로 모든 화면을 채워 렌더하기 위한 dev 도구.
 * 프로덕션/평소 빌드에는 절대 포함되지 않는다(플래그로 격리).
 */

export interface MockSupabaseConfig {
  /** 테이블명 → 행 배열. */
  fixtures?: Record<string, any[]>;
  /** rpc 함수명 → 반환 데이터. */
  rpcResults?: Record<string, any>;
  /** edge function 명 → invoke 반환 데이터. */
  functionResults?: Record<string, any>;
  /** 가짜 세션/유저 id. */
  userId?: string;
}

const DEFAULT_USER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * 체이닝 가능하면서 await 가능한(thenable) 쿼리 빌더.
 * 알 수 없는 메서드(.eq/.order/.filter 등)는 자기 자신을 반환해 체이닝을 이어가고,
 * await 시 { data, error } 로 resolve 한다.
 */
function makeQueryBuilder(rows: any[]): any {
  const settle = (value: any) => Promise.resolve({ data: value, error: null, count: null, status: 200, statusText: 'OK' });

  return new Proxy(function () {}, {
    get(_target, prop: string) {
      if (prop === 'then') {
        // await 시 배열 전체 resolve
        return (resolve: (v: any) => void, reject?: (e: any) => void) =>
          settle(rows).then(resolve, reject);
      }
      if (prop === 'maybeSingle' || prop === 'single') {
        return () => settle(rows[0] ?? null);
      }
      if (prop === 'csv') {
        return () => settle('');
      }
      // insert/update/delete/upsert/select/eq/order/limit/in/... → 체이닝 유지
      return (..._args: any[]) => makeQueryBuilder(rows);
    },
    apply() {
      return makeQueryBuilder(rows);
    },
  });
}

function makeRpcBuilder(value: any): any {
  const settle = () => Promise.resolve({ data: value ?? null, error: null });
  return new Proxy(function () {}, {
    get(_target, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: any) => void, reject?: (e: any) => void) => settle().then(resolve, reject);
      }
      if (prop === 'maybeSingle' || prop === 'single') {
        return () => settle();
      }
      return (..._args: any[]) => makeRpcBuilder(value);
    },
    apply() {
      return makeRpcBuilder(value);
    },
  });
}

export function createMockSupabase(config: MockSupabaseConfig = {}): any {
  const { fixtures = {}, rpcResults = {}, functionResults = {}, userId = DEFAULT_USER_ID } = config;

  const fakeUser = {
    id: userId,
    email: 'screenshot@datenavi.local',
    user_metadata: { name: '스크린샷' },
    app_metadata: {},
    aud: 'authenticated',
    created_at: new Date(0).toISOString(),
  };
  const fakeSession = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: 9999999999,
    token_type: 'bearer',
    user: fakeUser,
  };

  return {
    from(table: string) {
      return makeQueryBuilder(fixtures[table] ?? []);
    },
    rpc(name: string, _args?: any) {
      return makeRpcBuilder(rpcResults[name] ?? null);
    },
    auth: {
      getSession: async () => ({ data: { session: fakeSession }, error: null }),
      getUser: async () => ({ data: { user: fakeUser }, error: null }),
      refreshSession: async () => ({ data: { session: fakeSession, user: fakeUser }, error: null }),
      signInWithIdToken: async () => ({ data: { session: fakeSession, user: fakeUser }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: (callback: (event: string, session: any) => void) => {
        setTimeout(() => callback('SIGNED_IN', fakeSession), 0);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    functions: {
      invoke: async (name: string, _options?: any) => ({ data: functionResults[name] ?? {}, error: null }),
    },
    storage: {
      from: (_bucket: string) => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://mock.local/${path}` } }),
        download: async () => ({ data: null, error: null }),
        upload: async () => ({ data: { path: 'mock' }, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
    channel: () => {
      const ch: any = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} };
      return ch;
    },
    removeChannel: () => {},
  };
}
