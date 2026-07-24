import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 초대 카드가 앱 전체 핑크 톤(page bg #FFF9FC)에서 유일하게 웜 크림(#FFF3E0)이라 겉돌던 문제.
// A안: 카드 배경을 앱 표준 흰색 SoftCard로 통일 + 라벨색을 크림 브라운→로즈로.
// (초기에 함께 넣었던 발밑 접지 그림자는 사용자 요청으로 제거함.)
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('couple-connect invite card tone (A안 흰 카드 + 접지 그림자)', () => {
  const source = read('app/onboarding/couple-connect.tsx');

  it('does not paint the invite card with warm cream', () => {
    expect(source).not.toMatch(/inviteCard:\s*\{[^}]*backgroundColor:\s*C\.cream/);
  });

  it('uses a rose label color instead of cream brown', () => {
    expect(source).not.toMatch(/inviteLabel:\s*\{[^}]*C\.creamFg/);
    expect(source).toMatch(/inviteLabel:\s*\{[^}]*C\.pinkDeep/);
  });

  it('does not add a contact shadow element under the mascot', () => {
    expect(source).not.toContain('mascotShadow');
  });
});
