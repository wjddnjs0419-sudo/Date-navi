import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '../lib/supabase';
import { I18nProvider } from '../lib/i18n';

SplashScreen.preventAutoHideAsync();

async function getDestination(session: Session | null): Promise<string> {
  if (!session) return '/(auth)';

  const { data: profile } = await supabase
    .from('date_planner_profiles')
    .select('display_name, couple_id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!profile?.display_name) return '/onboarding/nickname';
  if (!profile.couple_id) return '/onboarding/couple-connect';

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('user_id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!prefs) return '/onboarding/preferences';
  return '/(tabs)';
}

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const dest = await getDestination(session);
      router.replace(dest as any);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { router.replace('/(auth)'); return; }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setTimeout(() => {
          getDestination(session).then((dest) => router.replace(dest as any));
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <I18nProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="mode-flow" />
        <Stack.Screen name="share" />
        <Stack.Screen name="account" />
        <Stack.Screen name="candidates" />
        <Stack.Screen name="memories-flow" />
        <Stack.Screen name="legal" />
      </Stack>
    </I18nProvider>
  );
}
