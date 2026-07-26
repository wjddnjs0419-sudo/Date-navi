begin;

-- The mutable draft RPC predates the learning-event trigger. Re-apply its
-- transaction-local action marker and add a rank marker sourced only from the
-- server-issued attestation response, never from p_payload.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure)
    into v_definition;

  if position('app.recommendation_event_action' in lower(v_definition)) = 0 then
    v_definition := replace(
      v_definition,
      '  if p_action not in (''lock'',''unlock'',''reorder'',''replace'',''add'',''delete'',''regenerate'',''confirm'') then',
      '  perform set_config(''app.recommendation_event_action'', p_action, true);' || chr(10)
        || '  if p_action not in (''lock'',''unlock'',''reorder'',''replace'',''add'',''delete'',''regenerate'',''confirm'') then'
    );
    if position('app.recommendation_event_action' in lower(v_definition)) = 0 then
      raise exception 'event action injection failed';
    end if;
  end if;

  if position('app.recommendation_candidate_rank' in lower(v_definition)) = 0 then
    v_definition := replace(
      v_definition,
      '      update public.recommendation_course_steps set current_candidate_id=v_new_step ->> ''candidateId'',',
      '      if p_action = ''replace'' then' || chr(10)
        || '        perform set_config(''app.recommendation_candidate_rank'', case' || chr(10)
        || '          when coalesce(v_response #>> ''{metadata,replacementCandidateRank}'', '''') ~ ''^([1-9]|1[0-5])$''' || chr(10)
        || '            then v_response #>> ''{metadata,replacementCandidateRank}''' || chr(10)
        || '          else ''''' || chr(10)
        || '        end, true);' || chr(10)
        || '      end if;' || chr(10)
        || '      update public.recommendation_course_steps set current_candidate_id=v_new_step ->> ''candidateId'', '
    );
    if position('app.recommendation_candidate_rank' in lower(v_definition)) = 0 then
      raise exception 'candidate rank injection failed';
    end if;
  end if;

  -- A rollback run may regenerate a legacy experiment session with mode=off.
  -- Keep optional prior metadata unless the new server response explicitly
  -- replaces a key, so the assigned arm is never erased.
  v_definition := replace(
    v_definition,
    'metadata = case when v_uses_attestation then v_response -> ''metadata'' else metadata end,',
    'metadata = case when v_uses_attestation then coalesce(metadata, ''{}''::jsonb) || (v_response -> ''metadata'') else metadata end,'
  );
  if position('coalesce(metadata, ''{}''::jsonb) || (v_response -> ''metadata'')' in lower(v_definition)) = 0 then
    raise exception 'metadata preservation injection failed';
  end if;

  if position('candidatelistattestationid' in lower(v_definition)) = 0 then
    v_definition := replace(
      v_definition,
      '  if v_uses_attestation then' || chr(10)
        || '    update public.recommendation_generation_attestations set consumed_at = now()',
      '  if p_action = ''replace'' and nullif(v_request #>> ''{replacement,candidateListAttestationId}'', '''') is not null then' || chr(10)
        || '    update public.recommendation_generation_attestations set consumed_at = now()' || chr(10)
        || '      where request_id = v_request #>> ''{replacement,candidateListAttestationId}''' || chr(10)
        || '        and session_id = p_session_id and owner_user_id = v_owner and consumed_at is null' || chr(10)
        || '        and request_json ->> ''type'' = ''replacement_candidate_list''' || chr(10)
        || '        and request_json ->> ''baseRequestId'' = v_session.request_id;' || chr(10)
        || '    if not found then raise check_violation using message = ''stale''; end if;' || chr(10)
        || '  end if;' || chr(10)
        || '  if v_uses_attestation then' || chr(10)
        || '    update public.recommendation_generation_attestations set consumed_at = now()'
    );
    if position('candidatelistattestationid' in lower(v_definition)) = 0 then
      raise exception 'replacement list attestation injection failed';
    end if;
  end if;

  execute v_definition;
end;
$migration$;

create or replace function public.recommendation_course_step_event_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_action text := current_setting('app.recommendation_event_action', true);
  v_candidate_rank integer := nullif(current_setting('app.recommendation_candidate_rank', true), '')::integer;
begin
  if tg_op = 'insert' and v_action is null and not exists (
    select 1 from public.recommendation_step_events
    where session_id = new.session_id and step_id = new.step_id and event_type = 'initial_recommendation'
  ) then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, 'initial_recommendation', null, new.current_kakao_place_id);
  elsif tg_op = 'insert' and v_action = 'add' then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, 'place_added', null, new.current_kakao_place_id);
  elsif tg_op = 'update' and v_action in ('lock', 'unlock') and old.locked is distinct from new.locked then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, case when new.locked then 'place_locked' else 'place_unlocked' end, old.current_kakao_place_id, new.current_kakao_place_id);
  elsif tg_op = 'update' and v_action = 'replace' and old.current_kakao_place_id is distinct from new.current_kakao_place_id then
    perform public.write_recommendation_step_event(new.session_id, new.step_id, 'place_replaced', old.current_kakao_place_id, new.current_kakao_place_id, v_candidate_rank);
  elsif tg_op = 'delete' and v_action = 'delete' then
    perform public.write_recommendation_step_event(old.session_id, old.step_id, 'place_deleted', old.current_kakao_place_id, null);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists recommendation_course_step_event_audit on public.recommendation_course_steps;
create trigger recommendation_course_step_event_audit after insert or update or delete on public.recommendation_course_steps
  for each row execute function public.recommendation_course_step_event_trigger();

commit;
