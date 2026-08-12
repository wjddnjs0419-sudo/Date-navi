import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { PUBLIC_SITE_COPY, PublicSiteShell, buttonStyle } from '@/lib/public-site';
import { resolveLang } from '@/lib/i18n';

export const metadata: Metadata = { title: 'Date Navi Support', description: 'Help and support for Date Navi.' };

export default async function SupportPage() {
  const lang = resolveLang(null, (await headers()).get('accept-language'));
  const copy = PUBLIC_SITE_COPY[lang];
  const subject = encodeURIComponent(lang === 'ko' ? 'Date Navi 문의' : 'Date Navi Support');

  return <PublicSiteShell lang={lang}>
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '72px 24px 38px' }}>
      <p style={{ margin: 0, color: '#ed6680', fontSize: 13, fontWeight: 850, letterSpacing: '0.11em', textTransform: 'uppercase' }}>Date Navi Support</p>
      <h1 style={{ margin: '12px 0 14px', fontSize: 'clamp(38px, 5vw, 58px)', letterSpacing: '-0.06em' }}>{copy.supportTitle}</h1>
      <p style={{ margin: 0, maxWidth: 590, color: '#72636a', fontSize: 17, lineHeight: 1.7 }}>{copy.supportBody}</p>
    </section>
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '16px 24px 68px' }}>
      <h2 style={{ margin: '0 0 18px', fontSize: 25, letterSpacing: '-0.045em' }}>{copy.faqTitle}</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {copy.faqs.map((faq) => <details key={faq.question} style={{ background: '#fff', border: '1px solid #f1e4e8', borderRadius: 16, padding: '17px 18px' }}><summary style={{ cursor: 'pointer', fontWeight: 800, lineHeight: 1.45 }}>{faq.question}</summary><p style={{ margin: '13px 0 0', color: '#75666c', fontSize: 15, lineHeight: 1.7 }}>{faq.answer}</p></details>)}
      </div>
      <div style={{ marginTop: 44, padding: 28, background: '#fff0f4', borderRadius: 24 }}>
        <h2 style={{ margin: '0 0 9px', fontSize: 23, letterSpacing: '-0.045em' }}>{copy.contactTitle}</h2>
        <p style={{ margin: '0 0 22px', color: '#75666c', fontSize: 15, lineHeight: 1.7 }}>{copy.contactBody}</p>
        <a href={`mailto:jake051096@gmail.com?subject=${subject}`} style={buttonStyle}>{copy.contactButton}</a>
        <p style={{ margin: '18px 0 0', color: '#907d85', fontSize: 13, lineHeight: 1.6 }}>{copy.privacyNote}</p>
      </div>
    </section>
  </PublicSiteShell>;
}
