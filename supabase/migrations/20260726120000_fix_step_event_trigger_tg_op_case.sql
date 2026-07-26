begin;

-- 트리거는 지금까지 tg_op를 소문자와 비교해 어떤 분기에도 걸리지 않았다.
-- PL/pgSQL의 TG_OP는 'INSERT'/'UPDATE'/'DELETE' 대문자다.
--
-- 대소문자만 고치면 삭제가 깨진다. recommendation_step_events의
-- (session_id, step_id) 복합 FK는 recommendation_course_steps를 cascade로 참조하므로,
--   * after delete  -> 부모가 이미 없어 FK 위반으로 스텝 삭제가 실패하고
--   * before delete -> insert는 성공하지만 이어지는 cascade가 그 행을 지운다.
-- 감사 로그는 대상보다 오래 살아남아야 한다. 세션 FK만 남긴다.
alter table public.recommendation_step_events
  drop constraint if exists recommendation_step_events_session_id_step_id_fkey;

-- 트리거가 살아나면서 이벤트 기록 실패가 곧 원본 쓰기 실패가 됐다. actor_user_id는
-- not null인데 서비스 롤 컨텍스트에서는 auth.uid()가 null이므로 세션 소유자로 채운다.
create or replace function public.write_recommendation_step_event(
  p_session_id text, p_step_id text, p_event_type text,
  p_previous_place text default null, p_next_place text default null, p_candidate_rank integer default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.recommendation_step_events(
    session_id, step_id, event_type, previous_kakao_place_id, next_kakao_place_id, candidate_rank, actor_user_id)
  values (
    p_session_id, p_step_id, p_event_type, p_previous_place, p_next_place, p_candidate_rank,
    coalesce(auth.uid(), (select owner_user_id from public.recommendation_sessions where id = p_session_id)));
end;
$$;

create or replace function public.recommendation_course_step_event_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_action text := current_setting('app.recommendation_event_action', true);
  v_candidate_rank integer := nullif(current_setting('app.recommendation_candidate_rank', true), '')::integer;
begin
  if tg_op = 'INSERT' and v_action is null and not exists (
    select 1 from public.recommendation_step_events
    where session_id = new.session_id and step_id = new.step_id and event_type = 'initial_recommendation'
  ) then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, 'initial_recommendation', null, new.current_kakao_place_id);
  elsif tg_op = 'INSERT' and v_action = 'add' then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, 'place_added', null, new.current_kakao_place_id);
  elsif tg_op = 'UPDATE' and v_action in ('lock', 'unlock') and old.locked is distinct from new.locked then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, case when new.locked then 'place_locked' else 'place_unlocked' end, old.current_kakao_place_id, new.current_kakao_place_id);
  elsif tg_op = 'UPDATE' and v_action = 'replace' and old.current_kakao_place_id is distinct from new.current_kakao_place_id then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, 'place_replaced', old.current_kakao_place_id, new.current_kakao_place_id, v_candidate_rank);
  elsif tg_op = 'DELETE' and v_action = 'delete' then
    perform public.write_recommendation_step_event(old.session_id, old.step_id, 'place_deleted', old.current_kakao_place_id, null);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists recommendation_course_step_event_audit on public.recommendation_course_steps;
create trigger recommendation_course_step_event_audit after insert or update or delete on public.recommendation_course_steps
  for each row execute function public.recommendation_course_step_event_trigger();

commit;
