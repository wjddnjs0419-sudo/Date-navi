import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 목업이 없는 화면들이지만 사용자 지시로 connected/couple-connect-manage/notifications와
// 동일한 bg-park 풀블리드 배경을 추가한다: 일러스트가 전혀 없고 하단이 크게 비어 있던 화면들.
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('dead-space screens get the shared bg-park full-bleed treatment', () => {
  it('onboarding/couple-choice renders bg-park outside SafeAreaView', () => {
    const source = read('app/onboarding/couple-choice.tsx');
    expect(source).toMatch(
      /<Illustration name="bg-park" resizeMode="cover"[\s\S]*?<\/SafeAreaView>/,
    );
  });

  it('mode-flow/place-search renders bg-park outside SafeAreaView', () => {
    const source = read('app/mode-flow/place-search.tsx');
    expect(source).toMatch(
      /<Illustration name="bg-park" resizeMode="cover"[\s\S]*?<\/SafeAreaView>/,
    );
  });

  it('mode-flow/place-detail renders bg-park outside SafeAreaView', () => {
    const source = read('app/mode-flow/place-detail.tsx');
    expect(source).toMatch(
      /<Illustration name="bg-park" resizeMode="cover"[\s\S]*?<\/SafeAreaView>/,
    );
  });
});
