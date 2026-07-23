import { supabase } from './supabase';

/**
 * Apple은 이름을 계정당 최초 1회만 준다. 그 자리에서 저장하지 않으면 영구 소실이므로
 * 프로필에 이름이 아직 없을 때만 채운다(온보딩 닉네임 화면이 나중에 덮어써도 무방).
 * 로그인 자체는 이미 성공한 뒤라, 어떤 실패도 로그인을 뒤집지 않도록 삼킨다.
 */
export async function saveAppleFullNameIfMissing(fullName: string | null): Promise<void> {
  if (!fullName?.trim()) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('date_planner_profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle<{ display_name: string | null }>();
    if (profile?.display_name?.trim()) return;

    await supabase
      .from('date_planner_profiles')
      .upsert(
        {
          id: user.id,
          user_id: user.id,
          display_name: fullName.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
  } catch {
    // 이름 저장 실패는 사용자에게 알리지 않는다 — 닉네임은 온보딩에서 다시 입력받는다.
  }
}
