import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { AppState, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import * as SplashScreen from 'expo-splash-screen';
import * as ExpoLinking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { I18nProvider } from '../lib/i18n';
import { PENDING_INVITE_CODE_KEY, isCoupleRowLinked, parseInviteCodeFromUrl } from '../lib/couple-invite';
import { resolveCourseShareRoute } from '../lib/course-share';
import { resolveOnboardingDestination } from '../lib/onboarding-routing';
import { RecommendationSessionProvider } from '../components/recommendation/recommendation-session-provider';
import { ScreenshotNavigator } from '../components/screenshot/screenshot-navigator';
import { loadIosVersionPolicy } from '../lib/app-version-policy';
import { withStartupTimeout } from '../lib/startup-timeout';
import { AnalyticsScreenTracker } from '../components/analytics/screen-tracker';
import { DS, SP } from '../constants/theme';
import {
  VERSION_POLICY_LOCK_STORAGE_KEY,
  getActiveVersionPolicyLock,
  parseVersionPolicyLock,
  updateVersionPolicyLock,
  type VersionPolicyCheckResult,
  type VersionPolicyLock,
} from '../lib/version-policy-lock';

SplashScreen.preventAutoHideAsync();

const VERSION_POLICY_TIMEOUT_MS = 2_000;
const STARTUP_ROUTE_TIMEOUT_MS = 2_000;
const SCREENSHOT_MODE = process.env.EXPO_PUBLIC_SCREENSHOT === '1';
let inMemoryVersionPolicyLock: VersionPolicyLock | null = null;

async function rememberInviteUrl(url?: string | null) {
  const code = parseInviteCodeFromUrl(url);
  if (code) await AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, code);
  return code;
}

export function courseShareRouteForUrl(url?: string | null) {
  return resolveCourseShareRoute(url);
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
  const currentVersion = Constants.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '';
  const initialVersionPolicyLock = getActiveVersionPolicyLock(inMemoryVersionPolicyLock, currentVersion);
  const [versionPolicyReady, setVersionPolicyReady] = useState(() => !currentVersion || !!initialVersionPolicyLock);
  const [updateStoreUrl, setUpdateStoreUrl] = useState<string | null>(() => initialVersionPolicyLock?.storeUrl ?? null);
  const updateStoreUrlRef = useRef<string | null>(initialVersionPolicyLock?.storeUrl ?? null);

  useEffect(() => {
    let disposed = false;
    let publicShareRoute: string | null = null;
    let currentVersionPolicyLock: VersionPolicyLock | null = initialVersionPolicyLock;
    let policyCheckPromise: Promise<void> | null = null;

    const setVersionPolicyLock = (lock: VersionPolicyLock | null) => {
      currentVersionPolicyLock = lock;
      inMemoryVersionPolicyLock = lock;
      updateStoreUrlRef.current = lock?.storeUrl ?? null;
      setUpdateStoreUrl(lock?.storeUrl ?? null);
    };

    async function routeForSession(session: Session | null) {
      if (updateStoreUrlRef.current) return;
      if (publicShareRoute) {
        router.replace(publicShareRoute as any);
        return;
      }
      const dest = await getDestination(session);
      if (updateStoreUrlRef.current) return;
      router.replace(dest as any);
    }

    async function restoreVersionPolicyLock() {
      if (!currentVersion) return;

      try {
        const raw = await AsyncStorage.getItem(VERSION_POLICY_LOCK_STORAGE_KEY);
        const cachedLock = parseVersionPolicyLock(raw, currentVersion);
        if (disposed) return;
        if (cachedLock) {
          setVersionPolicyLock(cachedLock);
        } else if (raw) {
          await AsyncStorage.removeItem(VERSION_POLICY_LOCK_STORAGE_KEY);
        }
      } catch {
        // A storage failure must not prevent the remote policy check or startup.
      }
    }

    function checkVersionPolicy() {
      if (!currentVersion || disposed) return Promise.resolve();
      if (policyCheckPromise) return policyCheckPromise;

      policyCheckPromise = (async () => {
        const policy = await withStartupTimeout(
          loadIosVersionPolicy(),
          null,
          VERSION_POLICY_TIMEOUT_MS,
        );
        if (disposed) return;

        const result: VersionPolicyCheckResult = policy
          ? { status: 'success', policy }
          : { status: 'unavailable' };
        const nextLock = updateVersionPolicyLock(currentVersionPolicyLock, currentVersion, result);

        if (result.status === 'success') {
          try {
            if (nextLock) {
              await AsyncStorage.setItem(VERSION_POLICY_LOCK_STORAGE_KEY, JSON.stringify(nextLock));
            } else {
              await AsyncStorage.removeItem(VERSION_POLICY_LOCK_STORAGE_KEY);
            }
          } catch {
            // The in-memory lock still protects this session if persistence fails.
          }
        }

        if (!disposed) {
          setVersionPolicyLock(nextLock);
          setVersionPolicyReady(true);
        }
      })().finally(() => {
        policyCheckPromise = null;
      });

      return policyCheckPromise;
    }

    (async () => {
      try {
        await restoreVersionPolicyLock();
        await checkVersionPolicy();
        if (disposed || updateStoreUrlRef.current) return;

        const routed = await withStartupTimeout(
          (async () => {
            if (updateStoreUrlRef.current) return true;
            const initialUrl = await ExpoLinking.getInitialURL();
            publicShareRoute = courseShareRouteForUrl(initialUrl);
            if (publicShareRoute) {
              router.replace(publicShareRoute as any);
              return true;
            }
            await rememberInviteUrl(initialUrl);
            const { data: { session } } = await supabase.auth.getSession();
            if (session && !SCREENSHOT_MODE) {
              const { ensureStartupPermissions } = require('../lib/startupPermissions');
              void ensureStartupPermissions();
            }
            await routeForSession(session);
            return true;
          })(),
          false,
          STARTUP_ROUTE_TIMEOUT_MS,
        );
        if (!routed && !disposed && !updateStoreUrlRef.current) router.replace('/(auth)');
      } finally {
        await SplashScreen.hideAsync();
      }
    })();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void checkVersionPolicy();
    });

    const urlSubscription = ExpoLinking.addEventListener('url', ({ url }) => {
      void (async () => {
        const shareRoute = courseShareRouteForUrl(url);
        if (shareRoute) {
          publicShareRoute = shareRoute;
          router.replace(shareRoute as any);
          return;
        }
        const code = await rememberInviteUrl(url);
        if (!code) return;

        const { data: { session } } = await supabase.auth.getSession();
        await routeForSession(session);
      })();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (updateStoreUrlRef.current) return;
      if (event === 'SIGNED_OUT') { router.replace('/(auth)'); return; }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setTimeout(() => {
          void routeForSession(session);
        }, 0);
        if (event === 'SIGNED_IN' && !SCREENSHOT_MODE) {
          const { ensureStartupPermissions } = require('../lib/startupPermissions');
          void ensureStartupPermissions();
        }
      }
    });

    const notificationSubscription = SCREENSHOT_MODE
      ? null
      : (() => {
        const Notifications = require('expo-notifications');
        const { buildPushNavigationTarget } = require('../lib/push');
        return Notifications.addNotificationResponseReceivedListener((response: any) => {
          if (updateStoreUrlRef.current) return;
          const data = response.notification.request.content.data as { type?: string; card_id?: string };
          if (!data?.type) return;
          const target = buildPushNavigationTarget(data.type, { card_id: data.card_id });
          router.push(target as any);
        });
      })();

    return () => {
      disposed = true;
      appStateSubscription.remove();
      subscription.unsubscribe();
      urlSubscription.remove();
      notificationSubscription?.remove();
    };
  }, []);

  if (!versionPolicyReady) {
    return <View style={styles.policyCheckScreen} />;
  }

  if (updateStoreUrl) {
    return (
      <View style={styles.updateScreen}>
        <Text style={styles.updateTitle}>새 버전이 필요해요</Text>
        <Text style={styles.updateBody}>계속 이용하려면 Date Navi를 최신 버전으로 업데이트해 주세요.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => void Linking.openURL(updateStoreUrl)} activeOpacity={0.88} style={styles.updateButton}>
          <Text style={styles.updateButtonText}>App Store에서 업데이트</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <I18nProvider>
      <RecommendationSessionProvider>
        <StatusBar style="dark" />
        <AnalyticsScreenTracker />
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
          <Stack.Screen name="course" />
          <Stack.Screen name="account" />
        </Stack>
      </RecommendationSessionProvider>
    </I18nProvider>
  );
}

const styles = StyleSheet.create({
  policyCheckScreen: { flex: 1, backgroundColor: DS.color.canvas },
  updateScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SP.xxxl, backgroundColor: DS.color.canvas },
  updateTitle: { ...DS.typography.authTitle, color: DS.color.textPrimary, marginBottom: DS.component.updateTitleBottom },
  updateBody: { ...DS.typography.bodyLarge, color: DS.color.textSecondary, textAlign: 'center', marginBottom: SP.xxl + SP.xs },
  updateButton: { alignSelf: 'stretch', minHeight: 54, borderRadius: DS.radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.color.brandPrimary },
  updateButtonText: { ...DS.typography.bodyLarge, fontWeight: '800', color: DS.color.surface },
});
