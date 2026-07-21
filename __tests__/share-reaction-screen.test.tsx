import React from 'react';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ cardId: 'card-1' }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: 'ko',
  }),
}));

const cardRow = {
  title: '성수 감성 데이트 코스',
  summary: '분위기 좋은 코스',
  estimated_time: '총 4시간',
  estimated_budget: '8만원대',
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
      neq: () => builder,
      order: () => builder,
      limit: () => builder,
      upsert: async () => ({ data: null, error: null }),
      maybeSingle: async () => result,
    };
    return builder;
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: (table: string) => {
        if (table === 'date_planner_profiles') return makeBuilder({ data: { couple_id: 'c1', display_name: '지혜' } });
        if (table === 'date_cards') return makeBuilder({ data: cardRow });
        if (table === 'soft_messages') return makeBuilder({ data: null });
        return makeBuilder({ data: null });
      },
    },
  };
});

const TestRenderer = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => void | Promise<void>;
  create: (el: React.ReactElement) => {
    root: {
      findByType: (t: unknown) => { props: Record<string, any> };
    };
  };
};
const { act, create } = TestRenderer;

const ReactionScreen = require('../app/share/reaction').default as typeof import('../app/share/reaction').default;
const { CourseStepList, MetaChipRow, OptionCardPicker } = require('../components/ui') as typeof import('../components/ui');

describe('share/reaction screen', () => {
  it('renders the reaction choices via the shared OptionCardPicker', async () => {
    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<ReactionScreen />); });

    const picker = instance.root.findByType(OptionCardPicker);
    expect(picker.props.options.length).toBe(8);
    expect(picker.props.value).toBe('closer');

    act(() => { picker.props.onChange('full'); });
    const updated = instance.root.findByType(OptionCardPicker);
    expect(updated.props.value).toBe('full');
  });

  it('renders the shared course card via CourseStepList and MetaChipRow', async () => {
    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<ReactionScreen />); });

    const stepList = instance.root.findByType(CourseStepList);
    expect(stepList.props.steps.map((s: { label: string }) => s.label)).toEqual(['식사', '카페']);

    const metaRow = instance.root.findByType(MetaChipRow);
    expect(metaRow.props.items.map((i: { label: string }) => i.label)).toEqual(['총 4시간']);
  });
});
