import React from 'react';
import { Text } from 'react-native';
import { Wordmark } from '../components/brand';
import { Illustration } from '../components/illustration';
import { CourseMapPreview } from '../components/course-map';
import { BigButton, MetaChipRow, PlanListRow } from '../components/ui';

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

// 커플 연결 + 확정 데이트 1건. 홈은 이 최소 데이터로 새 레이아웃을 렌더한다.
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
        if (table === 'notifications') return makeBuilder({ count: 0 });
        if (table === 'date_planner_profiles') {
          return makeBuilder({
            data: { display_name: '지원', couple_id: 'c1', profile_photo_url: null },
          });
        }
        if (table === 'date_cards') {
          return makeBuilder({
            data: [{
              id: 'p1', title: '성수동 감성 데이트 코스',
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

const HomeScreen = require('../app/(tabs)/index').default;

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<HomeScreen />); });
  await TR.act(async () => {});
  return tree;
}

describe('홈 화면 목업 계약', () => {
  it('워드마크 헤더를 렌더한다', async () => {
    const tree = await render();
    expect(tree.root.findAllByType(Wordmark).length).toBe(1);
  });

  it('히어로에 home-map-book 일러스트를 렌더한다', async () => {
    const tree = await render();
    const hero = tree.root.findAllByType(Illustration).filter((n) => n.props.name === 'home-map-book');
    expect(hero.length).toBe(1);
  });

  it('새 코스 카드에 CourseMapPreview·MetaChipRow·CTA 버튼을 렌더한다', async () => {
    const tree = await render();
    expect(tree.root.findAllByType(CourseMapPreview).length).toBe(1);
    expect(tree.root.findAllByType(MetaChipRow).length).toBe(1);
    expect(tree.root.findAllByType(BigButton).length).toBeGreaterThanOrEqual(1);
  });

  it('다가오는 데이트를 PlanListRow로 렌더한다', async () => {
    const tree = await render();
    const rows = tree.root.findAllByType(PlanListRow);
    expect(rows.length).toBe(1);
    expect(rows[0].props.title).toBe('성수동 감성 데이트 코스');
  });

  it('목업에 없는 상대 반응·둘 다 끌린 후보 섹션은 렌더하지 않는다', async () => {
    const tree = await render();
    const txt = tree.root.findAllByType(Text).map((n) => n.props.children).flat().join(' ');
    expect(txt).not.toContain('home.partnerReactionsTitle');
    expect(txt).not.toContain('home.mutualTitle');
  });
});
