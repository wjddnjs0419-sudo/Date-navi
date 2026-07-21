import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

// 홈 UI RENEW(목업 1:1) 이후의 디자인 QA 게이트. 신규 코스 카드 + 히어로 + 다가오는 데이트 레이아웃 기준.
describe('홈 화면 디자인 QA (UI RENEW 코스카드 레이아웃)', () => {
  const source = read('app/(tabs)/index.tsx');

  it('코스 카드가 layered-shadow로 분리한다 (보더만으로 분리하지 않는다)', () => {
    expect(source).toMatch(/courseCard:\s*{[\s\S]{0,500}shadowOpacity/);
  });

  it('주요 카드/배너가 카드 radius(R.card)를 쓴다', () => {
    expect(source).toMatch(/courseCard:\s*{[^}]*borderRadius:\s*R\.card/s);
    expect(source).toMatch(/upcomingCard:\s*{[^}]*borderRadius:\s*R\.card/s);
    expect(source).toMatch(/prefBanner:\s*{[^}]*borderRadius:\s*R\.card/s);
  });

  it('워드마크 헤더 + 히어로 일러스트를 재사용한다', () => {
    expect(source).toContain('<Wordmark');
    expect(source).toMatch(/Illustration\s+name="home-map-book"/);
  });

  it('다가오는 데이트를 공용 PlanListRow로 렌더한다', () => {
    expect(source).toContain('PlanListRow');
  });

  it('데이터 로드 실패 시 사용자에게 에러를 알린다', () => {
    expect(source).toMatch(/catch\s*{[\s\S]{0,200}home\.loadError/);
  });

  it('알림/설정 아이콘 버튼에 accessibilityLabel이 있다', () => {
    expect(source).toMatch(/bellBtn[\s\S]{0,400}accessibilityLabel=\{t\('home\.accessibility\.notifications'\)\}/);
    expect(source).toMatch(/avatarBtn[\s\S]{0,400}accessibilityLabel=\{t\('home\.accessibility\.settings'\)\}/);
  });

  it('스타일 정의에 하드코딩 hex 색상이 없다 (토큰만 사용)', () => {
    const styleBlock = source.slice(source.indexOf('StyleSheet.create'));
    expect(styleBlock).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });

  it('ko/en 로케일에 새 카피가 함께 추가된다', () => {
    const ko = JSON.parse(read('locales/ko/home.json'));
    const en = JSON.parse(read('locales/en/home.json'));
    for (const k of ['greetingLine1', 'greetingLine2', 'newCourseTitle', 'courseStartCta', 'prefTitle', 'loadError']) {
      expect(typeof ko.home[k]).toBe('string');
      expect(typeof en.home[k]).toBe('string');
    }
    expect(typeof ko.home.accessibility?.notifications).toBe('string');
    expect(typeof en.home.accessibility?.settings).toBe('string');
  });
});
