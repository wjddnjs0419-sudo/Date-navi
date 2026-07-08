import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export type PushNotificationType = 'reaction' | 'new_card' | 'soft_message';

export function buildPushNavigationTarget(
  type: PushNotificationType,
  payload: { card_id?: string },
): string {
  if ((type === 'new_card' || type === 'reaction') && payload.card_id) {
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
