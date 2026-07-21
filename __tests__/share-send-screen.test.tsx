import React from 'react';

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ cardId: 'card-1' }),
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, vals?: Record<string, unknown>) => (vals?.returnObjects ? [] : key),
    language: 'ko',
  }),
}));

const cardRow = {
  id: 'card-1',
  title: '성수 감성 데이트 코스',
  summary: '분위기 좋은 코스',
  tags: ['이동 적음'],
  content_i18n: null,
  estimated_time: '총 4시간',
  estimated_budget: '8만원대',
  steps: [
    { label: '식사' },
    { label: '카페' },
    { label: '선택' },
    { label: '디너' },
  ],
};

jest.mock('../lib/supabase', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: cardRow }),
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: () => builder,
    },
  };
});

const TestRenderer = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => void | Promise<void>;
  create: (el: React.ReactElement) => {
    root: {
      findAllByType: (t: unknown) => { props: Record<string, any> }[];
      findByType: (t: unknown) => { props: Record<string, any> };
      findByProps: (p: Record<string, unknown>) => { props: Record<string, any> };
      findAllByProps: (p: Record<string, unknown>) => unknown[];
    };
  };
};
const { act, create } = TestRenderer;

const SendScreen = require('../app/share/send').default as typeof import('../app/share/send').default;
const { CourseStepList, MetaChipRow } = require('../components/ui') as typeof import('../components/ui');

describe('share/send screen — course summary card', () => {
  it('renders the fetched card steps via the shared CourseStepList', async () => {
    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<SendScreen />); });

    const stepList = instance.root.findByType(CourseStepList);
    expect(stepList.props.steps.map((s: { label: string }) => s.label)).toEqual([
      '식사', '카페', '선택', '디너',
    ]);
  });

  it('renders estimated time via the shared MetaChipRow, and budget alongside it', async () => {
    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<SendScreen />); });

    const metaRow = instance.root.findByType(MetaChipRow);
    const labels = metaRow.props.items.map((i: { label: string }) => i.label);
    expect(labels).toEqual(['총 4시간']);

    const { Wallet } = require('lucide-react-native');
    expect(instance.root.findAllByType(Wallet).length).toBeGreaterThan(0);
    const budgetText = instance.root.findAllByProps({ children: '8만원대' });
    expect(budgetText.length).toBeGreaterThan(0);
  });

  it('shares the course summary via the native OS share sheet', async () => {
    const { Share } = require('react-native');
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' } as any);

    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<SendScreen />); });

    const shareBtn = instance.root.findByProps({ testID: 'send-native-share' });
    await act(async () => { await shareBtn.props.onPress(); });

    expect(shareSpy).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('성수 감성 데이트 코스'),
    }));
    shareSpy.mockRestore();
  });
});
