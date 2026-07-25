// 랜딩·OG 문구. 랜딩은 받는 사람 언어(Accept-Language), OG는 초대자 언어(링크의 l).
export type Lang = 'ko' | 'en';

export function resolveLang(value: string | null | undefined, acceptLanguage?: string | null): Lang {
  if (value === 'ko' || value === 'en') return value;
  if (acceptLanguage && /(^|,)\s*ko\b/i.test(acceptLanguage)) return 'ko';
  return 'en';
}

type Strings = {
  eyebrow: string;
  // 초대자 이름을 아는 경우 / 모르는 경우
  headlineNamed: (name: string) => string;
  headlineAnon: string;
  ogSub: string;
  // 랜딩 본문
  landOpenApp: string;
  landInstalled: string;
  landNotInstalled: string;
  landCodeLabel: string;
  landComingSoon: string;
  landAppStore: string;
  landTestFlight: string;
  landManualHint: string;
};

export const STRINGS: Record<Lang, Strings> = {
  ko: {
    eyebrow: '커플 초대',
    headlineNamed: (name) => `${name}님이\n데이트에 초대했어요`,
    headlineAnon: '커플 데이트에\n초대했어요',
    ogSub: 'Date Navi · 링크를 열면 바로 연결돼요',
    landOpenApp: '앱에서 열기',
    landInstalled: 'Date Navi 앱이 있다면 바로 연결돼요.',
    landNotInstalled: '앱을 설치하고 초대 코드를 입력하면 연결돼요.',
    landCodeLabel: '초대 코드',
    landComingSoon: 'Date Navi는 곧 만나보실 수 있어요.',
    landAppStore: 'App Store에서 받기',
    landTestFlight: 'TestFlight로 받기',
    landManualHint: '앱을 열고 커플 연결 화면에서 위 코드를 입력하세요.',
  },
  en: {
    eyebrow: 'Couple invite',
    headlineNamed: (name) => `${name} invited you\nto a date`,
    headlineAnon: "You're invited\nto a date",
    ogSub: 'Date Navi · Open the link to connect',
    landOpenApp: 'Open in the app',
    landInstalled: 'If you have Date Navi, it opens right up.',
    landNotInstalled: 'Install the app and enter the invite code to connect.',
    landCodeLabel: 'Invite code',
    landComingSoon: 'Date Navi is coming soon.',
    landAppStore: 'Get it on the App Store',
    landTestFlight: 'Get it on TestFlight',
    landManualHint: 'Open the app and enter the code on the couple-connect screen.',
  },
};
