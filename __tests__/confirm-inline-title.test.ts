import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// "Make this the date?" 확정 화면(card/confirm.tsx)에서도 카드 제목을 박스 안에서
// 인라인으로 직접 수정할 수 있어야 한다. 비워두면 원래 제목으로 폴백한다(resolveConfirmTitle).
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('confirm screen inline title editing', () => {
  const source = read('app/card/confirm.tsx');

  it('resolveConfirmTitle 헬퍼로 제목을 정규화한다', () => {
    expect(source).toMatch(/import \{ resolveConfirmTitle \} from '\.\.\/\.\.\/lib\/confirm-title'/);
  });

  it('편집 가능한 title 상태를 두고 로드 시 (언어 오버레이 적용된) 카드 제목으로 초기화한다', () => {
    expect(source).toMatch(/const \[title, setTitle\] = useState/);
    expect(source).toMatch(/setTitle\(localized\.title \?\? ''\)/);
  });

  it('편집 모드 카드 안에서 제목을 TextInput 으로 인라인 편집한다', () => {
    expect(source).toMatch(/value=\{title\}[\s\S]*?onChangeText=\{setTitle\}/);
  });

  it('저장 시 정규화한 제목을 update 에 포함한다', () => {
    expect(source).toMatch(/resolveConfirmTitle\(title, card\?\.title \?\? ''\)/);
  });

  it('표시 언어 오버레이(content_i18n)의 title 도 함께 갱신한다', () => {
    expect(source).toMatch(/import \{[^}]*overrideCardTitle[^}]*\} from '\.\.\/\.\.\/lib\/card-i18n'/);
    expect(source).toMatch(/content_i18n: overrideCardTitle\(/);
  });
});
