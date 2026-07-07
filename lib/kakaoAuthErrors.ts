export function getKakaoSignInErrorMessageKey(code: string | undefined): string | null {
  if (code === 'E_CANCELLED_OPERATION') return null;
  return 'auth.errorKakaoFailed';
}
