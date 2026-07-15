-- recommend-date-downstream.ts가 로깅하는 'recommend_date_select' action이
-- 기존 ai_recommendation_logs_action_check에 없어 모든 코스 생성 로그 insert가 400으로 실패하던 문제 수정.

alter table public.ai_recommendation_logs drop constraint ai_recommendation_logs_action_check;

alter table public.ai_recommendation_logs
  add constraint ai_recommendation_logs_action_check
  check (action in ('cards', 'feeling_select', 'course_select', 'recommend_date_select'));
