import React from 'react';

const mockRpc = jest.fn();
const mockBack = jest.fn();
const mockShareToken = 'b'.repeat(64);

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ shareToken: mockShareToken }),
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'share.public.heading': '공유된 코스',
      'share.public.loading': '코스를 불러오는 중이에요',
      'share.public.notFound': '공유 코스를 찾을 수 없어요',
      'share.public.subText': 'Date Navi에서 공유한 데이트 코스예요.',
      'share.public.openApp': 'Date Navi에서 열기',
    }[key] ?? key),
    language: 'ko',
  }),
}));

const TestRenderer = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => {
    root: {
      findByType: (type: unknown) => { props: Record<string, any> };
      findAllByType: (type: unknown) => { props: Record<string, any> }[];
      findAllByProps: (props: Record<string, unknown>) => unknown[];
    };
  };
};
const { act, create } = TestRenderer;

const PublicCourseScreen = require('../app/course/[shareToken]').default as
  typeof import('../app/course/[shareToken]').default;
const { CourseStepList } = require('../components/ui') as typeof import('../components/ui');

describe('public course share screen', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockBack.mockReset();
  });

  it('loads the public DTO with the route token without asking for auth or the raw card', async () => {
    mockRpc.mockResolvedValue({
      data: {
        title: '성수 코스',
        summary: '공개 설명',
        estimated_time: '총 3시간',
        estimated_budget: '5만원대',
        steps: [{ label: '식사', place_name: '공개 식당' }],
      },
      error: null,
    });

    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<PublicCourseScreen />); });

    expect(mockRpc).toHaveBeenCalledWith('get_public_shared_course', { p_share_token: mockShareToken });
    const stepList = instance.root.findByType(CourseStepList);
    expect(stepList.props.steps).toEqual([{ label: '식사', place_name: '공개 식당' }]);
    expect(instance.root.findAllByProps({ children: '성수 코스' }).length).toBeGreaterThan(0);
  });

  it('renders the same not-found state when the resolver returns no DTO', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<PublicCourseScreen />); });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(instance.root.findAllByProps({ children: '공유 코스를 찾을 수 없어요' }).length).toBeGreaterThan(0);
  });
});
