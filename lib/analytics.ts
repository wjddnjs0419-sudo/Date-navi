import { supabase } from './supabase';

type EventName =
  | 'signup'
  | 'login'
  | 'couple_connected'
  | 'mode_selected'
  | 'ai_card_created'
  | 'date_completed'
  | 'onboarding_completed'
  // 추천 파이프라인 계측 (V2 §18) — analytics_events.params(jsonb)에 지표 적재.
  | 'recommendation_generated'
  | 'recommendation_regenerated'
  | 'recommendation_fallback';

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
