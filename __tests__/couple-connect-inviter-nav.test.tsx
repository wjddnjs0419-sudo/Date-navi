import React from 'react';

// 초대한 쪽(대기 화면에 머무는 사용자)이 상대 수락을 realtime으로 감지해 자동 이동하는지 검증한다.
const mockReplace = jest.fn();
const mockRemoveChannel = jest.fn();

type ChangeHandler = (payload: { new: { status?: string; partner_user_id?: string | null } }) => void;
const listeners: ChangeHandler[] = [];
const subscribedFilters: string[] = [];

const state = {
  onboardingCompleted: false,
  coupleRow: {
    id: 'couple-1',
    code: 'DN-ABCD',
    owner_user_id: 'u1',
    partner_user_id: null as string | null,
    status: 'waiting',
    created_at: '2026-07-01T00:00:00Z',
    linked_at: null as string | null,
  },
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => require('react').useEffect(() => { cb(); }, []),
}));

jest.mock('expo-linking', () => ({ createURL: () => 'datenavi://couple' }));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  removeItem: async () => {},
  setItem: async () => {},
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('../components/illustration', () => {
  const { View } = require('react-native');
  return { Illustration: View, MINI_ILLUSTRATION_WIDTH: 130 };
});

jest.mock('../lib/analytics', () => ({ logEvent: jest.fn() }));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    language: 'ko',
    t: (key: string) => key,
    strings: {
      common: { error: '오류', cancel: '취소', save: '저장' },
      coupleConnect: new Proxy({}, { get: (_t, key) => String(key) }),
    },
  }),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      if (table === 'user_preferences') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { onboarding_completed: state.onboardingCompleted } }) }) }),
        };
      }
      if (table === 'date_planner_profiles') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: '수민', couple_id: 'couple-1', anniversary_date: null } }) }) }),
        };
      }
      if (table === 'date_planner_couples') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.coupleRow }) }) }),
        };
      }
      return {};
    },
    channel: () => ({
      on: (_event: string, opts: { filter?: string }, handler: ChangeHandler) => {
        if (opts?.filter) subscribedFilters.push(opts.filter);
        listeners.push(handler);
        return { subscribe: () => ({}) };
      },
    }),
    removeChannel: mockRemoveChannel,
  },
}));

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { unmount: () => void };
};

const CoupleConnectScreen = require('../app/onboarding/couple-connect').default;

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<CoupleConnectScreen />); });
  await TR.act(async () => {});
  return tree;
}

async function emitCoupleUpdate(row: { status: string; partner_user_id: string | null }) {
  await TR.act(async () => { listeners.forEach(fn => fn({ new: row })); });
  await TR.act(async () => {});
}

beforeEach(() => {
  mockReplace.mockClear();
  mockRemoveChannel.mockClear();
  listeners.length = 0;
  subscribedFilters.length = 0;
  state.onboardingCompleted = false;
  state.coupleRow = { ...state.coupleRow, partner_user_id: null, status: 'waiting' };
});

describe('커플 연결 — 초대자 자동 이동', () => {
  it('자기 커플 행만 구독한다', async () => {
    await render();
    expect(subscribedFilters).toEqual(['id=eq.couple-1']);
  });

  it('상대가 수락하면 대기 중이던 초대자를 connected 화면으로 보낸다', async () => {
    await render();
    expect(mockReplace).not.toHaveBeenCalled();

    await emitCoupleUpdate({ status: 'linked', partner_user_id: 'u2' });

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/connected');
  });

  it('아직 파트너가 없는 갱신에는 움직이지 않는다', async () => {
    await render();
    await emitCoupleUpdate({ status: 'waiting', partner_user_id: null });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('온보딩을 마친 사용자는 연결돼도 이동하지 않는다', async () => {
    state.onboardingCompleted = true;
    await render();
    await emitCoupleUpdate({ status: 'linked', partner_user_id: 'u2' });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('앱을 다시 열었을 때 이미 연결돼 있으면 곧장 connected로 보낸다', async () => {
    // 연결된 상태의 이 화면은 "커플 관리" 화면이라 온보딩을 이어갈 CTA가 없다.
    state.coupleRow = { ...state.coupleRow, status: 'linked', partner_user_id: 'u2' };
    await render();
    expect(mockReplace).toHaveBeenCalledWith('/onboarding/connected');
  });

  it('온보딩을 마친 사용자는 이미 연결돼 있어도 관리 화면에 머문다', async () => {
    state.onboardingCompleted = true;
    state.coupleRow = { ...state.coupleRow, status: 'linked', partner_user_id: 'u2' };
    await render();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('화면을 벗어나면 구독을 정리한다', async () => {
    const tree = await render();
    await TR.act(async () => { tree.unmount(); });
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });
});
