import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// "오늘은 부담돼 → 조건 선택 → 재생성" 흐름을 앱에서 전부 걷어냈는지 확인한다.
// DB의 reactions.condition_tag 컬럼과 기존 행은 남겨두므로, 여기서 보는 건 앱 코드뿐이다.
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('burden 조건 흐름 제거', () => {
  it('후보 목록이 조건 태그를 읽지도 보여주지도 않는다', () => {
    const source = read('app/(tabs)/candidates.tsx');
    expect(source).not.toContain('condition_tag');
    expect(source).not.toContain('ConditionTag');
    expect(source).not.toContain('CONDITION_LABEL');
    expect(source).not.toContain('conditionLine');
  });

  it('상대 반응 문구가 조건 라벨을 앞에 붙이지 않는다', () => {
    const source = read('lib/partnerReaction.ts');
    expect(source).not.toContain('condition_tag');
    expect(source).not.toContain('conditionLabel');
  });

  it('조건 관련 i18n 키가 ko/en 양쪽에서 사라졌다', () => {
    for (const lang of ['ko', 'en']) {
      const card = read(`locales/${lang}/card.json`);
      expect(card).not.toContain('conditionTags');
      expect(card).not.toContain('conditionSectionTitle');
      expect(card).not.toContain('conditionSectionSub');
      expect(card).not.toContain('regenerateWithCondition');
      expect(card).not.toContain('regeneratePromptPrefix');
      expect(card).not.toContain('regenerateAlertTitle');

      const candidates = read(`locales/${lang}/candidates.json`);
      expect(candidates).not.toContain('conditionLabels');
    }
  });
});
