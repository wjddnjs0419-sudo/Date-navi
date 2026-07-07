import { getGoogleSignInErrorMessageKey } from '../lib/googleAuthErrors';

describe('getGoogleSignInErrorMessageKey', () => {
  it('사용자가 취소한 경우 에러 메시지 없음(null)', () => {
    expect(getGoogleSignInErrorMessageKey('SIGN_IN_CANCELLED')).toBeNull();
  });

  it('그 외 에러 코드는 일반 실패 메시지 키 반환', () => {
    expect(getGoogleSignInErrorMessageKey('DEVELOPER_ERROR')).toBe('auth.errorGoogleFailed');
  });

  it('코드 없음(undefined)도 일반 실패 메시지 키 반환', () => {
    expect(getGoogleSignInErrorMessageKey(undefined)).toBe('auth.errorGoogleFailed');
  });
});
