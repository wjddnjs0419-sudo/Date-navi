import React from 'react';
import { Text } from 'react-native';
import { C } from '../constants/colors';
import { Wordmark } from '../components/brand';
import { Illustration } from '../components/illustration';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../lib/analytics', () => ({ logEvent: jest.fn() }));

const mockSignInWithGoogle = jest.fn().mockResolvedValue({ cancelled: true });
const mockSignInWithKakao = jest.fn().mockResolvedValue({ cancelled: true });

jest.mock('../lib/googleAuth', () => ({
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
  getGoogleSignInErrorMessageKey: () => null,
}));

jest.mock('../lib/kakaoAuth', () => ({
  signInWithKakao: (...args: unknown[]) => mockSignInWithKakao(...args),
  getKakaoSignInErrorMessageKey: () => null,
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  isErrorWithCode: () => false,
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ language: 'ko', t: (key: string) => key }),
}));

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findByType: (type: unknown) => TestNode;
    findAllByType: (type: unknown) => TestNode[];
  };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;
const AuthScreen = require('../app/(auth)/index').default as React.ComponentType;

function render(): TestRendererInstance {
  let renderer!: TestRendererInstance;
  act(() => { renderer = create(<AuthScreen />); });
  return renderer;
}

describe('login hero matches UI RENEW mockup', () => {
  beforeEach(() => {
    mockSignInWithGoogle.mockClear();
    mockSignInWithKakao.mockClear();
  });

  it('renders the large wordmark hero', () => {
    const renderer = render();
    const wordmark = renderer.root.findByType(Wordmark);
    expect(wordmark.props.size).toBe('lg');
  });

  it('renders the horizontal date-course-map illustration', () => {
    const renderer = render();
    const illustration = renderer.root.findByType(Illustration);
    expect(illustration.props.name).toBe('date-course-map-horizontal');
  });

  it('highlights the "가볍게" phrase inside the headline in accent pink', () => {
    const renderer = render();
    const highlight = renderer.root.findByProps({ children: 'auth.welcomeHeadingHighlight' });
    expect(highlight.type).toBe(Text);
    const flatStyle = [highlight.props.style].flat(Infinity).reduce((acc, s) => ({ ...acc, ...s }), {});
    expect(flatStyle.color).toBe(C.pink);
  });

  it('renders a disabled-looking Apple button that shows a coming-soon notice instead of signing in', () => {
    const renderer = render();
    const appleButton = renderer.root.findByProps({ testID: 'apple-login-button' });
    act(() => { appleButton.props.onPress(); });

    expect(mockSignInWithGoogle).not.toHaveBeenCalled();
    expect(mockSignInWithKakao).not.toHaveBeenCalled();

    const notice = renderer.root.findByProps({ children: 'auth.appleComingSoon' });
    expect(notice.type).toBe(Text);
  });
});
