import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { PUBLIC_SITE_COPY, PublicSiteShell } from '@/lib/public-site';
import { resolveLang } from '@/lib/i18n';
import { PRIVACY_POLICY } from '@/lib/privacy-policy';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Date Navi Privacy Policy',
};

export default async function PrivacyPage() {
  const lang = resolveLang(null, (await headers()).get('accept-language'));
  const policy = PRIVACY_POLICY[lang];
  const copy = PUBLIC_SITE_COPY[lang];

  return (
    <PublicSiteShell lang={lang}>
      <article style={{ maxWidth: 760, margin: '0 auto', padding: '72px 24px 76px' }}>
        <p style={{ margin: 0, color: '#ed6680', fontSize: 13, fontWeight: 850, letterSpacing: '0.11em', textTransform: 'uppercase' }}>Date Navi</p>
        <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(38px, 5vw, 58px)', letterSpacing: '-0.06em' }}>{policy.title}</h1>
        <p style={{ margin: 0, color: '#907d85', fontSize: 14 }}>{policy.updated}</p>

        <div style={{ display: 'grid', gap: 30, marginTop: 48 }}>
          {policy.sections.map((section) => (
            <section key={section.title}>
              <h2 style={{ margin: '0 0 10px', fontSize: 20, letterSpacing: '-0.04em' }}>{section.title}</h2>
              <p style={{ margin: 0, whiteSpace: 'pre-line', color: '#65585d', fontSize: 15, lineHeight: 1.75 }}>{section.body}</p>
            </section>
          ))}
        </div>

        <aside style={{ marginTop: 48, padding: 24, borderRadius: 20, background: '#fff0f4', color: '#65585d', fontSize: 15, lineHeight: 1.7 }}>
          {lang === 'ko' ? '개인정보 관련 요청이나 문의는 ' : 'For privacy questions or requests, contact '}
          <a href="mailto:jake051096@gmail.com?subject=Date%20Navi%20Privacy" style={{ color: '#c84e68', fontWeight: 800 }}>jake051096@gmail.com</a>
          {lang === 'ko' ? '으로 보내주세요. ' : '. '}
          <a href="/support" style={{ color: '#c84e68', fontWeight: 800 }}>{copy.support}</a>
        </aside>
      </article>
    </PublicSiteShell>
  );
}
