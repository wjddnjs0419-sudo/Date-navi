import React from 'react';

// 참여자(코드 입력)가 연결에 성공하면 connected 화면으로 가야 한다.
// joinWithCode 안에서 auth.mockRefreshSession()을 부르면 루트 레이아웃의
// onAuthStateChange(TOKEN_REFRESHED)가 발동해 전역 라우팅이 connected를
// preferences로 덮어써 화면이 "아주 짧게" 떴다 사라진다. 그래서 참여 플로우는
// 세션을 리프레시하지 않아야 한다.
const mockReplace = jest.fn();
const mockRefreshSession = jest.fn(async () => ({ data: { session: null }, error: null }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn(), canGoBack: () => false }),
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

jest.mock('../components/ui', () => {
  const RN = require('react-native');
  const Rr = require('react');
  const { View, Text } = RN;
  return {
    BackBar: View,
    BigButton: ({ onPress, children }: any) => Rr.createElement(Text, { onPress }, children),
    HeartDoodle: View,
    ListGroup: View,
    ListRow: View,
    SectionLabel: View,
    SoftCard: View,
  };
});

jest.mock('../components/pickers', () => {
  const { View } = require('react-native');
  return { DateWheelPicker: View, PickerSheet: View, defaultIsoDate: () => '2020-01-01' };
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

jest.mock('../lib/supabase', () => {
  // 셀렉트/업데이트 체인을 최소한으로 흉내 낸다. eq()는 더 이어붙일 수도, 바로 await
  // 될 수도 있어서 체이너블 + awaitable 둘 다 만족해야 한다.
  const awaitable = (value: any) => ({ then: (resolve: (v: any) => void) => resolve(value) });
  const selectResult = (table: string, cols: string) => {
    if (table === 'user_preferences') return { data: { onboarding_completed: false } };
    if (table === 'date_planner_profiles') {
      if (cols.includes('couple_id')) return { data: { display_name: '수민', couple_id: null, anniversary_date: null } };
      return { data: [] }; // select('user_id, anniversary_date')
    }
    if (table === 'date_planner_couples') return { data: { id: 'couple-1', owner_user_id: 'u1' }, error: null };
    return { data: null };
  };
  const selectChain = (table: string, cols: string): any => {
    const result = selectResult(table, cols);
    return {
      eq: () => selectChain(table, cols),
      maybeSingle: async () => result,
      then: (resolve: (v: any) => void) => resolve(result),
    };
  };
  return {
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u2' } } }),
        refreshSession: mockRefreshSession,
      },
      from: (table: string) => ({
        select: (cols: string) => selectChain(table, cols),
        update: () => ({ eq: () => awaitable({ error: null }) }),
      }),
      rpc: async () => ({ error: null }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: jest.fn(),
    },
  };
});

const { TextInput } = require('react-native');
const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => any;
};

const CoupleConnectScreen = require('../app/onboarding/couple-connect').default;

beforeEach(() => {
  mockReplace.mockClear();
  mockRefreshSession.mockClear();
});

describe('커플 연결 — 참여자 연결 성공', () => {
  it('연결에 성공하면 connected로 가고 세션을 리프레시하지 않는다', async () => {
    let tree!: any;
    await TR.act(async () => { tree = TR.create(<CoupleConnectScreen />); });
    await TR.act(async () => {});

    // 코드 입력 → 연결 버튼 활성화
    await TR.act(async () => {
      tree.root.findByType(TextInput).props.onChangeText('DN-WXYZ');
    });

    const connectBtn = tree.root.findAll(
      (n: any) => typeof n.props.children === 'string' && n.props.children === 'connectButton',
    )[0];
    await TR.act(async () => { await connectBtn.props.onPress(); });

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/connected');
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });
});
