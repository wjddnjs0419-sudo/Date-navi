import ko from '../locales/ko/legal.json';
import en from '../locales/en/legal.json';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type LegalSection = { title: string; body: string };

const asSections = (value: unknown): LegalSection[] => value as LegalSection[];

test('legal pages disclose implemented data processing in both locales', () => {
  const koPolicy = asSections(ko.legal.privacy.sections);
  const enPolicy = asSections(en.legal.privacy.sections);
  const koTerms = asSections(ko.legal.terms.sections);
  const enTerms = asSections(en.legal.terms.sections);
  const koPolicyText = koPolicy.map(({ title, body }) => `${title} ${body}`).join(' ');
  const enPolicyText = enPolicy.map(({ title, body }) => `${title} ${body}`).join(' ');
  const koTermsText = koTerms.map(({ title, body }) => `${title} ${body}`).join(' ');
  const enTermsText = enTerms.map(({ title, body }) => `${title} ${body}`).join(' ');

  expect(koPolicy).toHaveLength(enPolicy.length);
  expect(koPolicyText).toContain('Anthropic');
  expect(koPolicyText).toContain('공개');
  expect(koPolicyText).toContain('알림을 활성화한 경우에만 Expo 푸시 알림');
  expect(koPolicyText).toContain('선택적 알림 권한');
  expect(enPolicyText).toContain('Anthropic');
  expect(enPolicyText).toContain('public');
  expect(enPolicyText).toContain('Expo push notifications only when notifications are enabled');
  expect(enPolicyText).toContain('optional notification permission');
  const koExternalLinkDisclosure = '지도 또는 리뷰 보기 동작을 선택하면 카카오맵 및 네이버 외부 링크가 열리며, 해당 서비스의 약관 및 개인정보처리방침이 적용됩니다.';
  const enExternalLinkDisclosure = 'Selecting map or review actions opens Kakao Map and Naver external links, and those services’ terms and privacy policies apply.';
  expect(koTermsText).toContain(koExternalLinkDisclosure);
  expect(enTermsText).toContain(enExternalLinkDisclosure);
  expect(koPolicyText).toContain(koExternalLinkDisclosure);
  expect(enPolicyText).toContain(enExternalLinkDisclosure);
  expect(ko.legal.terms.updated).toContain('[시행일]');
  expect(en.legal.terms.updated).toContain('[Effective date]');
});

test('each localized legal document has non-empty numbered sections', () => {
  for (const document of [ko.legal.terms, ko.legal.privacy, en.legal.terms, en.legal.privacy]) {
    const sections = asSections(document.sections);
    expect(sections.length).toBeGreaterThanOrEqual(8);
    expect(sections.every((section) => /^\d+[.]/.test(section.title) && section.body.trim().length > 0)).toBe(true);
  }
});

test('login page opens the existing legal routes', () => {
  const source = readFileSync(resolve(process.cwd(), 'app/(auth)/index.tsx'), 'utf8');

  expect(source).toContain("router.push('/legal/terms' as any)");
  expect(source).toContain("router.push('/legal/privacy' as any)");
});
