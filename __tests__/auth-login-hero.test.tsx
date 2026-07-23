import React from 'react';
import { Text, Dimensions } from 'react-native';
import { C } from '../constants/colors';
import { Wordmark } from '../components/brand';
import { Illustration } from '../components/illustration';
import { socialButtonHeight, socialButtonRadius } from '../lib/socialButtonMetrics';

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

const mockIsAppleAuthAvailable = jest.fn().mockResolvedValue(true);

jest.mock('expo-apple-authentication', () => {
  const ReactModule = require('react');
  return {
    isAvailableAsync: () => mockIsAppleAuthAvailable(),
    AppleAuthenticationButton: (props: Record<string, unknown>) =>
      ReactModule.createElement('AppleAuthenticationButton', props),
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  };
});

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findAllByProps: (props: Record<string, unknown>) => TestNode[];
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
const AppleAuth = require('expo-apple-authentication') as {
  AppleAuthenticationButton: unknown;
  AppleAuthenticationButtonType: Record<string, number>;
  AppleAuthenticationButtonStyle: Record<string, number>;
};

// Apple 버튼은 isAvailableAsync()가 resolve된 뒤에야 붙으므로, 모든 테스트가
// 마운트 직후의 async 상태 갱신까지 flush한 뒤 단언한다.
async function render(): Promise<TestRendererInstance> {
  let renderer!: TestRendererInstance;
  await act(async () => { renderer = create(<AuthScreen />); });
  return renderer;
}

describe('login hero matches UI RENEW mockup', () => {
  beforeEach(() => {
    mockSignInWithGoogle.mockClear();
    mockSignInWithKakao.mockClear();
    mockIsAppleAuthAvailable.mockClear();
    mockIsAppleAuthAvailable.mockResolvedValue(true);
  });

  it('renders the large wordmark hero', async () => {
    const renderer = await render();
    const wordmark = renderer.root.findByType(Wordmark);
    expect(wordmark.props.size).toBe('lg');
  });

  it('renders the horizontal date-course-map illustration', async () => {
    const renderer = await render();
    const illustration = renderer.root.findByType(Illustration);
    expect(illustration.props.name).toBe('date-course-map-horizontal');
  });

  it('renders the illustration full-bleed at the screen width, not clipped by the hero padding', async () => {
    const renderer = await render();
    const illustration = renderer.root.findByType(Illustration);
    expect(illustration.props.width).toBe(Dimensions.get('window').width);
  });

  it('highlights the "가볍게" phrase inside the headline in accent pink', async () => {
    const renderer = await render();
    const highlight = renderer.root.findByProps({ children: 'auth.welcomeHeadingHighlight' });
    expect(highlight.type).toBe(Text);
    const flatStyle = [highlight.props.style].flat(Infinity).reduce((acc, s) => ({ ...acc, ...s }), {});
    expect(flatStyle.color).toBe(C.pink);
  });

  it('uses the official black Sign in with Apple button instead of a hand-drawn lookalike', async () => {
    const renderer = await render();
    const appleButton = renderer.root.findByProps({ testID: 'apple-login-button' });

    expect(appleButton.type).toBe(AppleAuth.AppleAuthenticationButton);
    expect(appleButton.props.buttonType).toBe(AppleAuth.AppleAuthenticationButtonType.SIGN_IN);
    expect(appleButton.props.buttonStyle).toBe(AppleAuth.AppleAuthenticationButtonStyle.BLACK);
  });

  it('sizes the Apple button to match the Kakao and Google buttons', async () => {
    const renderer = await render();
    const appleButton = renderer.root.findByProps({ testID: 'apple-login-button' });

    const expectedHeight = socialButtonHeight(Dimensions.get('window').width);
    const flatStyle = [appleButton.props.style].flat(Infinity).reduce((acc, s) => ({ ...acc, ...s }), {});
    expect(flatStyle.height).toBe(expectedHeight);
    expect(appleButton.props.cornerRadius).toBe(socialButtonRadius(expectedHeight));
  });

  it('hides the Apple button on platforms where Sign in with Apple is unavailable', async () => {
    mockIsAppleAuthAvailable.mockResolvedValue(false);
    const renderer = await render();

    expect(renderer.root.findAllByProps({ testID: 'apple-login-button' })).toHaveLength(0);
  });
});
