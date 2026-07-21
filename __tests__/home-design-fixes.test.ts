import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('홈 화면 디자인 QA 수정 (ss-score/styleseed-design-review 게이트)', () => {
  const source = read('app/(tabs)/index.tsx');

  it('modeCard가 SoftCard와 동일한 layered-shadow를 쓴다 (보더만으로 분리하지 않는다)', () => {
    expect(source).toMatch(/modeCard:\s*{[\s\S]{0,400}shadowOpacity/);
  });

  it('modeCard와 connectBanner가 SoftCard와 같은 카드 radius(R.card)를 쓴다', () => {
    expect(source).toMatch(/modeCard:\s*{[^}]*borderRadius:\s*R\.card/s);
    expect(source).toMatch(/connectBanner:\s*{[^}]*borderRadius:\s*R\.card/s);
    expect(source).not.toMatch(/connectBanner:\s*{[^}]*borderRadius:\s*16/s);
  });

  it('단일 모드 카드 CTA는 모드별 색(m.fg) 대신 화면 전체와 같은 accent(C.pinkDeep)를 쓴다', () => {
    const mfgMatches = source.match(/m\.fg/g) ?? [];
    // 다중 모드 캐러셀(모드 복원 시)에서만 m.fg가 남아야 한다 — 아이콘 + Text + ChevronRight = 3회.
    expect(mfgMatches.length).toBe(3);
    expect(source).toMatch(/단일 모드:[\s\S]{0,800}color: C\.pinkDeep/);
  });

  it('데이터 로드 실패 시 사용자에게 에러를 알린다', () => {
    expect(source).toMatch(/catch\s*{[\s\S]{0,200}home\.loadError[\s\S]{0,100}}/);
  });

  it('알림/설정 아이콘 버튼에 accessibilityLabel이 있다', () => {
    expect(source).toMatch(/bellBtn[\s\S]{0,400}accessibilityLabel=\{t\('home\.accessibility\.notifications'\)\}/);
    expect(source).toMatch(/avatarBtn[\s\S]{0,400}accessibilityLabel=\{t\('home\.accessibility\.settings'\)\}/);
  });

  it('캡션 폰트 크기가 12px 계열로 통일된다 (partnerTime 11px 이탈 제거)', () => {
    expect(source).not.toMatch(/partnerTime:\s*{[^}]*fontSize:\s*11/s);
    expect(source).toMatch(/partnerTime:\s*{[^}]*fontSize:\s*12/s);
  });

  it('간격이 4px 배수 스케일을 벗어나지 않는다 (gap: 2, gap: 3 제거)', () => {
    expect(source).not.toMatch(/modeCardFooter:\s*{[^}]*gap:\s*2[,}]/s);
    expect(source).not.toMatch(/planMetaItem:\s*{[^}]*gap:\s*3[,}]/s);
  });

  it('ko/en 로케일에 새 카피가 함께 추가된다', () => {
    const ko = JSON.parse(read('locales/ko/home.json'));
    const en = JSON.parse(read('locales/en/home.json'));
    expect(typeof ko.home.loadError).toBe('string');
    expect(typeof en.home.loadError).toBe('string');
    expect(typeof ko.home.accessibility?.notifications).toBe('string');
    expect(typeof en.home.accessibility?.notifications).toBe('string');
    expect(typeof ko.home.accessibility?.settings).toBe('string');
    expect(typeof en.home.accessibility?.settings).toBe('string');
  });
});
