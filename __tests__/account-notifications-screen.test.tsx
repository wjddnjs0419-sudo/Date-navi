import React from 'react';

const mockPush = jest.fn();
const mockDelete = jest.fn(async () => ({ error: null }));

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn() }),
    useFocusEffect: (cb: () => (() => void) | void) => {
      ReactLocal.useEffect(() => {
        const cleanup = cb();
        return cleanup;
      }, []);
    },
  };
});

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    strings: {
      notifications: {
        title: '알림', clearAll: '전체 삭제', unreadSuffix: '개의 새 알림', allRead: '모두 확인했어요',
        emptyTitle: '새 알림이 없어요', emptyBody: '새 알림이 오면 여기에 표시돼요',
        groupToday: '오늘', groupWeek: '이번 주', groupEarlier: '이전',
        reactionTitle: '반응 알림', proposalTitle: '제안 알림', tapToView: '눌러서 보기',
        timeJustNow: '방금 전', timeMinutes: '{{n}}분 전', timeHours: '{{n}}시간 전',
        timeYesterday: '어제', timeDays: '{{n}}일 전',
        proposalModalTitle: '제안 내용', proposalCta: '제안 보러가기', modalCloseButton: '닫기',
      },
      candidates: { reactionLabels: { love: { emoji: '❤️', label: '완전 좋아' } } },
    },
  }),
}));

const mockNotifRows = [
  { id: 'n1', type: 'reaction', payload: { reaction_type: 'love', card_title: '성수 코스' }, read: false, created_at: new Date().toISOString() },
];

jest.mock('../lib/supabase', () => {
  const builder: any = {
    select: () => builder,
    order: () => builder,
    eq: () => ({ then: (r: (v: unknown) => void) => r({ error: null }) }),
    in: () => ({ then: (r: (v: unknown) => void) => r({ error: null }) }),
    delete: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: mockNotifRows }),
  };
  return {
    supabase: {
      from: () => builder,
    },
  };
});

jest.mock('../lib/push', () => ({
  buildPushNavigationTarget: () => '/share/reaction',
}));

const TestRenderer = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => void | Promise<void>;
  create: (el: React.ReactElement) => {
    root: {
      findByType: (t: unknown) => { props: Record<string, any> };
      findAllByType: (t: unknown) => { props: Record<string, any> }[];
    };
  };
};
const { act, create } = TestRenderer;

const NotificationsScreen = require('../app/account/notifications').default as
  typeof import('../app/account/notifications').default;
const { ListRow, SectionLabel } = require('../components/ui') as typeof import('../components/ui');

describe('account/notifications screen', () => {
  it('renders each notification as a shared ListRow grouped under a SectionLabel', async () => {
    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<NotificationsScreen />); });

    const rows = instance.root.findAllByType(ListRow);
    expect(rows.length).toBe(1);
    const sectionLabels = instance.root.findAllByType(SectionLabel);
    expect(sectionLabels.length).toBeGreaterThan(0);
  });
});
