import React from 'react';

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
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return new Proxy({}, {
    get: (_target, prop) => (props: any) => ReactLocal.createElement(View, { ...props, testID: `icon-${String(prop)}` }),
  });
});

jest.mock('../components/illustration', () => {
  const { View } = require('react-native');
  return { Illustration: ({ name, ...rest }: any) => <View testID={`illustration-${name}`} {...rest} /> };
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
          return makeBuilder({
            data: [
              {
                id: 'm1', card_id: 'card1', title: '성수동 감성 데이트', review: '카페가 특히 좋았어요',
                want_again: true, created_at: '2026-07-15T00:00:00Z', photo_url: null,
              },
            ],
          });
        }
        if (table === 'date_cards') {
          return makeBuilder({
            data: [
              { id: 'card1', title: '성수동 감성 데이트', mode: 'make_course', estimated_time: '약 3시간', estimated_budget: '5만원', tags: ['산책'] },
            ],
          });
        }
        return makeBuilder({ data: [] });
      },
    },
  };
});

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findByProps: (p: any) => any } };
};

const MemoriesScreen = require('../app/(tabs)/memories').default;

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<MemoriesScreen />); });
  await TR.act(async () => {});
  return tree;
}

describe('추억 화면 상단 통계 카드 아이콘', () => {
  it('왼쪽 박스 안에는 하트 캐릭터 일러스트가 있고 하트 아이콘은 없다', async () => {
    const tree = await render();
    const tile = tree.root.findByProps({ testID: 'memories-stats-icon-tile' });

    expect(tile.findAllByProps({ testID: 'illustration-mascot-heart-couple' }).length).toBeGreaterThan(0);
    expect(tile.findAllByProps({ testID: 'icon-Heart' }).length).toBe(0);
  });

  it('일러스트 박스에 흰 배경을 깔지 않는다', async () => {
    const { C } = require('../constants/colors');
    const tree = await render();
    const tile = tree.root.findByProps({ testID: 'memories-stats-icon-tile' });
    const flatStyle = Object.assign({}, ...[].concat(tile.props.style));

    expect(flatStyle.backgroundColor).not.toBe(C.white);
  });
});
