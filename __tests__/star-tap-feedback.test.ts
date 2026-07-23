import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 별을 누를 때 RN TouchableOpacity의 기본 activeOpacity(0.2)가 걸리면 별이 확 흐려졌다
// 돌아와 "깜빡"인다. 채워지는 것 자체가 피드백이므로 별 버튼은 눌러도 흐려지지 않아야 한다.
const STAR_SCREENS = [
  { file: 'app/card/review.tsx', testId: 'review-star-' },
  { file: 'app/card/memory/new.tsx', testId: 'new-memory-star-' },
  { file: 'app/card/memory/edit/[id].tsx', testId: 'edit-memory-star-' },
];

describe('별점 탭 피드백', () => {
  it.each(STAR_SCREENS)('$file 의 별 버튼은 눌러도 흐려지지 않는다', ({ file, testId }) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    const start = source.indexOf(testId);
    expect(start).toBeGreaterThan(-1);

    // testID부터 안쪽 <Star까지가 그 TouchableOpacity의 prop 블록이다.
    // (닫는 `>`로 자르면 onPress의 화살표 `=>`에 먼저 걸린다.)
    const block = source.slice(start, source.indexOf('<Star', start));
    expect(block).toContain('activeOpacity={1}');
  });
});
