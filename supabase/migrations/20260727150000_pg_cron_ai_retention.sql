-- AI 로그 보존: 일별 집계 → 만료 삭제를 pg_cron으로 하루 한 번 돌린다.
-- 반드시 일별 집계 마이그레이션(20260727100000) 이후에 적용한다.
-- 순서가 뒤집히면 첫 purge에서 집계 없는 이력이 사라진다.
begin;

create extension if not exists pg_cron;

-- 집계 → 삭제를 한 함수에 묶어 순서를 스케줄 설정이 아니라 코드로 보장한다.
create or replace function public.run_ai_retention()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.aggregate_ai_recommendation_log_daily_stats();
  perform public.purge_expired_ai_data();
end;
$$;
revoke all on function public.run_ai_retention() from public;
revoke all on function public.run_ai_retention() from anon, authenticated;

-- 삭제 함수는 생성 당시 `from public`만 회수해 authenticated 실행 권한이 남아 있다
-- (20260727130000에서 같은 함정을 실측). 로그인 사용자가 직접 호출하면 집계 없이
-- 30일 초과 이력이 지워지므로 여기서 함께 잠근다.
revoke all on function public.purge_expired_ai_data() from anon, authenticated;

-- 03:30 KST(= 18:30 UTC) 매일. 중복 등록 방지를 위해 기존 잡을 먼저 내린다.
select cron.unschedule(jobid) from cron.job where jobname = 'ai-retention-daily';
select cron.schedule('ai-retention-daily', '30 18 * * *', $$select public.run_ai_retention()$$);

commit;
