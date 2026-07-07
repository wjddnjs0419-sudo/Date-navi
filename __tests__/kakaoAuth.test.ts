import { getKakaoSignInErrorMessageKey } from '../lib/kakaoAuthErrors';

describe('getKakaoSignInErrorMessageKey', () => {
  it('사용자가 취소한 경우 에러 메시지 없음(null)', () => {
    expect(getKakaoSignInErrorMessageKey('E_CANCELLED_OPERATION')).toBeNull();
  });

  it('그 외 에러 코드는 일반 실패 메시지 키 반환', () => {
    expect(getKakaoSignInErrorMessageKey('E_NETWORK_ERROR')).toBe('auth.errorKakaoFailed');
  });

  it('코드 없음(undefined)도 일반 실패 메시지 키 반환', () => {
    expect(getKakaoSignInErrorMessageKey(undefined)).toBe('auth.errorKakaoFailed');
  });
});
