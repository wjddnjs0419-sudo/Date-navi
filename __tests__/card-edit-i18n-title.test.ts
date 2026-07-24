import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// candidates → 카드 상세 → 수정 화면. 표시 경로가 content_i18n[언어] 텍스트를
// 원본 컬럼 위에 덮어쓰므로, 제목·요약 수정 시 content_i18n 도 함께 갱신해야 반영된다.
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card edit screen i18n title/summary sync', () => {
  const source = read('app/card/edit/[id].tsx');

  it('로드 시 언어 오버레이가 적용된(화면에 보이는) 텍스트로 초기화한다', () => {
    expect(source).toMatch(/import \{[^}]*localizeCardContent[^}]*\} from '\.\.\/\.\.\/\.\.\/lib\/card-i18n'/);
    expect(source).toMatch(/localizeCardContent\(/);
    expect(source).toMatch(/select\('title, summary, content_i18n/);
  });

  it('저장 시 content_i18n 의 제목·요약도 함께 덮어쓴다', () => {
    expect(source).toMatch(/import \{[^}]*overrideCardContent[^}]*\} from '\.\.\/\.\.\/\.\.\/lib\/card-i18n'/);
    expect(source).toMatch(/content_i18n: overrideCardContent\([\s\S]*?\{ title: title\.trim\(\), summary: summary\.trim\(\) \}/);
  });
});
