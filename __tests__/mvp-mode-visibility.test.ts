import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('MVP 단일 모드 노출 — 화면 배선', () => {
  describe('홈 (app/(tabs)/index.tsx)', () => {
    const source = read('app/(tabs)/index.tsx');

    it('feeling 화면으로 직접 라우팅하지 않는다', () => {
      expect(source).not.toContain('/mode-flow/feeling');
    });

    it('활성 모드 목록(ENABLED_DATE_MODE_IDS)만 렌더한다', () => {
      expect(source).toContain('ENABLED_DATE_MODE_IDS');
    });

    it('모드 카드가 1개면 페이지 dots를 숨긴다', () => {
      expect(source).toMatch(/MODES\.length > 1 &&[\s\S]{0,200}s\.dots/);
    });

    it('모드 카드가 1개면 전체보기 링크를 숨긴다', () => {
      expect(source).toMatch(/MODES\.length > 1 &&[\s\S]{0,300}\/\(tabs\)\/mode/);
    });
  });

  describe('후보 탭 (app/(tabs)/candidates.tsx)', () => {
    const source = read('app/(tabs)/candidates.tsx');

    it('feeling 화면으로 직접 라우팅하지 않는다', () => {
      expect(source).not.toContain('/mode-flow/feeling');
    });

    it('bucket 필터는 next_meet 모드 활성 여부에 연동된다', () => {
      expect(source).toContain("isDateModeEnabled('next_meet')");
    });

    it('FAB 라벨이 코스 만들기 키를 쓴다', () => {
      expect(source).toContain('candidates.fabAddCourse');
    });
  });

  describe('탭 레이아웃 (app/(tabs)/_layout.tsx)', () => {
    const source = read('app/(tabs)/_layout.tsx');

    it('단일 모드일 때 mode 탭 탭프레스를 코스 화면으로 가로챈다', () => {
      expect(source).toContain('tabPress');
      expect(source).toContain('PRIMARY_DATE_MODE_ROUTE');
    });

    it('탭프레스는 push가 아니라 navigate를 써서 더블탭 중복 스택을 막는다', () => {
      expect(source).toContain('router.navigate(PRIMARY_DATE_MODE_ROUTE');
      expect(source).not.toContain('router.push(PRIMARY_DATE_MODE_ROUTE');
    });
  });

  describe('모드 선택 화면 (app/(tabs)/mode.tsx)', () => {
    const source = read('app/(tabs)/mode.tsx');

    it('활성 모드 목록만 렌더한다 (딥링크 방어)', () => {
      expect(source).toContain('ENABLED_DATE_MODE_IDS');
    });
  });

  describe('카드 상세 (app/card/[id].tsx)', () => {
    const source = read('app/card/[id].tsx');

    it('재생성 버튼은 카드 모드가 활성일 때만 노출된다 (레거시 모드 카드 게이트)', () => {
      expect(source).toMatch(/myConditionTag && isDateModeEnabled\(card\.mode \?\? 'feeling'\)/);
    });
  });

  describe('i18n 동시 갱신', () => {
    it('ko/en 양쪽에 candidates.fabAddCourse 키가 존재한다', () => {
      const ko = JSON.parse(read('locales/ko/candidates.json'));
      const en = JSON.parse(read('locales/en/candidates.json'));
      expect(typeof ko.candidates.fabAddCourse).toBe('string');
      expect(typeof en.candidates.fabAddCourse).toBe('string');
      expect(ko.candidates.fabAddCourse.length).toBeGreaterThan(0);
      expect(en.candidates.fabAddCourse.length).toBeGreaterThan(0);
    });
  });

  describe('마음 전하기(soft-message) 삭제', () => {
    it('탭바에 soft-message 탭이 없다', () => {
      const source = read('app/(tabs)/_layout.tsx');
      expect(source).not.toContain('soft-message');
      expect(source).not.toContain('Mail');
    });

    it('soft-message 화면 파일이 삭제됐다', () => {
      expect(existsSync(join(process.cwd(), 'app/(tabs)/soft-message.tsx'))).toBe(false);
      expect(existsSync(join(process.cwd(), 'app/soft-message'))).toBe(false);
    });

    it('전용 AI 함수와 프롬프트 빌더가 삭제됐다 (공유 invite/공유 제안 경로는 유지)', () => {
      const ai = read('lib/ai.ts');
      expect(ai).not.toContain('generateSoftMessage');
      expect(ai).not.toContain('adjustSoftMessage');
      expect(ai).toContain('generateInviteMessage');
      const prompt = read('lib/prompt.ts');
      expect(prompt).not.toContain('buildSoftMessagePrompt');
      expect(prompt).not.toContain('buildAdjustSoftMessagePrompt');
    });

    it('ko/en에서 tabs.softMessage와 softMessage 섹션이 제거됐다', () => {
      const ko = JSON.parse(read('locales/ko/tabs.json'));
      const en = JSON.parse(read('locales/en/tabs.json'));
      expect(ko.tabs.softMessage).toBeUndefined();
      expect(en.tabs.softMessage).toBeUndefined();
      expect(ko.softMessage).toBeUndefined();
      expect(en.softMessage).toBeUndefined();
    });
  });

  describe('홈 단일 모드 카드 (커플 이미지 + 정렬)', () => {
    const source = read('app/(tabs)/index.tsx');

    it('커플 이미지 에셋을 사용한다', () => {
      expect(source).toContain("require('../../assets/images/couple-card.jpg')");
    });

    it('단일 모드면 가로 스크롤 대신 좌우 여백이 동일한 전폭 카드를 렌더한다', () => {
      expect(source).toMatch(/MODES\.length > 1 \?/);
      expect(source).toContain('singleModeCard');
    });

    it('이미지 높이는 aspectRatio가 아니라 화면 폭 기반 명시적 숫자로 계산한다 (RN aspectRatio 무시 버그 회피)', () => {
      expect(source).not.toContain('aspectRatio:');
      expect(source).toMatch(/SINGLE_MODE_IMAGE_HEIGHT\s*=\s*Math\.round\(\(SCREEN_W - 40\) \/ SINGLE_MODE_IMAGE_RATIO\)/);
      expect(source).toContain('height: SINGLE_MODE_IMAGE_HEIGHT');
    });
  });
});
