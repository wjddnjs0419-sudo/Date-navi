# Date Navi Public Site Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** Add bilingual, App Store-ready marketing and support pages to the existing Date Navi Vercel site.

**Architecture:** Add shared language-aware copy and presentation helpers under `web/lib`, then compose two server-rendered route pages from them. Reuse the existing configuration for the App Store CTA and use a mailto link for support, requiring no new backend or client state.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, existing bundled mascot asset.

## Global Constraints

- Preserve the existing `/invite` route and its OG behavior.
- Resolve Korean and English from `Accept-Language` with the existing `resolveLang` helper.
- Support email is exactly `jake051096@gmail.com`.
- Do not add dependencies or a contact-form backend.
- Use `NEXT_PUBLIC_APP_STORE_URL` for the store CTA; show a non-link coming-soon state when it is absent.

---

### Task 1: Shared public-site copy and layout primitives

**Files:**
- Create: `web/lib/public-site.tsx`

**Interfaces:**
- Consumes: `Lang` from `web/lib/i18n.ts`.
- Produces: `PUBLIC_SITE_COPY`, `PublicSiteShell`, and `StoreCta` for the route pages.

- [ ] **Step 1: Define the copy contract**

```ts
export type PublicSiteCopy = {
  navSupport: string;
  navHome: string;
  storeLabel: string;
  comingSoon: string;
};

export const PUBLIC_SITE_COPY: Record<Lang, PublicSiteCopy> = { ko: { /* Korean text */ }, en: { /* English text */ } };
```

- [ ] **Step 2: Implement the common page shell and CTA**

```tsx
export function PublicSiteShell({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <main lang={lang === 'ko' ? 'ko' : 'en'}>{children}</main>;
}

export function StoreCta({ lang }: { lang: Lang }) {
  return APP_STORE_URL ? <a href={APP_STORE_URL}>{PUBLIC_SITE_COPY[lang].storeLabel}</a> : <span>{PUBLIC_SITE_COPY[lang].comingSoon}</span>;
}
```

### Task 2: Marketing route

**Files:**
- Create: `web/app/page.tsx`
- Modify: `web/app/layout.tsx`

**Interfaces:**
- Consumes: `resolveLang`, `PUBLIC_SITE_COPY`, `PublicSiteShell`, and `StoreCta`.
- Produces: server-rendered `/` with App Store-ready metadata and a resilient App Store CTA.

- [ ] **Step 1: Resolve visitor language and render product sections**

```tsx
const acceptLanguage = (await headers()).get('accept-language');
const lang = resolveLang(null, acceptLanguage);

return <PublicSiteShell lang={lang}><h1>{copy.heroTitle}</h1><StoreCta lang={lang} /></PublicSiteShell>;
```

- [ ] **Step 2: Add page-level metadata**

```ts
export const metadata: Metadata = {
  title: 'Date Navi — Plan dates together',
  description: 'AI-assisted date planning for couples.',
};
```

### Task 3: Support route

**Files:**
- Create: `web/app/support/page.tsx`

**Interfaces:**
- Consumes: `resolveLang`, `PUBLIC_SITE_COPY`, and `PublicSiteShell`.
- Produces: server-rendered `/support` with FAQs and a support mail link.

- [ ] **Step 1: Render bilingual support information**

```tsx
const lang = resolveLang(null, (await headers()).get('accept-language'));
return <PublicSiteShell lang={lang}><h1>{copy.title}</h1>{copy.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</PublicSiteShell>;
```

- [ ] **Step 2: Add direct support contact**

```tsx
<a href="mailto:jake051096@gmail.com?subject=Date%20Navi%20Support">{copy.contactLabel}</a>
```

### Task 4: Validate the App Store web surface

**Files:**
- Modify: `web/README.md`

**Interfaces:**
- Consumes: the deployed Vercel origin from existing configuration.
- Produces: documented Marketing and Support URL handoff.

- [ ] **Step 1: Run static validation**

```bash
cd web && npm run typecheck && npm run build
```

- [ ] **Step 2: Document the URLs and optional store environment variable**

```md
- Marketing URL: `https://date-navi.vercel.app/`
- Support URL: `https://date-navi.vercel.app/support`
- Set `NEXT_PUBLIC_APP_STORE_URL` once the App Store product page is available.
```
