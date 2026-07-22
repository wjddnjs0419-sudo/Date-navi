import React from 'react';
import { Text } from 'react-native';

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (cb: () => void) => { ReactLocal.useEffect(() => { cb(); }, []); },
  };
});

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string, opts?: any) => (opts && 'count' in opts ? `${key}:${opts.count}` : key) }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('../lib/supabase', () => {
  const makeBuilder = (result: unknown) => {
    const builder: any = {
      select: () => builder, eq: () => builder, in: () => builder,
      order: () => builder, maybeSingle: async () => result,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return builder;
  };
  // 테스트별로 date_memories/date_cards 응답을 바꿔치기할 수 있도록 factory 내부 상태로 둔다.
  const state = {
    memories: [
      {
        id: 'm1', card_id: 'card1', title: '성수동 감성 데이트', review: '카페가 특히 좋았어요',
        want_again: true, created_at: '2026-07-15T00:00:00Z', photo_url: null,
      },
      {
        id: 'm2', card_id: 'card2', title: '한강 피크닉', review: '그냥 그랬어요',
        want_again: false, created_at: '2026-07-10T00:00:00Z', photo_url: null,
      },
    ] as unknown[],
    cards: [
      { id: 'card1', title: '성수동 감성 데이트', mode: 'make_course', estimated_time: '약 3시간', estimated_budget: '5만원', tags: ['산책', '카페'] },
      { id: 'card2', title: '한강 피크닉', mode: 'make_course', estimated_time: '약 2시간', estimated_budget: '2만원', tags: ['한강'] },
    ] as unknown[],
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: (table: string) => {
        if (table === 'date_planner_profiles') {
          return makeBuilder({ data: { couple_id: 'c1', anniversary_date: '2024-01-01' } });
        }
        if (table === 'date_planner_couples') {
          return makeBuilder({ data: { created_at: '2024-01-01', owner_user_id: 'u1' } });
        }
        if (table === 'date_memories') {
          return makeBuilder({ data: state.memories });
        }
        if (table === 'date_cards') {
          return makeBuilder({ data: state.cards });
        }
        return makeBuilder({ data: [] });
      },
    },
    __setMockMemories: (memories: unknown[]) => { state.memories = memories; },
  };
});

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

const MemoriesScreen = require('../app/(tabs)/memories').default;
const { __setMockMemories } = require('../lib/supabase') as { __setMockMemories: (memories: unknown[]) => void };

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<MemoriesScreen />); });
  await TR.act(async () => {});
  return tree;
}

function allText(tree: ReturnType<typeof TR.create>) {
  return tree.root.findAllByType(Text).map((n) => n.props.children).flat().join(' ');
}

describe('추억 화면 목업 계약', () => {
  it('헤더에 제목과 서브타이틀을 렌더한다', async () => {
    const tree = await render();
    const txt = allText(tree);
    expect(txt).toContain('memories.pageTitle');
    expect(txt).toContain('memories.subtitle');
  });

  it('통계(함께한 날/다시 하고 싶어요/이번 달)를 렌더한다', async () => {
    const tree = await render();
    const txt = allText(tree);
    expect(txt).toContain('memories.statDaysTogether');
    expect(txt).toContain('memories.statWantAgain');
    expect(txt).toContain('memories.statThisMonth');
  });

  it('로드된 추억의 제목을 렌더한다', async () => {
    const tree = await render();
    expect(allText(tree)).toContain('성수동 감성 데이트');
  });

  it('하단 추억 남기기 배너를 렌더한다', async () => {
    const tree = await render();
    expect(allText(tree)).toContain('memories.recordCta');
  });

  it('필터 탭(전체/베스트)을 렌더한다', async () => {
    const tree = await render();
    const txt = allText(tree);
    expect(txt).toContain('memories.filterAll');
    expect(txt).toContain('memories.filterBest');
  });

  it('기본 탭(전체)은 두 추억을 모두 보여준다', async () => {
    const tree = await render();
    const txt = allText(tree);
    expect(txt).toContain('성수동 감성 데이트');
    expect(txt).toContain('한강 피크닉');
  });

  it('베스트 탭을 누르면 want_again=true인 추억만 보여준다', async () => {
    const tree = await render();
    const { TouchableOpacity } = require('react-native');
    const bestTab = tree.root.findAllByType(TouchableOpacity).find((n) => n.props.testID === 'memories-tab-best');
    await TR.act(async () => { bestTab?.props.onPress(); });
    // FlatList가 예약하는 셀 렌더 갱신 타이머(기본 50ms)를 흘려보내 act 경고를 방지한다.
    await TR.act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    const txt = allText(tree);
    expect(txt).toContain('성수동 감성 데이트');
    expect(txt).not.toContain('한강 피크닉');
  });
});

describe('추억 화면 베스트 탭 빈 상태', () => {
  const defaultMemories = [
    {
      id: 'm1', card_id: 'card1', title: '성수동 감성 데이트', review: '카페가 특히 좋았어요',
      want_again: true, created_at: '2026-07-15T00:00:00Z', photo_url: null,
    },
    {
      id: 'm2', card_id: 'card2', title: '한강 피크닉', review: '그냥 그랬어요',
      want_again: false, created_at: '2026-07-10T00:00:00Z', photo_url: null,
    },
  ];

  afterEach(() => {
    // 다른 describe 블록의 테스트에 영향을 주지 않도록 기본 mock 데이터로 복원한다.
    __setMockMemories(defaultMemories);
  });

  it('베스트 탭에서 want_again=true인 추억이 하나도 없으면 빈 상태 문구를 보여준다', async () => {
    __setMockMemories([
      {
        id: 'm3', card_id: 'card1', title: '성수동 감성 데이트', review: '카페가 특히 좋았어요',
        want_again: false, created_at: '2026-07-15T00:00:00Z', photo_url: null,
      },
      {
        id: 'm4', card_id: 'card2', title: '한강 피크닉', review: '그냥 그랬어요',
        want_again: false, created_at: '2026-07-10T00:00:00Z', photo_url: null,
      },
    ]);
    const tree = await render();
    const { TouchableOpacity } = require('react-native');
    const bestTab = tree.root.findAllByType(TouchableOpacity).find((n) => n.props.testID === 'memories-tab-best');
    await TR.act(async () => { bestTab?.props.onPress(); });
    await TR.act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    const txt = allText(tree);
    expect(txt).toContain('memories.emptyBest');
    expect(txt).not.toContain('성수동 감성 데이트');
    expect(txt).not.toContain('한강 피크닉');
    // 탭 바는 계속 보여서 사용자가 다시 '전체'로 돌아갈 수 있어야 한다.
    expect(txt).toContain('memories.filterAll');
    expect(txt).toContain('memories.filterBest');
  });
});
