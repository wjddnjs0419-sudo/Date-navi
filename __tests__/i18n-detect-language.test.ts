import { getLocales } from 'expo-localization';
import { detectInitialLanguage } from '../lib/i18n';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));

const mockedGetLocales = getLocales as jest.MockedFunction<typeof getLocales>;

function setLocale(languageCode: string | null) {
  mockedGetLocales.mockReturnValue(
    languageCode === null ? [] : ([{ languageCode }] as ReturnType<typeof getLocales>),
  );
}

describe('detectInitialLanguage', () => {
  it('한국어 기기는 ko', () => {
    setLocale('ko');
    expect(detectInitialLanguage()).toBe('ko');
  });

  it('영어 기기는 en', () => {
    setLocale('en');
    expect(detectInitialLanguage()).toBe('en');
  });

  it('미지원 언어(불어) 기기는 영어로 폴백', () => {
    setLocale('fr');
    expect(detectInitialLanguage()).toBe('en');
  });

  it('로케일을 못 읽으면 영어로 폴백', () => {
    setLocale(null);
    expect(detectInitialLanguage()).toBe('en');
  });
});
