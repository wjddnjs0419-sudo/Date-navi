import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export type PushNotificationType = 'reaction' | 'new_card' | 'soft_message';

export function buildPushNavigationTarget(
  type: PushNotificationType,
  payload: { card_id?: string },
): string {
  // new_card(데이트 제안)는 알림함의 모달에서 카드+문구를 확인 후 반응 화면으로 이동하므로
  // 카드 상세가 아닌 알림함으로 보낸다.
  if (type === 'reaction' && payload.card_id) {
    return `/card/${payload.card_id}`;
  }
  return '/account/notifications';
}

export async function registerPushToken(): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  await supabase.from('push_tokens').upsert({
    user_id: user.id,
    expo_push_token: token,
    platform: 'ios',
  });
}
