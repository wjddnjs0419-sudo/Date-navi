import { login } from '@react-native-seoul/kakao-login';
import { supabase } from './supabase';

export { getKakaoSignInErrorMessageKey } from './kakaoAuthErrors';

export async function signInWithKakao(): Promise<{ cancelled: boolean }> {
  const token = await login();
  if (!token.idToken) {
    throw Object.assign(new Error('Kakao sign-in did not return an idToken'), { code: 'NO_ID_TOKEN' });
  }
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'kakao', token: token.idToken });
  if (error) throw error;
  return { cancelled: false };
}
