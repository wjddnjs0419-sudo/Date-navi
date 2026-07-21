import React from 'react';
import ko from '../locales/ko/legal.json';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const ko = require('../locales/ko/legal.json');
      if (key === 'legal.terms.sections' && opts?.returnObjects) return ko.legal.terms.sections;
      if (key === 'legal.terms.title') return ko.legal.terms.title;
      if (key === 'legal.terms.updated') return ko.legal.terms.updated;
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

const TermsScreen = require('../app/legal/terms').default as typeof import('../app/legal/terms').default;
const { BackBar } = require('../components/ui') as typeof import('../components/ui');

describe('legal/terms screen', () => {
  it('uses the shared BackBar and still renders every legal section verbatim', () => {
    let instance!: ReturnType<typeof create>;
    act(() => { instance = create(<TermsScreen />); });

    expect(() => instance.root.findByType(BackBar)).not.toThrow();

    const firstSection = ko.legal.terms.sections[0];
    expect(instance.root.findAllByProps({ children: firstSection.title }).length).toBeGreaterThan(0);
    expect(instance.root.findAllByProps({ children: firstSection.body }).length).toBeGreaterThan(0);
  });
});
