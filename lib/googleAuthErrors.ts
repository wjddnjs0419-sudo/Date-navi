export function getGoogleSignInErrorMessageKey(code: string | undefined): string | null {
  if (code === 'SIGN_IN_CANCELLED') return null;
  return 'auth.errorGoogleFailed';
}
