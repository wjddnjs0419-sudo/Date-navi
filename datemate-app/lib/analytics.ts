import { supabase } from './supabase';

type EventName =
  | 'signup'
  | 'login'
  | 'couple_connected'
  | 'mode_selected'
  | 'ai_card_created'
  | 'soft_message_generated'
  | 'date_completed'
  | 'onboarding_completed';

export async function logEvent(name: EventName, params?: Record<string, unknown>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('analytics_events').insert({
      event_name: name,
      user_id: user?.id ?? null,
      params: params ?? {},
    });
  } catch {
    // 이벤트 로그 실패는 앱 플로우에 영향 없음
  }
}
