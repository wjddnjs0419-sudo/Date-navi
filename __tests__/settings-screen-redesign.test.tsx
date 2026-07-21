import React from 'react';
import ko from '../locales/ko/settings.json';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn(async () => ({ error: null }));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { version: '9.9.9-test' } },
  expoConfig: { version: '9.9.9-test' },
}));

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      ReactLocal.useEffect(() => { cb(); }, []);
    },
  };
});

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    language: 'ko',
    setLanguage: jest.fn(),
    t: (key: string) => key,
    strings: {
      settings: require('../locales/ko/settings.json').settings,
      common: { error: 'common.error', ok: 'common.ok', cancel: 'common.cancel', settingsOpen: 'common.settingsOpen', done: 'common.done' },
      language: { ko: '한국어', en: 'English' },
    },
  }),
}));

jest.mock('../lib/supabase', () => {
  const makeBuilder = (result: unknown) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      neq: () => builder,
      maybeSingle: async () => result,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return builder;
  };
  return {
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1' } } }),
        signOut: () => mockSignOut(),
      },
      from: (table: string) => {
        if (table === 'date_planner_profiles') return makeBuilder({ data: { display_name: '지원', profile_photo_url: null, couple_id: null, anniversary_date: null } });
        if (table === 'date_memories') return makeBuilder({ data: [] });
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
      findAll: (predicate: (node: { props: Record<string, any> }) => boolean) => { props: Record<string, any> }[];
    };
  };
};
const { act, create } = TestRenderer;

const SettingsScreen = require('../app/settings').default as typeof import('../app/settings').default;
const { BigButton } = require('../components/ui') as typeof import('../components/ui');

describe('settings screen redesign', () => {
  it('renders the app version read from Constants.expoConfig, not a hardcoded literal', async () => {
    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<SettingsScreen />); });

    const versionNodes = instance.root.findAll(
      (n) => typeof n.props?.children === 'string' && n.props.children.includes('9.9.9-test'),
    );
    expect(versionNodes.length).toBeGreaterThan(0);
  });

  it('renders logout as the shared BigButton instead of a list row', async () => {
    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<SettingsScreen />); });

    const logoutBtn = instance.root.findByType(BigButton);
    expect(logoutBtn.props.children).toBe(ko.settings.logout);

    await act(async () => { await logoutBtn.props.onPress(); });
    expect(mockSignOut).toHaveBeenCalled();
  });
});
