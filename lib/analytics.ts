import {
  getAnalytics,
  logEvent as logFirebaseEvent,
  logScreenView as logFirebaseScreenView,
} from '@react-native-firebase/analytics';
import { supabase } from './supabase';

export type AnalyticsEventName =
  | 'login'
  | 'couple_connected'
  | 'onboarding_completed'
  | 'recommendation_request_started'
  | 'recommendation_request_succeeded'
  | 'recommendation_request_failed'
  | 'place_selected'
  | 'course_regenerate_requested'
  | 'course_saved'
  | 'proposal_sent';

type AnalyticsParams = Record<string, unknown>;

const SCREEN_CLASS = 'DateNavi';

async function recordAuthenticatedEvent(name: AnalyticsEventName | 'screen_view', params: AnalyticsParams) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.is_anonymous) return;

    const { error } = await supabase.from('analytics_events').insert({
      event_name: name,
      params,
    });
    if (error) console.warn('[analytics] Supabase event insert failed', error);
  } catch (error) {
    console.warn('[analytics] Supabase event insert failed', error);
  }
}

export async function logEvent(name: AnalyticsEventName, params?: AnalyticsParams) {
  const eventParams = params ?? {};
  try {
    await logFirebaseEvent(getAnalytics(), name as any, eventParams);
  } catch (error) {
    console.warn('[analytics] Firebase event log failed', error);
  }
  await recordAuthenticatedEvent(name, eventParams);
}

export async function logScreenView(screenName: string) {
  const params = { screen_name: screenName, screen_class: SCREEN_CLASS };
  try {
    await logFirebaseScreenView(getAnalytics(), params);
  } catch (error) {
    console.warn('[analytics] Firebase screen view log failed', error);
  }
  await recordAuthenticatedEvent('screen_view', params);
}
