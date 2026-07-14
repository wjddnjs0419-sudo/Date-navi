begin;

create table if not exists public.place_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.recommendation_sessions(id) on delete cascade,
  step_id text not null,
  kakao_place_id text not null check (length(btrim(kakao_place_id)) > 0),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  couple_id text references public.date_planner_couples(id) on delete set null,
  visited boolean not null,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, step_id, owner_user_id),
  foreign key (session_id, step_id) references public.recommendation_course_steps(session_id, step_id) on delete cascade,
  check (tags <@ array['conversation','quiet','noisy','value','expensive','photos','revisit','crowded']::text[])
);
create index if not exists place_feedback_owner_created_idx on public.place_feedback(owner_user_id, created_at desc);
create index if not exists place_feedback_place_idx on public.place_feedback(kakao_place_id, created_at desc);
alter table public.place_feedback enable row level security;
create policy "place_feedback_owner_select" on public.place_feedback for select to authenticated using (owner_user_id = auth.uid());
revoke insert, update, delete on public.place_feedback from authenticated;
revoke insert, update, delete on public.recommendation_step_events from authenticated;

alter table public.recommendation_step_events
  drop constraint if exists recommendation_step_events_event_type_check;
alter table public.recommendation_step_events
  add constraint recommendation_step_events_event_type_check check (event_type in ('initial_recommendation','place_replaced','place_locked','place_unlocked','place_deleted','place_added','course_confirmed','place_visited','feedback_submitted'));

-- Preserve the audited Phase 9 implementation verbatim except for a
-- transaction-local action marker consumed by the following trigger. This
-- avoids treating the internal delete/insert of regeneration as a user delete.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure) into v_definition;
  if position('perform set_config(''app.recommendation_event_action''' in lower(v_definition)) = 0 then
    v_definition := replace(v_definition,
      '  if p_action not in (''lock'',''unlock'',''reorder'',''replace'',''add'',''delete'',''regenerate'',''confirm'') then',
      '  perform set_config(''app.recommendation_event_action'', p_action, true);' || chr(10) || '  if p_action not in (''lock'',''unlock'',''reorder'',''replace'',''add'',''delete'',''regenerate'',''confirm'') then');
    execute v_definition;
  end if;
end;
$$;

create or replace function public.write_recommendation_step_event(
  p_session_id text, p_step_id text, p_event_type text,
  p_previous_place text default null, p_next_place text default null, p_candidate_rank integer default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.recommendation_step_events(session_id, step_id, event_type, previous_kakao_place_id, next_kakao_place_id, candidate_rank, actor_user_id)
  values (p_session_id, p_step_id, p_event_type, p_previous_place, p_next_place, p_candidate_rank, auth.uid());
end;
$$;

create or replace function public.recommendation_course_step_event_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_action text := current_setting('app.recommendation_event_action', true);
begin
  if tg_op = 'insert' and v_action is null and not exists (select 1 from public.recommendation_step_events where session_id = new.session_id and step_id = new.step_id and event_type = 'initial_recommendation') then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, 'initial_recommendation', null, new.current_kakao_place_id);
  elsif tg_op = 'insert' and v_action = 'add' then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, 'place_added', null, new.current_kakao_place_id);
  elsif tg_op = 'update' and v_action in ('lock', 'unlock') and old.locked is distinct from new.locked then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, case when new.locked then 'place_locked' else 'place_unlocked' end, old.current_kakao_place_id, new.current_kakao_place_id);
  elsif tg_op = 'update' and v_action = 'replace' and old.current_kakao_place_id is distinct from new.current_kakao_place_id then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, 'place_replaced', old.current_kakao_place_id, new.current_kakao_place_id);
  elsif tg_op = 'delete' and v_action = 'delete' then
    perform public.write_recommendation_step_event(old.session_id, old.step_id, 'place_deleted', old.current_kakao_place_id, null);
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists recommendation_course_step_event_audit on public.recommendation_course_steps;
create trigger recommendation_course_step_event_audit after insert or update or delete on public.recommendation_course_steps
  for each row execute function public.recommendation_course_step_event_trigger();

create or replace function public.recommendation_session_event_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status is distinct from 'confirmed' and new.status = 'confirmed' then
    perform public.write_recommendation_step_event(new.id, null, 'course_confirmed');
  end if;
  return new;
end;
$$;
drop trigger if exists recommendation_session_event_audit on public.recommendation_sessions;
create trigger recommendation_session_event_audit after update of status on public.recommendation_sessions
  for each row execute function public.recommendation_session_event_trigger();

create or replace function public.record_recommendation_step_event(p_session_id text, p_step_id text, p_event_type text, p_candidate_rank integer default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid := auth.uid(); v_place text;
begin
  if v_owner is null then raise insufficient_privilege using message = 'not authenticated'; end if;
  if p_event_type not in ('place_added') then raise invalid_parameter_value using message = 'operation_failed'; end if;
  select current_kakao_place_id into v_place from public.recommendation_course_steps s join public.recommendation_sessions r on r.id = s.session_id where s.session_id = p_session_id and s.step_id = p_step_id and r.owner_user_id = v_owner;
  if p_event_type = 'place_added' and v_place is null then raise no_data_found using message = 'missing'; end if;
  perform public.write_recommendation_step_event(p_session_id, p_step_id, p_event_type, null, v_place, p_candidate_rank);
end;
$$;
revoke all on function public.record_recommendation_step_event(text,text,text,integer) from public;
grant execute on function public.record_recommendation_step_event(text,text,text,integer) to authenticated;

create or replace function public.record_recommendation_place_feedback(p_session_id text, p_step_id text, p_visited boolean, p_tags text[] default '{}'::text[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid := auth.uid(); v_session public.recommendation_sessions%rowtype; v_place text;
begin
  if v_owner is null then raise insufficient_privilege using message = 'not authenticated'; end if;
  select * into v_session from public.recommendation_sessions where id = p_session_id and owner_user_id = v_owner;
  if not found or v_session.status <> 'confirmed' then raise check_violation using message = 'constraint_violation'; end if;
  select current_kakao_place_id into v_place from public.recommendation_course_steps where session_id = p_session_id and step_id = p_step_id;
  if v_place is null or coalesce(p_tags, '{}'::text[]) <@ array['conversation','quiet','noisy','value','expensive','photos','revisit','crowded']::text[] is false then raise invalid_parameter_value using message = 'invalid_candidate'; end if;
  insert into public.place_feedback(session_id,step_id,kakao_place_id,owner_user_id,couple_id,visited,tags) values (p_session_id,p_step_id,v_place,v_owner,v_session.couple_id,p_visited,coalesce(p_tags,'{}'::text[])) on conflict (session_id,step_id,owner_user_id) do update set visited=excluded.visited,tags=excluded.tags,updated_at=now();
  perform public.write_recommendation_step_event(p_session_id,p_step_id,case when p_visited then 'place_visited' else 'feedback_submitted' end,v_place,v_place);
end;
$$;
revoke all on function public.record_recommendation_place_feedback(text,text,boolean,text[]) from public;
grant execute on function public.record_recommendation_place_feedback(text,text,boolean,text[]) to authenticated;

commit;
