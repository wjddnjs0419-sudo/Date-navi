import React from 'react';
import { Image, Text } from 'react-native';
import { Path } from 'react-native-svg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let mockLanguage: 'ko' | 'en' = 'ko';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../lib/analytics', () => ({ logEvent: jest.fn() }));

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
  useI18n: () => ({
    language: mockLanguage,
    t: (key: string) => key,
  }),
}));

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findAllByType: (type: unknown) => TestNode[];
  };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;
const AuthScreen = require('../app/(auth)/index').default as React.ComponentType;

const GOOGLE_BRAND_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335'];

function render(language: 'ko' | 'en'): TestRendererInstance {
  mockLanguage = language;
  let renderer!: TestRendererInstance;
  act(() => { renderer = create(<AuthScreen />); });
  return renderer;
}

describe('auth social buttons follow official brand guidelines', () => {
  it('renders the official four-color Google G logo', () => {
    const renderer = render('ko');
    const logo = renderer.root.findByProps({ testID: 'google-g-logo' });
    expect(logo).toBeTruthy();

    const paths = renderer.root.findAllByType(Path).map((node) => String(node.props.fill).toUpperCase());
    for (const color of GOOGLE_BRAND_COLORS) {
      expect(paths).toContain(color);
    }
  });

  it('renders the official Kakao button image, localized by language', () => {
    const koImage = render('ko').root.findByProps({ testID: 'kakao-official-button' });
    const enImage = render('en').root.findByProps({ testID: 'kakao-official-button' });

    expect(koImage.type).toBe(Image);
    expect(enImage.type).toBe(Image);
    expect(koImage.props.source).toBe(require('../kakao_login/ko/kakao_login_large_wide.png'));
    expect(enImage.props.source).toBe(require('../kakao_login/en/kakao_login_large_wide.png'));
    expect(koImage.props.source).not.toBe(enImage.props.source);
  });

  it('does not render a legacy plain-text Kakao label', () => {
    const texts = render('ko').root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).not.toContain('auth.kakaoStart');
  });

  it('uses Google-approved wording that never abbreviates the brand to 구글', () => {
    const ko = JSON.parse(readFileSync(join(__dirname, '../locales/ko.json'), 'utf8')).auth;
    const en = JSON.parse(readFileSync(join(__dirname, '../locales/en.json'), 'utf8')).auth;

    expect(ko.googleStart).toBe('Google 계정으로 로그인');
    expect(ko.googleStart).not.toContain('구글');
    expect(en.googleStart).toBe('Continue with Google');
  });
});
