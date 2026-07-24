import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 코스 확정 후 '저장'/'보내기'를 누르면 제목 편집 시트가 먼저 뜨고,
// 사용자가 정한 제목으로 date_cards.title 을 갱신한 뒤 원래 동작(저장/공유)을 이어간다.
// 제목 정규화는 resolveConfirmTitle 로 위임한다(빈 값이면 위치 기반 기본 제목 폴백).
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('course-result title sheet', () => {
  const source = read('app/mode-flow/course-result.tsx');

  it('resolveConfirmTitle 헬퍼를 재사용한다', () => {
    expect(source).toMatch(/import \{ resolveConfirmTitle \} from '\.\.\/\.\.\/lib\/confirm-title'/);
  });

  it('저장·보내기 버튼이 곧바로 저장/공유하지 않고 제목 시트를 연다', () => {
    // 두 액션 모두 openTitleSheet 를 통해 시트를 먼저 띄운다.
    expect(source).toMatch(/openTitleSheet\('save'\)/);
    expect(source).toMatch(/openTitleSheet\('send'\)/);
  });

  it('시트 확정 시 resolveConfirmTitle 로 정규화한 제목으로 date_cards.title 을 갱신한다', () => {
    expect(source).toMatch(/resolveConfirmTitle\(draftTitle,/);
    expect(source).toMatch(/\.from\('date_cards'\)[\s\S]*?\.update\(\{ title:/);
  });

  it('업데이트는 읽기와 동일한 신뢰 가능한 카드 id(snapshot)를 사용한다', () => {
    // 재확정 시 next.confirmedCardId 가 비면 update 가 조용히 스킵된다 → snapshot 을 우선 사용.
    expect(source).toMatch(/snapshot\.confirmedCardId \?\? next\.confirmedCardId/);
  });

  it('제목 업데이트가 실제 반영됐는지 갱신 행으로 검증한다', () => {
    expect(source).toMatch(/title update affected no rows/);
  });

  it('표시 언어 오버레이(content_i18n)의 title 도 함께 갱신한다', () => {
    // 화면은 content_i18n[언어].title 을 title 컬럼 위에 덮어쓰므로, 둘 다 갱신해야 반영된다.
    expect(source).toMatch(/import \{[^}]*overrideCardTitle[^}]*\} from '\.\.\/\.\.\/lib\/card-i18n'/);
    expect(source).toMatch(/content_i18n: overrideCardTitle\(/);
  });

  it('제목 시트는 키보드에 가리지 않도록 avoidKeyboard 로 렌더한다', () => {
    expect(source).toMatch(/<PickerSheet[\s\S]*?avoidKeyboard/);
    expect(source).toMatch(/confirmLabel=\{t\('modeFlow\.courseResult\.titleSaveButton'\)\}/);
  });
});
