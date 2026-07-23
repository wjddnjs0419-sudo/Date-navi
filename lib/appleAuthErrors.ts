// 사용자가 Apple 시트를 닫은 것은 실패가 아니라서 아무 문구도 띄우지 않는다.
// ERR_CANCELED는 구버전 expo-apple-authentication이 쓰던 같은 의미의 코드다.
const CANCELLED_CODES = ['ERR_REQUEST_CANCELED', 'ERR_CANCELED'];

export function getAppleSignInErrorMessageKey(code: string | undefined): string | null {
  if (code && CANCELLED_CODES.includes(code)) return null;
  return 'auth.errorAppleFailed';
}
