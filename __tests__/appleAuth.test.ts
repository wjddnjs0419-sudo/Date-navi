import { getAppleSignInErrorMessageKey } from '../lib/appleAuthErrors';

describe('getAppleSignInErrorMessageKey', () => {
  it('사용자가 취소한 경우 에러 메시지 없음(null)', () => {
    expect(getAppleSignInErrorMessageKey('ERR_REQUEST_CANCELED')).toBeNull();
  });

  // 구버전 expo-apple-authentication은 같은 취소를 ERR_CANCELED로 던진다.
  it('구버전 취소 코드도 에러 메시지 없음(null)', () => {
    expect(getAppleSignInErrorMessageKey('ERR_CANCELED')).toBeNull();
  });

  it('그 외 에러 코드는 일반 실패 메시지 키 반환', () => {
    expect(getAppleSignInErrorMessageKey('ERR_REQUEST_FAILED')).toBe('auth.errorAppleFailed');
  });

  it('코드 없음(undefined)도 일반 실패 메시지 키 반환', () => {
    expect(getAppleSignInErrorMessageKey(undefined)).toBe('auth.errorAppleFailed');
  });
});
