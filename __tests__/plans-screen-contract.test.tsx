import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { PlanListRow } from '../components/ui';

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      ReactLocal.useEffect(() => { cb(); }, []);
    },
  };
});

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, language: 'ko' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

// 커플 연결 + 확정/제안 데이트. 계획 화면은 이 데이터로 예정/조율중/완료 탭을 분류해 렌더한다.
jest.mock('../lib/supabase', () => {
  const makeBuilder = (result: unknown) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => result,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return builder;
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: (table: string) => {
        if (table === 'date_planner_profiles') {
          return makeBuilder({ data: { couple_id: 'c1' } });
        }
        if (table === 'date_cards') {
          return makeBuilder({
            data: [
              {
                id: 'p1', title: '성수동 감성 데이트 코스', tags: ['식사', '카페'], status: 'confirmed',
                confirmed_date: '2026-07-22', confirmed_time: '오후 2:00', confirmed_place: '성수동',
              },
              {
                id: 'p2', title: '와인 바 데이트', tags: ['와인'], status: 'active',
                confirmed_date: null, confirmed_time: null, confirmed_place: null,
              },
            ],
          });
        }
        if (table === 'soft_messages') {
          return makeBuilder({ data: [{ card_id: 'p2', user_id: 'u1' }] });
        }
        if (table === 'reactions') {
          return makeBuilder({ data: [] });
        }
        return makeBuilder({ data: [] });
      },
    },
  };
});

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

const PlansScreen = require('../app/plans/index').default;

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<PlansScreen />); });
  await TR.act(async () => {});
  return tree;
}

function allText(tree: ReturnType<typeof TR.create>): string {
  return tree.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c) => typeof c === 'string' || typeof c === 'number')
    .join(' ');
}

describe('데이트 계획 화면 목업 계약', () => {
  it('확정 데이트를 PlanListRow로 렌더한다', async () => {
    const tree = await render();
    const rows = tree.root.findAllByType(PlanListRow);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].props.title).toBe('성수동 감성 데이트 코스');
  });

  it('상태 탭(예정/조율 중/완료)을 렌더한다', async () => {
    const tree = await render();
    const txt = allText(tree);
    expect(txt).toContain('plans.tabUpcoming');
    expect(txt).toContain('plans.tabCoordinating');
    expect(txt).toContain('plans.tabDone');
  });

  it('기본 탭(예정)엔 confirmed 카드만 보인다', async () => {
    const tree = await render();
    const rows = tree.root.findAllByType(PlanListRow);
    expect(rows.length).toBe(1);
    expect(rows[0].props.title).toBe('성수동 감성 데이트 코스');
  });

  it('조율 중 탭을 누르면 상대 응답 대기 문구를 보여준다', async () => {
    const tree = await render();
    const tabs = tree.root.findAllByType(TouchableOpacity);
    const coordinatingTab = tabs.find((n) => n.props.testID === 'plans-tab-coordinating');
    await TR.act(async () => { coordinatingTab?.props.onPress(); });
    expect(allText(tree)).toContain('plans.coordinatingStatus');
  });
});
