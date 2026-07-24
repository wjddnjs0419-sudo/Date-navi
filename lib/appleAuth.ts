import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

export { getAppleSignInErrorMessageKey } from './appleAuthErrors';

type AppleName = { givenName?: string | null; familyName?: string | null } | null;

const HANGUL = /[ㄱ-ㆎ가-힣]/;

/**
 * Apple은 이름을 given/family로 쪼개 주므로 표시용 한 줄로 합친다.
 * 한글 이름은 성이 앞이고 띄어쓰지 않는다.
 */
export function formatAppleFullName(name: AppleName): string | null {
  const given = name?.givenName?.trim() ?? '';
  const family = name?.familyName?.trim() ?? '';
  if (!given && !family) return null;
  if (!given) return family;
  if (!family) return given;
  return HANGUL.test(given + family) ? `${family}${given}` : `${given} ${family}`;
}

/**
 * Apple은 이름·이메일을 계정당 최초 1회만 준다. 재로그인 시 fullName은 null이므로
 * 호출부가 이 반환값을 받은 그 자리에서 저장해야 한다.
 */
export async function signInWithApple(): Promise<{ cancelled: boolean; fullName: string | null }> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) {
    throw Object.assign(new Error('Apple sign-in did not return an identityToken'), { code: 'NO_ID_TOKEN' });
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
  return { cancelled: false, fullName: formatAppleFullName(credential.fullName) };
}
