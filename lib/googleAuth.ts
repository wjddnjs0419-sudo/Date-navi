import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

export { getGoogleSignInErrorMessageKey } from './googleAuthErrors';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  configured = true;
}

export async function signInWithGoogle(): Promise<{ cancelled: boolean }> {
  ensureConfigured();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) {
    return { cancelled: true };
  }
  const idToken = response.data.idToken;
  if (!idToken) {
    throw Object.assign(new Error('Google sign-in did not return an idToken'), { code: 'NO_ID_TOKEN' });
  }
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
  return { cancelled: false };
}
