import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 목업(04_onboarding_couple_connect_manage)의 반복 누락 패턴: 헤딩 옆 하트 낙서와
// 하단 배경 일러스트(연결완료 화면과 동일한 bg-park 풀블리드)가 linked 상태 화면에서 빠져 있었다.
// 우상단 마스코트 미니 일러스트는 하단에 이미 bg-park가 있어 사용자 피드백으로 제외했다.
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('couple-connect manage screen (linked) illustration', () => {
  const source = read('app/onboarding/couple-connect.tsx');

  it('renders the heading heart doodle', () => {
    expect(source).toMatch(/headingBlock[\s\S]*?<HeartDoodle/);
  });

  it('does not duplicate the mascot mini illustration in the heading (bg-park already fills the bottom)', () => {
    expect(source).not.toContain('mini-mascot-trees');
  });

  it('renders a full-bleed bg-park illustration outside SafeAreaView when linked (연결완료 화면과 동일 패턴)', () => {
    expect(source).toMatch(
      /status === 'linked'[\s\S]{0,80}<Illustration name="bg-park" resizeMode="cover"[\s\S]*?<\/SafeAreaView>/,
    );
  });
});
