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
    strings: {
      card: {
        reactionLabels: {
          love: { emoji: '🔥', label: '완전 끌려' },
          like: { emoji: '😊', label: '느낌은 좋아' },
          burden: { emoji: '😅', label: '오늘은 부담돼' },
          next_time: { emoji: '⏰', label: '다음에' },
        },
      },
    },
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
const { CourseStepList, MetaChipRow } = require('../components/ui') as typeof import('../components/ui');
const { ReactionPicker } = require('../components/ReactionPicker') as typeof import('../components/ReactionPicker');

describe('share/reaction screen', () => {
  it('renders the 4 reaction choices via the shared ReactionPicker', async () => {
    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<ReactionScreen />); });

    const picker = instance.root.findByType(ReactionPicker);
    // 처음엔 아무 반응도 선택되지 않은 상태
    expect(picker.props.selected).toBeNull();
    expect(picker.props.labelFor('love')).toBe('완전 끌려');

    act(() => { picker.props.onSelect('love'); });
    const updated = instance.root.findByType(ReactionPicker);
    expect(updated.props.selected).toBe('love');
  });

  it('옛 8버튼 옵션을 렌더하지 않고 ReactionPicker를 쓴다', () => {
    const fs = require('fs'); const path = require('path');
    const src = fs.readFileSync(path.join(process.cwd(), 'app/share/reaction.tsx'), 'utf8');
    expect(src).not.toContain('REACTION_OPTIONS');
    expect(src).toContain('ReactionPicker');
  });

  it('한마디 입력란과 관련 i18n 키가 없다', () => {
    const fs = require('fs'); const path = require('path');
    const src = fs.readFileSync(path.join(process.cwd(), 'app/share/reaction.tsx'), 'utf8');
    expect(src).not.toContain('noteLabel');
    expect(src).not.toContain('notePlaceholder');
    for (const lang of ['ko', 'en']) {
      const share = fs.readFileSync(path.join(process.cwd(), `locales/${lang}/share.json`), 'utf8');
      expect(share).not.toContain('noteLabel');
      expect(share).not.toContain('notePlaceholder');
    }
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
