import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import * as SplashScreen from 'expo-splash-screen';
import * as ExpoLinking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { I18nProvider } from '../lib/i18n';
import { PENDING_INVITE_CODE_KEY, isCoupleRowLinked, parseInviteCodeFromUrl } from '../lib/couple-invite';
import * as Notifications from 'expo-notifications';
import { registerPushToken, buildPushNavigationTarget, type PushNotificationType } from '../lib/push';

SplashScreen.preventAutoHideAsync();

async function rememberInviteUrl(url?: string | null) {
  const code = parseInviteCodeFromUrl(url);
  if (code) await AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, code);
  return code;
}

async function getPendingInviteCode() {
  return AsyncStorage.getItem(PENDING_INVITE_CODE_KEY);
}

async function getDestination(session: Session | null): Promise<string> {
  if (!session) return '/(auth)';

  const { data: profile } = await supabase
    .from('date_planner_profiles')
    .select('display_name, couple_id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!profile?.display_name) return '/onboarding/nickname';

  const { data: coupleRow } = profile.couple_id
    ? await supabase
      .from('date_planner_couples')
      .select('status, partner_user_id')
      .eq('id', profile.couple_id)
      .maybeSingle()
    : { data: null };

  if (!isCoupleRowLinked(coupleRow)) {
    const pendingCode = await getPendingInviteCode();
    return pendingCode
      ? `/onboarding/couple-connect?code=${encodeURIComponent(pendingCode)}`
      : '/onboarding/couple-connect';
  }

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('onboarding_completed')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!prefs?.onboarding_completed) return '/onboarding/preferences';
  return '/(tabs)';
}

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    async function routeForSession(session: Session | null) {
      const dest = await getDestination(session);
      router.replace(dest as any);
    }

    (async () => {
      try {
        await rememberInviteUrl(await ExpoLinking.getInitialURL());
        const { data: { session } } = await supabase.auth.getSession();
        await routeForSession(session);
      } finally {
        await SplashScreen.hideAsync();
      }
    })();

    const urlSubscription = ExpoLinking.addEventListener('url', ({ url }) => {
      void (async () => {
        const code = await rememberInviteUrl(url);
        if (!code) return;

        const { data: { session } } = await supabase.auth.getSession();
        await routeForSession(session);
      })();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { router.replace('/(auth)'); return; }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setTimeout(() => {
          void routeForSession(session);
        }, 0);
        if (event === 'SIGNED_IN') void registerPushToken();
      }
    });

    const notificationSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: PushNotificationType; card_id?: string };
      if (!data?.type) return;
      const target = buildPushNavigationTarget(data.type, { card_id: data.card_id });
      router.push(target as any);
    });

    return () => {
      subscription.unsubscribe();
      urlSubscription.remove();
      notificationSubscription.remove();
    };
  }, []);

  return (
    <I18nProvider>
      <StatusBar style="dark" />
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
