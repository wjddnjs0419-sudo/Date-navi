import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n, { type TFunction } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from '../locales/en.json';
import ko from '../locales/ko.json';

export type AppLanguage = 'ko' | 'en';

const STORAGE_KEY = 'datemate.language';
const SUPPORTED_LANGUAGES: AppLanguage[] = ['ko', 'en'];

const resources = {
  ko: { translation: ko },
  en: { translation: en },
} as const;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: 'ko',
    fallbackLng: 'ko',
    compatibilityJSON: 'v4',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

type TranslationTree = Record<string, any>;

const I18N_CONTEXT = createContext<{
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  strings: TranslationTree;
  t: TFunction<'translation', undefined>;
  ready: boolean;
} | null>(null);

function cloneTranslations(language: AppLanguage): TranslationTree {
  return JSON.parse(JSON.stringify(resources[language].translation));
}

function withLegacyHelpers(language: AppLanguage, t: TFunction<'translation', undefined>) {
  const copy = cloneTranslations(language);

  copy.settings.daysWith = (partner: string, days: number) => (
    t('settings.daysWith', { partner, days })
  );
  copy.home.greeting = (name?: string) => (
    name ? t('home.greetingNamed', { name }) : t('home.greeting')
  );
  copy.home.connected = (partnerName: string) => (
    t('home.connected', { partnerName })
  );
  copy.coupleConnect.shareMessage = (code: string) => (
    t('coupleConnect.shareMessage', { code })
  );
  copy.card.partnerReaction = (label: string, emoji: string) => (
    t('card.partnerReaction', { label, emoji })
  );

  return copy;
}

function normalizeLanguage(value?: string | null): AppLanguage | null {
  const code = value?.toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(code as AppLanguage) ? (code as AppLanguage) : null;
}

function detectInitialLanguage(): AppLanguage {
  const locale = getLocales()[0];
  return normalizeLanguage(locale?.languageCode ?? locale?.languageTag) ?? 'ko';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(detectInitialLanguage());
  const [ready, setReady] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!mounted) return;
        const savedLanguage = normalizeLanguage(saved);
        const nextLanguage = savedLanguage ?? detectInitialLanguage();
        setLanguageState(nextLanguage);
        void i18n.changeLanguage(nextLanguage);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = (next: AppLanguage) => {
    setLanguageState(next);
    void i18n.changeLanguage(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      strings: withLegacyHelpers(language, t),
      t,
      ready,
    }),
    [language, ready, t],
  );

  return createElement(I18N_CONTEXT.Provider, { value }, children);
}

export function useI18n() {
  const context = useContext(I18N_CONTEXT);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
