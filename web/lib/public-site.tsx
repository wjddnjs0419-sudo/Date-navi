import type { ReactNode } from 'react';
import { APP_STORE_URL } from '@/lib/config';
import type { Lang } from '@/lib/i18n';

type Faq = { question: string; answer: string };

type PublicSiteCopy = {
  home: string;
  support: string;
  store: string;
  comingSoon: string;
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  featureEyebrow: string;
  featureTitle: string;
  features: Array<{ title: string; body: string; icon: string }>;
  closeTitle: string;
  closeBody: string;
  supportTitle: string;
  supportBody: string;
  contactTitle: string;
  contactBody: string;
  contactButton: string;
  faqTitle: string;
  faqs: Faq[];
  privacyNote: string;
};

export const PUBLIC_SITE_COPY: Record<Lang, PublicSiteCopy> = {
  ko: {
    home: '홈',
    support: '고객 지원',
    store: 'App Store에서 받기',
    comingSoon: 'App Store 출시 예정',
    heroEyebrow: '둘만의 다음 데이트',
    heroTitle: '고르는 시간까지\n설레는 데이트',
    heroBody: '기분과 취향, 오늘의 위치를 바탕으로 데이트 코스를 함께 정하고 둘만의 추억으로 남겨보세요.',
    featureEyebrow: '데이트 나비와 함께',
    featureTitle: '“오늘 뭐 하지?”가\n기다려지는 순간으로',
    features: [
      { icon: '✦', title: '취향에 맞는 코스 추천', body: '원하는 분위기와 시간, 위치를 반영해 실제 주변 장소로 데이트 아이디어를 추천해요.' },
      { icon: '♡', title: '함께 고르는 즐거움', body: '마음에 드는 후보를 연인과 같이 살펴보고, 저장하거나 새로운 추천을 받아보세요.' },
      { icon: '✿', title: '둘만의 추억 기록', body: '데이트 후 별점과 한마디를 남기고, 함께 만든 순간을 차곡차곡 모아보세요.' },
    ],
    closeTitle: '다음 만남을\n더 가볍게 시작해요.',
    closeBody: '특별한 날이 아니어도 괜찮아요. Date Navi가 두 사람의 오늘을 데이트로 이어드릴게요.',
    supportTitle: '무엇을 도와드릴까요?',
    supportBody: 'Date Navi 사용 중 궁금한 점이나 불편한 점이 있다면 아래 안내를 확인하거나 편하게 문의해 주세요.',
    contactTitle: '아직 해결되지 않았나요?',
    contactBody: '앱 버전, 사용 중인 기기, 문제가 발생한 화면을 함께 알려주시면 더 빠르게 도와드릴 수 있어요.',
    contactButton: '이메일로 문의하기',
    faqTitle: '자주 묻는 질문',
    faqs: [
      { question: '연인과 어떻게 연결하나요?', answer: '프로필 또는 커플 연결 화면에서 초대 코드를 만들거나 초대 링크를 공유하세요. 상대방이 앱에서 코드를 입력하면 함께 계획과 추억을 볼 수 있어요.' },
      { question: '추천은 어떤 정보를 바탕으로 만들어지나요?', answer: '입력한 기분, 원하는 분위기, 시간, 위치와 두 사람의 취향을 바탕으로 실제 주변 장소를 포함한 데이트 코스를 추천해요.' },
      { question: '마음에 드는 추천이 없으면 어떻게 하나요?', answer: '추천 결과에서 다시 추천받거나 코스를 조정해 보세요. 마음에 드는 후보는 저장해 두고 연인과 함께 비교할 수 있어요.' },
      { question: '데이트를 마친 뒤에는 무엇을 할 수 있나요?', answer: '별점과 짧은 후기를 남겨 데이트를 추억으로 기록할 수 있어요. 연결된 커플은 서로의 기록도 함께 볼 수 있어요.' },
      { question: '계정을 삭제하고 싶어요.', answer: '앱의 프로필 화면에서 계정 삭제를 선택할 수 있어요. 삭제하면 계정과 연결된 데이터가 삭제되며 되돌릴 수 없어요.' },
    ],
    privacyNote: '개인정보 처리와 관련된 문의도 위 이메일로 보내주세요.',
  },
  en: {
    home: 'Home',
    support: 'Support',
    store: 'Download on the App Store',
    comingSoon: 'Coming soon to the App Store',
    heroEyebrow: 'Your next date, together',
    heroTitle: 'Make planning a date\npart of the fun.',
    heroBody: 'Plan a date around your mood, preferences, and location—then keep the moments you share.',
    featureEyebrow: 'With Date Navi',
    featureTitle: 'Turn “What should we do?”\ninto something to look forward to.',
    features: [
      { icon: '✦', title: 'Ideas made for you', body: 'Discover date ideas with real nearby places based on your vibe, available time, and location.' },
      { icon: '♡', title: 'Choose together', body: 'Explore recommendations with your partner, save favorites, or ask for a fresh idea.' },
      { icon: '✿', title: 'Keep your memories', body: 'Leave a rating and a note after each date, then collect the moments you made together.' },
    ],
    closeTitle: 'Start your next date\na little more easily.',
    closeBody: 'You do not need a special occasion. Date Navi helps turn an ordinary day into time together.',
    supportTitle: 'How can we help?',
    supportBody: 'Find quick answers below, or get in touch if you have a question or run into a problem while using Date Navi.',
    contactTitle: 'Still need help?',
    contactBody: 'Please include your app version, device, and the screen where the issue occurred so we can help you faster.',
    contactButton: 'Email support',
    faqTitle: 'Frequently asked questions',
    faqs: [
      { question: 'How do I connect with my partner?', answer: 'Create an invite code or share an invite link from the Profile or Couple Connect screen. Once your partner enters the code in the app, you can share plans and memories.' },
      { question: 'What does Date Navi use for recommendations?', answer: 'Date Navi uses the mood, vibe, time, location, and preferences you share to suggest date courses with real nearby places.' },
      { question: 'What if I do not like a recommendation?', answer: 'Ask for another recommendation or adjust your course. You can save promising options and compare them with your partner.' },
      { question: 'What can I do after a date?', answer: 'Leave a rating and a short note to save the date as a memory. Connected partners can see the memories they create together.' },
      { question: 'How do I delete my account?', answer: 'Choose Delete Account from the Profile screen in the app. Deleting your account removes associated data and cannot be undone.' },
    ],
    privacyNote: 'For privacy-related questions, please contact us at the same email address.',
  },
};

const pageStyle = {
  minHeight: '100dvh',
  background: 'linear-gradient(180deg, #fff8fa 0%, #ffffff 44%, #fff8fa 100%)',
  color: '#342d31',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", sans-serif',
} as const;

export function PublicSiteShell({ lang, children }: { lang: Lang; children: ReactNode }) {
  const copy = PUBLIC_SITE_COPY[lang];
  return (
    <main style={pageStyle} lang={lang === 'ko' ? 'ko' : 'en'}>
      <header style={{ maxWidth: 1080, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" aria-label="Date Navi home" style={{ color: '#342d31', textDecoration: 'none', fontSize: 20, fontWeight: 850, letterSpacing: -0.8 }}>Date Navi</a>
        <nav aria-label="Main navigation" style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 14, fontWeight: 700 }}>
          <a href="/" style={navLink}>{copy.home}</a>
          <a href="/support" style={navLink}>{copy.support}</a>
        </nav>
      </header>
      {children}
      <footer style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px 42px', color: '#8c7d83', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <span>© 2026 Date Navi</span>
        <a href="/support" style={{ ...navLink, color: '#8c7d83' }}>{copy.support}</a>
      </footer>
    </main>
  );
}

const navLink = { color: '#695c62', textDecoration: 'none' } as const;

export function StoreCta({ lang }: { lang: Lang }) {
  const copy = PUBLIC_SITE_COPY[lang];
  if (!APP_STORE_URL) return <span style={comingSoonStyle}>{copy.comingSoon}</span>;
  return <a href={APP_STORE_URL} style={buttonStyle}>{copy.store}</a>;
}

export const buttonStyle = { display: 'inline-flex', justifyContent: 'center', alignItems: 'center', minHeight: 50, padding: '0 22px', borderRadius: 999, background: '#292225', color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 800, boxShadow: '0 10px 24px rgba(65, 33, 45, 0.16)' } as const;
const comingSoonStyle = { display: 'inline-flex', justifyContent: 'center', alignItems: 'center', minHeight: 50, padding: '0 22px', borderRadius: 999, background: '#f2e4e9', color: '#7d5967', fontSize: 15, fontWeight: 800 } as const;
