-- replacement-candidates가 로깅하는 'replacement_select' action이
-- 기존 ai_recommendation_logs_action_check에 없으면 이 단계 교체 큐레이션 로그 insert가
-- 전부 400으로 실패한다(20260715152131 세션에서 recommend_date_select 누락으로 겪은 것과 동일한 실수 방지).

alter table public.ai_recommendation_logs drop constraint ai_recommendation_logs_action_check;

alter table public.ai_recommendation_logs
  add constraint ai_recommendation_logs_action_check
  check (action in ('cards', 'feeling_select', 'course_select', 'recommend_date_select', 'replacement_select'));
