import { getAnalytics, logEvent as logFirebaseEvent } from '@react-native-firebase/analytics';
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
  const eventParams = params ?? {};
  // `login`은 Firebase Analytics SDK의 예약 이벤트명이므로 사용자 정의 이름을 사용한다.
  const ga4EventName = name === 'login' ? 'user_login' : name;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    try {
      logFirebaseEvent(getAnalytics(), ga4EventName, eventParams);
    } catch {
      // Firebase 전송 실패는 기존 Supabase 이벤트 기록에 영향 없음
    }
    await supabase.from('analytics_events').insert({
      event_name: name,
      user_id: user?.id ?? null,
      params: eventParams,
    });
  } catch {
    // 이벤트 로그 실패는 앱 플로우에 영향 없음
  }
}
