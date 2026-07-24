import { resolveConfirmTitle } from '../lib/confirm-title';

describe('resolveConfirmTitle', () => {
  const fallback = '낙성대역 2호선 데이트 코스';

  test('수정하지 않은 기본값 그대로면 기본값을 반환한다', () => {
    expect(resolveConfirmTitle(fallback, fallback)).toBe(fallback);
  });

  test('직접 입력한 제목은 그 제목을 반환한다', () => {
    expect(resolveConfirmTitle('우리 첫 100일 데이트', fallback)).toBe('우리 첫 100일 데이트');
  });

  test('앞뒤 공백은 잘라내고 반환한다', () => {
    expect(resolveConfirmTitle('  기념일 산책  ', fallback)).toBe('기념일 산책');
  });

  test('완전히 비우면 기본값으로 폴백한다', () => {
    expect(resolveConfirmTitle('', fallback)).toBe(fallback);
  });

  test('공백만 입력해도 기본값으로 폴백한다', () => {
    expect(resolveConfirmTitle('   ', fallback)).toBe(fallback);
  });
});
