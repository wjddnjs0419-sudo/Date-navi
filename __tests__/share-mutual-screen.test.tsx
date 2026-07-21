import React from 'react';

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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
            ],
          });
        }
        if (table === 'date_cards') return makeBuilder({ data: [cardRow] });
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
      findAllByProps: (p: Record<string, unknown>) => unknown[];
    };
  };
};
const { act, create } = TestRenderer;

const MutualScreen = require('../app/share/mutual').default as typeof import('../app/share/mutual').default;
const { CourseStepList } = require('../components/ui') as typeof import('../components/ui');

describe('share/mutual screen', () => {
  it('renders each mutual candidate card with its course step timeline', async () => {
    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<MutualScreen />); });

    const stepList = instance.root.findByType(CourseStepList);
    expect(stepList.props.steps.map((s: { label: string }) => s.label)).toEqual(['식사', '카페']);
  });
});
