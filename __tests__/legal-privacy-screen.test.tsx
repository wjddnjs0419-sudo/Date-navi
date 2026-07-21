import React from 'react';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const ko = require('../locales/ko/legal.json');
      if (key === 'legal.privacy.sections' && opts?.returnObjects) return ko.legal.privacy.sections;
      if (key === 'legal.privacy.title') return ko.legal.privacy.title;
      if (key === 'legal.privacy.updated') return ko.legal.privacy.updated;
      return key;
    },
  }),
}));

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

const PrivacyScreen = require('../app/legal/privacy').default as typeof import('../app/legal/privacy').default;
const { BackBar } = require('../components/ui') as typeof import('../components/ui');

describe('legal/privacy screen', () => {
  it('uses the shared BackBar and still renders every legal section verbatim', () => {
    const ko = require('../locales/ko/legal.json');
    let instance!: ReturnType<typeof create>;
    act(() => { instance = create(<PrivacyScreen />); });

    expect(() => instance.root.findByType(BackBar)).not.toThrow();

    const firstSection = ko.legal.privacy.sections[0];
    expect(instance.root.findAllByProps({ children: firstSection.title }).length).toBeGreaterThan(0);
    expect(instance.root.findAllByProps({ children: firstSection.body }).length).toBeGreaterThan(0);
  });
});
