import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { fetchInviterName, normalizeCode } from '@/lib/invite';
import { resolveLang, STRINGS } from '@/lib/i18n';
import { APP_STORE_URL, SITE_ORIGIN, TESTFLIGHT_URL } from '@/lib/config';
import { OpenInApp } from './OpenInApp';

type SP = Promise<{ code?: string; l?: string }>;

const oneLine = (s: string) => s.replace(/\n/g, ' ');

// OG 이미지는 초대자 언어(l)로 굽는다 — 링크가 뿌려지는 순간 받는 사람 언어를 알 수 없기 때문.
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const { code = '', l } = await searchParams;
  const lang = resolveLang(l);
  const t = STRINGS[lang];
  const normalized = normalizeCode(code);
  const name = normalized ? await fetchInviterName(normalized) : null;
  const title = oneLine(name ? t.headlineNamed(name) : t.headlineAnon);
  const ogImage = `${SITE_ORIGIN}/api/og?code=${encodeURIComponent(normalized)}&l=${lang}`;

  return {
    title: `${title} · Date Navi`,
    description: t.ogSub,
    openGraph: {
      title,
      description: t.ogSub,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description: t.ogSub, images: [ogImage] },
  };
}

export default async function InvitePage({ searchParams }: { searchParams: SP }) {
  const { code = '' } = await searchParams;
  const normalized = normalizeCode(code);

  // 랜딩 본문은 "받는 사람" 언어로(Accept-Language). OG의 초대자 언어와 별개.
  const accept = (await headers()).get('accept-language');
  const lang = resolveLang(null, accept);
  const t = STRINGS[lang];

  const hasStore = Boolean(APP_STORE_URL || TESTFLIGHT_URL);

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(160deg, #FFF1F6 0%, #FFF9FC 60%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif',
        color: '#3A2E2E',
        textAlign: 'center',
        gap: 22,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascot.png" alt="Date Navi" width={190} height={190} style={{ objectFit: 'contain' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: '#F26B7A' }}>
          {t.eyebrow.toUpperCase()}
        </div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.6 }}>Date Navi</h1>
        <p style={{ margin: 0, fontSize: 15, color: '#8A7F76' }}>
          {normalized ? t.landInstalled : t.landComingSoon}
        </p>
      </div>

      {normalized && (
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              background: '#fff',
              border: '1px solid #F2E0DC',
              borderRadius: 16,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 12, color: '#A89B92', fontWeight: 700, marginBottom: 4 }}>
              {t.landCodeLabel}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2, color: '#3A2E2E' }}>
              {normalized}
            </div>
          </div>

          <OpenInApp code={normalized} label={t.landOpenApp} />

          {hasStore ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {APP_STORE_URL && (
                <StoreLink href={APP_STORE_URL} label={t.landAppStore} />
              )}
              {TESTFLIGHT_URL && (
                <StoreLink href={TESTFLIGHT_URL} label={t.landTestFlight} />
              )}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: '#A89B92' }}>{t.landManualHint}</p>
          )}
        </div>
      )}
    </main>
  );
}

function StoreLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
        border: '1px solid #F2E0DC',
        color: '#3A2E2E',
        fontWeight: 700,
        fontSize: 15,
        textDecoration: 'none',
        borderRadius: 14,
        padding: '13px 20px',
      }}
    >
      {label}
    </a>
  );
}
