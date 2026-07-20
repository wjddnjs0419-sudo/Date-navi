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
import { resolveOnboardingDestination } from '../lib/onboarding-routing';
import * as Notifications from 'expo-notifications';
import { registerPushToken, buildPushNavigationTarget, type PushNotificationType } from '../lib/push';
import { RecommendationSessionProvider } from '../components/recommendation/recommendation-session-provider';
import { ScreenshotNavigator } from '../components/screenshot/screenshot-navigator';

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

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('onboarding_completed')
    .eq('user_id', session.user.id)
    .maybeSingle();

  return resolveOnboardingDestination({
    hasSession: true,
    displayName: profile.display_name,
    linked: isCoupleRowLinked(coupleRow),
    pendingCode: await getPendingInviteCode(),
    onboardingCompleted: !!prefs?.onboarding_completed,
  });
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
      <RecommendationSessionProvider>
        <StatusBar style="dark" />
        <ScreenshotNavigator />
        <Stack screenOptions={{ headerShown: false }}>
          {/* 최상위 상태 화면들은 router.replace로 전환된다. 스와이프 제스처로
              서로 넘나들면(로그아웃 후 홈이 다시 보이는 등) 안 되므로 비활성화한다.
              상세 화면(settings/mode-flow 등)은 스와이프-뒤로가기를 유지한다. */}
          <Stack.Screen name="index" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(auth)" options={{ gestureEnabled: false }} />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="mode-flow" />
          <Stack.Screen name="share" />
          <Stack.Screen name="account" />
          <Stack.Screen name="candidates" />
          <Stack.Screen name="memories-flow" />
          <Stack.Screen name="legal" />
        </Stack>
      </RecommendationSessionProvider>
    </I18nProvider>
  );
}
