# Legal Pages Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inaccurate in-app Terms of Service and Privacy Policy copy with Korean and English versions grounded in the Date Navi implementation, and make the login-page legal labels open the relevant pages.

**Architecture:** The reusable legal page screens already render locale-owned `{ title, body }[]` sections, so the legal content remains in `locales/ko.json` and `locales/en.json`. The authentication screen receives two small pressable spans that route to the existing `/legal/terms` and `/legal/privacy` screens; no backend or schema changes are required.

**Tech Stack:** Expo Router 6, React Native 0.81, TypeScript, i18next locale JSON, Jest 29.

## Global Constraints

- State only behavior demonstrated by the repository; do not invent fees, subscriptions, exports, age rules, legal entity details, jurisdiction, or automated retention jobs.
- Keep unresolved legal details visibly bracketed: `[운영자 법적 명칭]`, `[운영자 주소]`, `[준거법 및 관할]`, `[시행일]` and their English counterparts.
- Keep `jake051096@gmail.com` as the service and privacy contact address, as confirmed by the user.
- Terms and privacy copy must disclose Google/Kakao authentication, Supabase storage and access controls, Anthropic AI processing, Kakao Local search, Expo push notifications when enabled, optional location/photo permissions, partner sharing, public-read avatar/memory buckets, and third-party map links only to the extent each is present in code.
- Never promise immediate deletion of all data or a scheduled 30-day purge: the repository contains an account-delete Edge Function and a 30-day AI-data purge procedure but does not demonstrate a scheduler or deletion of storage objects.
- Use test-first development. Each behavioral test must fail before the production change that makes it pass.
- Run all commands from `/Users/jeongwonkim/Desktop/Date-navi`; every completed task ends with `npm run validate`.

---

### Task 1: Lock the legal-content and login-routing contract

**Files:**
- Create: `__tests__/legal-pages-content.test.ts`
- Modify: `locales/ko.json`
- Modify: `locales/en.json`
- Modify: `app/(auth)/index.tsx`

**Interfaces:**
- Consumes: `legal.terms.sections` and `legal.privacy.sections` locale arrays rendered by `app/legal/terms.tsx` and `app/legal/privacy.tsx`.
- Produces: Locale arrays with matching Korean/English section counts and pressable login-page routes to `/legal/terms` and `/legal/privacy`.

- [ ] **Step 1: Write the failing test**

```ts
import ko from '../locales/ko.json';
import en from '../locales/en.json';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type LegalSection = { title: string; body: string };

const asSections = (value: unknown): LegalSection[] => value as LegalSection[];

test('legal pages disclose implemented data processing in both locales', () => {
  const koPolicy = asSections(ko.legal.privacy.sections);
  const enPolicy = asSections(en.legal.privacy.sections);

  expect(koPolicy).toHaveLength(enPolicy.length);
  expect(koPolicy.join(' ')).toContain('Anthropic');
  expect(koPolicy.join(' ')).toContain('공개');
  expect(enPolicy.join(' ')).toContain('Anthropic');
  expect(enPolicy.join(' ')).toContain('public');
  expect(ko.legal.terms.updated).toContain('[시행일]');
  expect(en.legal.terms.updated).toContain('[Effective date]');
});

test('login page opens the existing legal routes', () => {
  const source = readFileSync(resolve(process.cwd(), 'app/(auth)/index.tsx'), 'utf8');

  expect(source).toContain("router.push('/legal/terms' as any)");
  expect(source).toContain("router.push('/legal/privacy' as any)");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- __tests__/legal-pages-content.test.ts --runInBand`

Expected: FAIL because the existing policy does not mention public storage and the login page has no legal routes.

- [ ] **Step 3: Write the minimal production implementation**

1. Replace `legal.terms.updated`, `legal.terms.sections`, `legal.privacy.updated`, and `legal.privacy.sections` in each locale file with matching, numbered sections. Required terms sections: service and agreement; account and couple sharing; permitted and prohibited use; user content; AI and place-information limits; third-party services; availability and changes; account termination; disclaimer/liability; contact and reviewer note. Required privacy sections: controller/contact; collected data; use; sharing/processing; public uploads; permissions; retention/deletion; security; rights/contact; reviewer note.
2. In `app/(auth)/index.tsx`, import `useRouter`, declare `const router = useRouter()` inside `AuthScreen`, and replace each underlined nested legal `Text` node with a `Text` node that has `accessibilityRole="link"`, the existing `legalLink` style, and `onPress={() => router.push('/legal/terms' as any)}` or `onPress={() => router.push('/legal/privacy' as any)}`.
3. Keep the surrounding localized prefix/middle/suffix text unchanged so both languages preserve their sentence order.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- __tests__/legal-pages-content.test.ts --runInBand`

Expected: PASS with two tests.

- [ ] **Step 5: Run the TypeScript gate**

Run: `npm run validate`

Expected: exit code 0.

### Task 2: Verify whole-app consistency and record the evidence

**Files:**
- Modify: `PLAN.md`
- Modify: `RESULT.md`

**Interfaces:**
- Consumes: Task 1's finalized locale content, link routes, and test result.
- Produces: A compact completed-plan record and an evidence-backed result record that identifies the unresolved legal-review items.

- [ ] **Step 1: Add the structural consistency assertion**

Extend `__tests__/legal-pages-content.test.ts` with:

```ts
test('each localized legal document has non-empty numbered sections', () => {
  for (const document of [ko.legal.terms, ko.legal.privacy, en.legal.terms, en.legal.privacy]) {
    const sections = asSections(document.sections);
    expect(sections.length).toBeGreaterThanOrEqual(8);
    expect(sections.every((section) => /^\\d+[.]/.test(section.title) && section.body.trim().length > 0)).toBe(true);
  }
});
```

- [ ] **Step 2: Run it to verify the completed documents satisfy the structural contract**

Run: `npm test -- __tests__/legal-pages-content.test.ts --runInBand`

Expected: PASS because Task 1 already completed the ten-section documents. If it fails, complete missing section titles or bodies without adding unsupported claims.

- [ ] **Step 3: Update repository records**

1. Replace the detailed pending entry in `PLAN.md` with one `[Done]` line dated `2026-07-18` after tests pass.
2. Add a `RESULT.md` entry naming the updated locale files and login route, the confirmed contact email, the bracketed values still requiring a legal decision, and the operational follow-up: configure and monitor an actual scheduler for `purge_expired_ai_data()` before publicly promising automatic 30-day deletion.

- [ ] **Step 4: Run the full verification suite**

Run: `npm test -- --runInBand && npm run validate && git diff --check`

Expected: all Jest suites pass, TypeScript exits 0, and `git diff --check` emits no output.

- [ ] **Step 5: Report the legal-review boundary**

Report that this is an implementation-aligned draft, not legal advice, and that a qualified attorney must verify the entity, age/eligibility rule, governing law/venue, effective date, retention operations, public-upload policy, and any jurisdiction-specific privacy obligations before publication.

## Self-Review

- **Spec coverage:** Task 1 covers the bilingual legal text and login navigation. Task 2 covers section completeness, full verification, and required repository records.
- **No unsupported promise:** The content is constrained to observed providers and mechanisms; uncertain business and legal decisions stay bracketed rather than being asserted as product behavior.
- **Type consistency:** The test reads the existing `legal.*.sections` array interface that both legal screens already consume; it adds no new runtime type or dependency.
