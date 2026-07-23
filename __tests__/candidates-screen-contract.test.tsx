import React from 'react';
import { Text } from 'react-native';
import { Chip } from '../components/ui';

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

// lib/ai 는 모듈 로드 시점에 import 되므로(무거운 supabase/AI 의존) 가짜로 대체한다.
jest.mock('../lib/ai', () => ({
  generateDateCards: jest.fn(),
  getUserPreferences: jest.fn(),
}));

// 커플 연결 + '둘 다 좋아요' 카드 1건. 후보 화면이 이 데이터로 새 레이아웃을 렌더한다.
jest.mock('../lib/supabase', () => {
  const makeBuilder = (result: unknown) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      neq: () => builder,
      not: () => builder,
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
              id: 'card1',
              title: '성수동 감성 데이트',
              summary: '감성 가득한 코스',
              estimated_time: '약 3시간',
              estimated_budget: '3만원',
              tags: ['romantic', 'photo'],
              mode: 'make_course',
              source: 'ai',
              created_by: 'u1',
              created_at: '2026-07-01',
              content_i18n: null,
            }, {
              // 반응이 하나도 없는 AI 카드 — 예전이라면 "좋아요 미정" 배지가 붙던 자리다.
              id: 'card2',
              title: '아직 아무도 안 누른 후보',
              summary: '반응 없는 카드',
              estimated_time: '약 2시간',
              estimated_budget: '2만원',
              tags: ['walk'],
              mode: 'make_course',
              source: 'ai',
              created_by: 'u1',
              created_at: '2026-07-02',
              content_i18n: null,
            }],
          });
        }
        if (table === 'reactions') {
          return makeBuilder({
            data: [
              { card_id: 'card1', user_id: 'u1', reaction_type: 'love' },
              { card_id: 'card1', user_id: 'u2', reaction_type: 'love' },
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
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

const CandidatesScreen = require('../app/(tabs)/candidates').default;

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<CandidatesScreen />); });
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

describe('후보 화면 목업 계약', () => {
  it('페이지 제목과 헤더 추가 필을 렌더한다', async () => {
    const tree = await render();
    const txt = allText(tree);
    expect(txt).toContain('candidates.pageTitle');
    expect(txt).toContain('candidates.fabAddCourse');
  });

  it('필터 칩(전체/서로 좋아요/내가 저장/상대가 저장)을 렌더한다', async () => {
    const tree = await render();
    expect(tree.root.findAllByType(Chip).length).toBeGreaterThanOrEqual(4);
    const txt = allText(tree);
    expect(txt).toContain('candidates.filterAll');
    expect(txt).toContain('candidates.filterMutual');
    expect(txt).toContain('candidates.filterMine');
    expect(txt).toContain('candidates.filterPartner');
  });

  it('AI 카드(둘 다 좋아요)는 상단 배지에 서로 좋아요 상태를 렌더한다', async () => {
    const tree = await render();
    expect(allText(tree)).toContain('candidates.badgeMutual');
  });

  it('반응이 갈리지 않은 카드에는 "좋아요 미정" 배지를 붙이지 않는다', async () => {
    const tree = await render();
    expect(allText(tree)).not.toContain('candidates.badgeUndecided');
  });

  it('로드된 카드의 제목을 카드 행으로 렌더한다', async () => {
    const tree = await render();
    expect(allText(tree)).toContain('성수동 감성 데이트');
  });

  it('실제 반응 데이터 기반 상태 라인(서로 좋아요)을 렌더한다', async () => {
    const tree = await render();
    expect(allText(tree)).toContain('candidates.statusMutual');
  });

  it('하단 코스 확정 배너 CTA를 렌더한다', async () => {
    const tree = await render();
    expect(allText(tree)).toContain('candidates.confirmBannerCta');
  });

  it('정렬 드롭다운(최신순)을 렌더한다', async () => {
    const tree = await render();
    expect(allText(tree)).toContain('candidates.sortNewest');
  });
});
