import React from 'react';
import { Text } from 'react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

const mockLogEvent = jest.fn();
jest.mock('../lib/analytics', () => ({ logEvent: (...args: unknown[]) => mockLogEvent(...args) }));

jest.mock('../lib/googleAuth', () => ({
  signInWithGoogle: jest.fn().mockResolvedValue({ cancelled: true }),
  getGoogleSignInErrorMessageKey: () => null,
}));

jest.mock('../lib/kakaoAuth', () => ({
  signInWithKakao: jest.fn().mockResolvedValue({ cancelled: true }),
  getKakaoSignInErrorMessageKey: () => null,
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  isErrorWithCode: () => false,
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ language: 'ko', t: (key: string) => key }),
}));

const mockSignInWithApple = jest.fn();
const mockAppleErrorKey = jest.fn();
jest.mock('../lib/appleAuth', () => ({
  signInWithApple: (...args: unknown[]) => mockSignInWithApple(...args),
  getAppleSignInErrorMessageKey: (...args: unknown[]) => mockAppleErrorKey(...args),
}));

const mockSaveAppleFullName = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/appleProfile', () => ({
  saveAppleFullNameIfMissing: (...args: unknown[]) => mockSaveAppleFullName(...args),
}));

jest.mock('expo-apple-authentication', () => {
  const ReactModule = require('react');
  return {
    isAvailableAsync: () => Promise.resolve(true),
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
  };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;
const AuthScreen = require('../app/(auth)/index').default as React.ComponentType;

async function renderAndTapApple(): Promise<TestRendererInstance> {
  let renderer!: TestRendererInstance;
  await act(async () => { renderer = create(<AuthScreen />); });
  const appleButton = renderer.root.findByProps({ testID: 'apple-login-button' });
  await act(async () => { await appleButton.props.onPress(); });
  return renderer;
}

describe('Apple 로그인 배선', () => {
  beforeEach(() => {
    mockSignInWithApple.mockReset();
    mockSignInWithApple.mockResolvedValue({ cancelled: false, fullName: null });
    mockAppleErrorKey.mockReset();
    mockAppleErrorKey.mockReturnValue('auth.errorAppleFailed');
    mockSaveAppleFullName.mockClear();
    mockLogEvent.mockClear();
  });

  it('버튼을 누르면 준비 중 안내 대신 실제 Apple 로그인을 실행한다', async () => {
    const renderer = await renderAndTapApple();

    expect(mockSignInWithApple).toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ children: 'auth.appleComingSoon' })).toHaveLength(0);
  });

  it('로그인 성공을 analytics에 apple로 기록한다', async () => {
    await renderAndTapApple();

    expect(mockLogEvent).toHaveBeenCalledWith('login', { method: 'apple' });
  });

  it('최초 로그인에서 받은 이름을 프로필에 넘긴다', async () => {
    mockSignInWithApple.mockResolvedValue({ cancelled: false, fullName: '김정원' });

    await renderAndTapApple();

    expect(mockSaveAppleFullName).toHaveBeenCalledWith('김정원');
  });

  it('실패하면 Apple 전용 에러 문구를 보여준다', async () => {
    mockSignInWithApple.mockRejectedValue(Object.assign(new Error('boom'), { code: 'ERR_REQUEST_FAILED' }));

    const renderer = await renderAndTapApple();

    expect(mockAppleErrorKey).toHaveBeenCalledWith('ERR_REQUEST_FAILED');
    const error = renderer.root.findByProps({ children: 'auth.errorAppleFailed' });
    expect(error.type).toBe(Text);
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it('사용자가 취소하면 아무 문구도 띄우지 않는다', async () => {
    mockSignInWithApple.mockRejectedValue(Object.assign(new Error('cancel'), { code: 'ERR_REQUEST_CANCELED' }));
    mockAppleErrorKey.mockReturnValue(null);

    const renderer = await renderAndTapApple();

    expect(renderer.root.findAllByProps({ children: 'auth.errorAppleFailed' })).toHaveLength(0);
    expect(mockLogEvent).not.toHaveBeenCalled();
  });
});
