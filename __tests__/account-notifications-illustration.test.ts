import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 홈 화면 벨 아이콘 → /account/notifications. 사용자 피드백: 다른 커플 관련 화면(연결완료,
// couple-connect-manage)과 동일한 bg-park 풀블리드 배경이 이 화면에는 빠져 있었다.
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('account notifications screen illustration', () => {
  const source = read('app/account/notifications.tsx');

  it('renders a full-bleed bg-park illustration outside SafeAreaView (connected 화면과 동일 패턴)', () => {
    expect(source).toMatch(
      /<Illustration name="bg-park" resizeMode="cover"[\s\S]*?<\/SafeAreaView>/,
    );
  });
});
