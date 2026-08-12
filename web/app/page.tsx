import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { PUBLIC_SITE_COPY, PublicSiteShell, StoreCta } from '@/lib/public-site';
import { resolveLang } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Date Navi — Plan dates together',
  description: 'AI-assisted date planning and shared memories for couples.',
};

export default async function HomePage() {
  const lang = resolveLang(null, (await headers()).get('accept-language'));
  const copy = PUBLIC_SITE_COPY[lang];

  return (
    <PublicSiteShell lang={lang}>
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '72px 24px 76px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 420px)', alignItems: 'center', gap: 48 }}>
        <div>
          <p style={eyebrow}>{copy.heroEyebrow}</p>
          <h1 style={{ margin: '12px 0 20px', whiteSpace: 'pre-line', fontSize: 'clamp(42px, 6vw, 70px)', lineHeight: 1.08, letterSpacing: '-0.065em' }}>{copy.heroTitle}</h1>
          <p style={{ maxWidth: 510, margin: '0 0 30px', color: '#72636a', fontSize: 18, lineHeight: 1.7 }}>{copy.heroBody}</p>
          <StoreCta lang={lang} />
        </div>
        <div style={{ borderRadius: 38, padding: 32, background: 'linear-gradient(145deg, #ff8799, #f96b82 62%, #ed6682)', minHeight: 370, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 28px 55px rgba(223, 87, 118, 0.28)' }}>
          <span style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,.22)', color: '#fff', padding: '8px 11px', borderRadius: 999, fontSize: 13, fontWeight: 800 }}>Date Navi</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot.png" alt="" width={210} height={210} style={{ alignSelf: 'center', objectFit: 'contain', filter: 'drop-shadow(0 14px 12px rgba(97, 35, 53, .16))' }} />
          <p style={{ margin: 0, color: '#fff', fontSize: 20, fontWeight: 800, lineHeight: 1.35 }}>{lang === 'ko' ? '오늘의 데이트,\n어디서부터 시작할까요?' : 'Where will your\ndate begin today?'}</p>
        </div>
      </section>

      <section style={{ background: '#fff0f4', padding: '84px 24px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <p style={eyebrow}>{copy.featureEyebrow}</p>
          <h2 style={{ margin: '12px 0 42px', whiteSpace: 'pre-line', fontSize: 'clamp(30px, 4vw, 48px)', lineHeight: 1.18, letterSpacing: '-0.055em' }}>{copy.featureTitle}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
            {copy.features.map((feature) => <article key={feature.title} style={{ background: '#fff', borderRadius: 24, padding: 28, minHeight: 205 }}><span style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 14, background: '#ffe1e8', color: '#ee617b', fontSize: 22 }}>{feature.icon}</span><h3 style={{ margin: '22px 0 9px', fontSize: 20, letterSpacing: '-0.04em' }}>{feature.title}</h3><p style={{ margin: 0, color: '#75666c', fontSize: 15, lineHeight: 1.7 }}>{feature.body}</p></article>)}
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 760, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 16px', whiteSpace: 'pre-line', fontSize: 'clamp(31px, 4vw, 48px)', lineHeight: 1.18, letterSpacing: '-0.06em' }}>{copy.closeTitle}</h2>
        <p style={{ margin: '0 auto 30px', maxWidth: 520, color: '#72636a', lineHeight: 1.7, fontSize: 16 }}>{copy.closeBody}</p>
        <StoreCta lang={lang} />
      </section>
    </PublicSiteShell>
  );
}

const eyebrow = { margin: 0, color: '#ed6680', fontSize: 13, fontWeight: 850, letterSpacing: '0.11em', textTransform: 'uppercase' } as const;
