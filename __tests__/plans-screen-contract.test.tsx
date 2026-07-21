import React from 'react';
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

// 커플 연결 + 확정 데이트 1건. 계획 화면은 이 최소 데이터로 PlanListRow 목록을 렌더한다.
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
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: (table: string) => {
        if (table === 'date_planner_profiles') {
          return makeBuilder({ data: { couple_id: 'c1' } });
        }
        if (table === 'date_cards') {
          return makeBuilder({
            data: [{
              id: 'p1', title: '성수동 감성 데이트 코스', tags: ['식사', '카페'],
              confirmed_date: '2026-07-22', confirmed_time: '오후 2:00', confirmed_place: '성수동',
            }],
          });
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

describe('데이트 계획 화면 목업 계약', () => {
  it('확정 데이트를 PlanListRow로 렌더한다', async () => {
    const tree = await render();
    const rows = tree.root.findAllByType(PlanListRow);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].props.title).toBe('성수동 감성 데이트 코스');
  });
});
