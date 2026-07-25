import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

// 실기기 확인(2026-07-26): KeyboardAvoidingView(padding)는 공간만 만들 뿐 포커스된
// 입력칸까지 자동 스크롤하지 않는다. 입력이 ScrollView "안"에 있는 화면은
// automaticallyAdjustKeyboardInsets(iOS 전용, 커서 자동 스크롤 포함)를 쓴다.
describe('키보드 인셋 정책', () => {
  const SCROLL_INPUT_SCREENS = [
    'app/mode-flow/course.tsx',
    'app/card/memory/new.tsx',
    'app/card/review.tsx',
    'app/card/confirm.tsx',
  ];

  it.each(SCROLL_INPUT_SCREENS)('%s — 입력이 스크롤 안: automaticallyAdjustKeyboardInsets 사용, KAV 없음', (p) => {
    const src = read(p);
    expect(src).toMatch(/automaticallyAdjustKeyboardInsets/);
    expect(src).not.toMatch(/<KeyboardAvoidingView/);
  });

  it('memory/[id] — 댓글 입력바가 스크롤 밖 고정: KAV가 정답, 유지', () => {
    const src = read('app/card/memory/[id].tsx');
    expect(src).toMatch(/<KeyboardAvoidingView/);
  });
});
