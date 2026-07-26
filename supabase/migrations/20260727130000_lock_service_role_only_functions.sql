-- 원장 마이그레이션 적용 후 실측에서 드러난 갭 수정.
-- `revoke all on function ... from public`은 이 프로젝트에서 충분하지 않다:
-- anon·authenticated 롤에 함수 실행 권한이 직접 부여되어 있어, revoke 후에도
-- has_function_privilege('authenticated', ..., 'execute') = true 였다.
-- 서비스 롤만 호출해야 하는 두 함수를 명시적으로 회수한다.
-- (record_recommendation_place_feedback·get_course_places_for_review는 클라이언트가
--  직접 호출하는 통로이므로 그대로 둔다.)
begin;

revoke all on function public.aggregate_ai_recommendation_log_daily_stats() from anon, authenticated;
revoke all on function public.recompute_place_observed_price(text) from anon, authenticated;

commit;
