import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 커플 두 사람의 앱 언어가 다를 수 있다. date_cards를 화면에 뿌리는 곳은
// content_i18n을 함께 조회하고 localizeCardContent로 뷰어 언어 텍스트를 골라야 한다.
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe.each([
  ['app/(tabs)/candidates.tsx'],
  ['app/card/[id].tsx'],
  ['app/share/send.tsx'],
  ['app/share/mutual.tsx'],
])('%s card localization', (path) => {
  const source = read(path);

  it('localizes card content for the viewer language', () => {
    expect(source).toContain('localizeCardContent');
  });
});

describe.each([
  ['app/(tabs)/candidates.tsx'],
  ['app/share/send.tsx'],
  ['app/share/mutual.tsx'],
])('%s card query', (path) => {
  const source = read(path);

  it('selects content_i18n alongside card texts', () => {
    expect(source).toContain('content_i18n');
  });
});
