import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 별을 누를 때도 전역 pressed opacity(0.88)를 사용해 과도한 깜빡임을 막고
// 채워지는 상태 변화와 함께 동일한 터치 피드백을 제공한다.
const STAR_SCREENS = [
  { file: 'app/card/review.tsx', testId: 'review-star-' },
  { file: 'app/card/memory/new.tsx', testId: 'new-memory-star-' },
  { file: 'app/card/memory/edit/[id].tsx', testId: 'edit-memory-star-' },
];

describe('별점 탭 피드백', () => {
  it.each(STAR_SCREENS)('$file 의 별 버튼은 공통 pressed opacity를 사용한다', ({ file, testId }) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    const start = source.indexOf(testId);
    expect(start).toBeGreaterThan(-1);

    // testID부터 안쪽 <Star까지가 그 TouchableOpacity의 prop 블록이다.
    // (닫는 `>`로 자르면 onPress의 화살표 `=>`에 먼저 걸린다.)
    const block = source.slice(start, source.indexOf('<Star', start));
    expect(block).toContain('activeOpacity={0.88}');
  });
});
