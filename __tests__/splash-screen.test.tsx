import React from 'react';
import { Text } from 'react-native';
import { Illustration } from '../components/illustration';

const mockHideAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-splash-screen', () => ({ hideAsync: (...args: unknown[]) => mockHideAsync(...args) }));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ language: 'ko', t: (key: string) => key }),
}));

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findByType: (type: unknown) => TestNode;
  };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;
const SplashScreen = require('../app/index').default as React.ComponentType;

function render(): TestRendererInstance {
  let renderer!: TestRendererInstance;
  act(() => { renderer = create(<SplashScreen />); });
  return renderer;
}

describe('splash screen matches UI RENEW mockup', () => {
  it('renders the brand pin logo illustration', () => {
    const renderer = render();
    const illustration = renderer.root.findByType(Illustration);
    expect(illustration.props.name).toBe('brand-pin-logo');
  });

  it('renders the "Date Navi" title', () => {
    const renderer = render();
    const title = renderer.root.findByProps({ children: 'Date Navi' });
    expect(title.type).toBe(Text);
  });

  it('renders the tagline and loading copy', () => {
    const renderer = render();
    expect(renderer.root.findByProps({ children: 'splash.tagline' }).type).toBe(Text);
    expect(renderer.root.findByProps({ children: 'splash.loading' }).type).toBe(Text);
  });

  it('still hides the native splash screen on mount', () => {
    render();
    expect(mockHideAsync).toHaveBeenCalled();
  });
});
