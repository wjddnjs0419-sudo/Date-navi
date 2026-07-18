import React from 'react';
import { ActivityIndicator } from 'react-native';

// useFocusEffect 콜백을 캡처해 재포커스를 수동 트리거한다.
let mockFocusCallback: (() => void) | null = null;
// getUser()를 수동 제어해 재조회를 원하는 시점에 붙잡아두고 관찰한다.
let mockUserResolvers: Array<() => void> = [];

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      mockFocusCallback = cb;
      ReactLocal.useEffect(() => {
        cb();
      }, []);
    },
  };
});

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

// couple_id가 null이면 프로필 조회 후 나머지 쿼리는 건너뛴다 — 최소 경로.
jest.mock('../lib/supabase', () => {
  const makeBuilder = (result: unknown) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => result,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return builder;
  };
  return {
    supabase: {
      auth: {
        getUser: () =>
          new Promise((resolve) => {
            mockUserResolvers.push(() => resolve({ data: { user: { id: 'u1' } } }));
          }),
      },
      from: (table: string) => {
        if (table === 'notifications') return makeBuilder({ count: 0 });
        if (table === 'date_planner_profiles') {
          return makeBuilder({
            data: { display_name: '테스터', couple_id: null, profile_photo_url: null },
          });
        }
        return makeBuilder({ data: [] });
      },
    },
  };
});

const TestRenderer = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => {
    root: { findAllByType: (t: unknown) => unknown[] };
  };
};
const { act, create } = TestRenderer;

const HomeScreen = require('../app/(tabs)/index').default;

function countSpinners(tree: { root: { findAllByType: (t: unknown) => unknown[] } }) {
  return tree.root.findAllByType(ActivityIndicator).length;
}

// 대기 중인 getUser()를 풀어 해당 조회 사이클을 끝까지 흘린다.
async function resolvePendingFetch() {
  await act(async () => {
    const resolvers = mockUserResolvers;
    mockUserResolvers = [];
    resolvers.forEach((r) => r());
  });
}

describe('홈 화면 재포커스 로딩 UX', () => {
  beforeEach(() => {
    mockFocusCallback = null;
    mockUserResolvers = [];
  });

  it('최초 진입엔 스피너, 재포커스엔 스피너 없이 조용히 갱신한다', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<HomeScreen />);
    });

    // 최초 진입: 데이터 아직 미도착 → 전체 스피너 표시(정상).
    expect(countSpinners(tree)).toBe(1);

    await resolvePendingFetch();
    // 최초 로드 완료 → 콘텐츠 표시, 스피너 없음.
    expect(countSpinners(tree)).toBe(0);

    // 재포커스: 재조회는 시작되지만 아직 미완(getUser 대기 중).
    // 이 순간 전체 스피너로 화면을 덮으면 안 된다 — 기존 콘텐츠 유지.
    await act(async () => {
      mockFocusCallback?.();
    });
    expect(countSpinners(tree)).toBe(0);

    // 재조회 완료.
    await resolvePendingFetch();
    expect(countSpinners(tree)).toBe(0);
  });
});
