import React from 'react';

const mockReplace = jest.fn();
const mockLogEvent = jest.fn();
const mockUpsert = jest.fn(async () => ({ error: null }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('../lib/analytics', () => ({
  logEvent: mockLogEvent,
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: jest.fn(() => ({ upsert: mockUpsert })),
  },
}));

const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => {
    root: {
      findByType: (type: unknown) => { props: Record<string, any> };
    };
    unmount: () => void;
  };
};
const { act, create } = TestRenderer;
const { BigButton } = require('../components/ui') as typeof import('../components/ui');
const PreferencesScreen = require('../app/onboarding/preferences').default as
  typeof import('../app/onboarding/preferences').default;

describe('onboarding preferences analytics', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockLogEvent.mockClear();
    mockUpsert.mockClear();
  });

  it('logs each displayed preferences step once while advancing through the flow', () => {
    let instance!: ReturnType<typeof create>;
    act(() => { instance = create(<PreferencesScreen />); });

    act(() => { instance.root.findByType(BigButton).props.onPress(); });
    act(() => { instance.root.findByType(BigButton).props.onPress(); });
    act(() => { instance.root.findByType(BigButton).props.onPress(); });

    expect(mockLogEvent.mock.calls.filter(([name]) => name === 'onboarding_preferences_step_viewed')).toEqual([
      ['onboarding_preferences_step_viewed', { step: 'preferred' }],
      ['onboarding_preferences_step_viewed', { step: 'mood' }],
      ['onboarding_preferences_step_viewed', { step: 'avoid' }],
      ['onboarding_preferences_step_viewed', { step: 'long_distance' }],
    ]);

    act(() => { instance.unmount(); });
  });
});
