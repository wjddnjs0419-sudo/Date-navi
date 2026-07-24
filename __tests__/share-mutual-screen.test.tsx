import React from 'react';

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      ReactLocal.useEffect(() => { cb(); }, []);
    },
  };
});

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, language: 'ko' }),
}));

const cardRow = {
  id: 'card-1',
  title: '성수 감성 데이트 코스',
  summary: '분위기 좋은 코스',
  estimated_time: '총 4시간',
  estimated_budget: '8만원대',
  tags: ['이동 적음'],
  content_i18n: null,
  steps: [
    { label: '식사' },
    { label: '카페' },
  ],
};

const cardRow2 = {
  id: 'card-2',
  title: '한강 산책 데이트 코스',
  summary: '분위기 좋은 코스',
  estimated_time: '총 4시간',
  estimated_budget: '8만원대',
  tags: ['이동 적음'],
  content_i18n: null,
  steps: [
    { label: '식사' },
    { label: '카페' },
  ],
};

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
        if (table === 'date_planner_profiles') return makeBuilder({ data: { couple_id: 'c1' } });
        if (table === 'reactions') {
          return makeBuilder({
            data: [
              { card_id: 'card-1', user_id: 'u1', reaction_type: 'love' },
              { card_id: 'card-1', user_id: 'u2', reaction_type: 'love' },
              { card_id: 'card-2', user_id: 'u1', reaction_type: 'love' },
              { card_id: 'card-2', user_id: 'u2', reaction_type: 'love' },
            ],
          });
        }
        if (table === 'date_cards') return makeBuilder({ data: [cardRow, cardRow2] });
        return makeBuilder({ data: [] });
      },
    },
  };
});

const TestRenderer = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => void | Promise<void>;
  create: (el: React.ReactElement) => {
    root: {
      findByType: (t: unknown) => { props: Record<string, any> };
      findAllByType: (t: unknown) => { props: Record<string, any> }[];
      findByProps: (p: Record<string, unknown>) => { props: Record<string, any> };
      findAllByProps: (p: Record<string, unknown>) => unknown[];
    };
  };
};
const { act, create } = TestRenderer;

const MutualScreen = require('../app/share/mutual').default as typeof import('../app/share/mutual').default;
const { CourseStepList } = require('../components/ui') as typeof import('../components/ui');

describe('share/mutual screen', () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it('renders each mutual candidate card with its course step timeline', async () => {
    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<MutualScreen />); });

    // mutual 카드가 여러 장이면 각 카드마다 타임라인이 렌더된다. 첫 카드로 검증.
    const stepList = instance.root.findAllByType(CourseStepList)[0];
    expect(stepList.props.steps.map((s: { label: string }) => s.label)).toEqual(['식사', '카페']);
  });

  it('mutual 카드에 라디오가 뜨고 맨 위 카드가 기본 선택', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<MutualScreen />); });
    await act(async () => {});
    expect(tree.root.findByProps({ testID: 'mutual-radio-card-1-selected' })).toBeTruthy();
    expect(() => tree.root.findByProps({ testID: 'mutual-radio-card-2-selected' })).toThrow();
  });

  it('둘째 카드 라디오 탭 시 선택이 바뀐다', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<MutualScreen />); });
    await act(async () => {});
    const r2 = tree.root.findByProps({ testID: 'mutual-radio-card-2' });
    await act(async () => { r2.props.onPress(); });
    expect(tree.root.findByProps({ testID: 'mutual-radio-card-2-selected' })).toBeTruthy();
  });

  it('확정 CTA가 선택된 카드 id로 push', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<MutualScreen />); });
    await act(async () => {});
    // BigButton(합성 컴포넌트)이 testID 를 내부 TouchableOpacity 로 전달하므로
    // 두 노드가 매칭된다. onPress 는 동일 참조이므로 첫 노드를 사용한다.
    const cta = tree.root.findAllByProps({ testID: 'mutual-confirm-cta' })[0] as { props: Record<string, any> };
    await act(async () => { cta.props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/card/confirm?id=card-1');
  });
});
