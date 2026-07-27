-- Full ranked candidate snapshots are immutable analysis baselines. Existing course-step
-- candidate_pool rows remain legacy data; only new attested sessions use this format.
begin;

create or replace function public.validate_candidate_pool_snapshot(p_pool jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare v_item jsonb;
begin
  if jsonb_typeof(p_pool) <> 'array' or jsonb_array_length(p_pool) not between 2 and 40 then return false; end if;
  if (select count(*) from jsonb_array_elements(p_pool)) <> (select count(distinct value ->> 'candidateId') from jsonb_array_elements(p_pool))
    or (select count(*) from jsonb_array_elements(p_pool)) <> (select count(distinct value ->> 'kakaoPlaceId') from jsonb_array_elements(p_pool))
    or (select count(*) from jsonb_array_elements(p_pool)) <> (select count(distinct value ->> 'rank') from jsonb_array_elements(p_pool)) then return false; end if;
  for v_item in select value from jsonb_array_elements(p_pool) loop
    if jsonb_typeof(v_item) <> 'object'
      or nullif(btrim(v_item ->> 'candidateId'), '') is null
      or nullif(btrim(v_item ->> 'kakaoPlaceId'), '') is null
      or nullif(btrim(v_item ->> 'category'), '') is null
      or jsonb_typeof(v_item -> 'rank') is distinct from 'number' or (v_item ->> 'rank') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_item -> 'totalScore') is distinct from 'number'
      or jsonb_typeof(v_item -> 'scoreBreakdown') is distinct from 'object'
      or not ((v_item -> 'scoreBreakdown') ?& array['intent','distance','budget','preference','routeFit','diversity','behavior','penalty'])
      or exists (select 1 from jsonb_each(v_item -> 'scoreBreakdown') where key <> all(array['intent','distance','budget','preference','routeFit','diversity','behavior','penalty','categoryRecall']) or jsonb_typeof(value) <> 'number')
      or jsonb_typeof(v_item -> 'distanceFromSearchCenterMeters') is distinct from 'number' or (v_item ->> 'distanceFromSearchCenterMeters')::numeric < 0
      or jsonb_typeof(v_item -> 'priceAtRanking') is distinct from 'object'
      or coalesce(v_item -> 'priceAtRanking' ->> 'source', '') not in ('observed','estimated','unknown')
      or jsonb_typeof(v_item -> 'priceAtRanking' -> 'minKRW') is distinct from 'number' and jsonb_typeof(v_item -> 'priceAtRanking' -> 'minKRW') is distinct from 'null'
      or jsonb_typeof(v_item -> 'priceAtRanking' -> 'maxKRW') is distinct from 'number' and jsonb_typeof(v_item -> 'priceAtRanking' -> 'maxKRW') is distinct from 'null'
      or exists (select 1 from jsonb_each(v_item -> 'priceAtRanking') where key <> all(array['source','minKRW','maxKRW']))
      or jsonb_typeof(v_item -> 'selectedInitially') is distinct from 'boolean'
      or jsonb_typeof(v_item -> 'forced') is distinct from 'boolean'
      or jsonb_typeof(v_item -> 'pinned') is distinct from 'boolean'
      or jsonb_typeof(v_item -> 'reintroducedByHistory') is distinct from 'boolean'
      or abs((v_item ->> 'totalScore')::numeric - (select sum(value::text::numeric) from jsonb_each(v_item -> 'scoreBreakdown'))) > 0.000001 then return false;
    end if;
  end loop;
  return not exists (
    select 1 from jsonb_array_elements(p_pool) with ordinality as elements(value, ordinal)
    where (value ->> 'rank')::integer <> ordinal
  );
end;
$$;
revoke all on function public.validate_candidate_pool_snapshot(jsonb) from public, anon, authenticated;

create or replace function public.persist_recommendation_session(p_request_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid := auth.uid(); v_attestation public.recommendation_generation_attestations%rowtype; v_couple_id text; v_request jsonb; v_response jsonb; v_session_id text; v_step jsonb; v_pool jsonb;
begin
  if v_owner is null then raise insufficient_privilege using message = 'not authenticated'; end if;
  if nullif(btrim(p_request_id), '') is null then raise invalid_parameter_value using message = 'invalid_candidate'; end if;
  select * into v_attestation from public.recommendation_generation_attestations where request_id = p_request_id and owner_user_id = v_owner for update;
  if not found then raise no_data_found using message = 'invalid_candidate'; end if;
  v_request := v_attestation.request_json; v_response := v_attestation.response_json; v_pool := v_response -> 'candidatePool'; v_session_id := nullif(btrim(v_response #>> '{course,sessionId}'), '');
  if v_attestation.session_id <> p_request_id or v_request ->> 'requestId' is distinct from p_request_id or v_response ->> 'requestId' is distinct from p_request_id
    or v_response #>> '{course,requestId}' is distinct from p_request_id or v_session_id is distinct from p_request_id or v_request ? 'baseRequestId'
    or jsonb_typeof(v_response #> '{course,steps}') <> 'array' or jsonb_array_length(v_response #> '{course,steps}') not between 2 and 4
    or jsonb_typeof(v_response -> 'cards') <> 'array' or jsonb_array_length(v_response -> 'cards') < 1 or jsonb_typeof(v_response -> 'metadata') <> 'object'
    or not public.validate_candidate_pool_snapshot(v_pool) then raise invalid_parameter_value using message = 'invalid_candidate'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_session_id, 0));
  if exists (select 1 from public.recommendation_sessions s where s.id = v_session_id and s.owner_user_id = v_owner and s.request_id = p_request_id) then return public.get_recommendation_session(v_session_id); end if;
  if v_attestation.consumed_at is not null then raise check_violation using message = 'stale'; end if;
  if exists (select 1 from public.recommendation_sessions s where s.id = v_session_id or s.request_id = p_request_id) then raise unique_violation using message = 'stale'; end if;
  if not exists (select 1 from public.date_planner_profiles p where p.user_id = v_owner) then raise insufficient_privilege using message = 'unauthorized_edit'; end if;
  select p.couple_id into v_couple_id from public.date_planner_profiles p where p.user_id = v_owner;
  insert into public.recommendation_sessions (id, request_id, original_request_id, owner_user_id, couple_id, original_request, latest_request, current_course, cards, metadata, candidate_pool, status)
  values (v_session_id, p_request_id, p_request_id, v_owner, v_couple_id, v_request, v_request, v_response -> 'course', v_response -> 'cards', v_response -> 'metadata', v_response -> 'candidatePool', 'draft');
  for v_step in select value from jsonb_array_elements(v_response #> '{course,steps}') loop
    insert into public.recommendation_course_steps (session_id, step_id, step_order, category, label, original_candidate_id, original_kakao_place_id, current_candidate_id, current_kakao_place_id, place_name, address, road_address, map_url, latitude, longitude, reason, locked)
    values (v_session_id, v_step ->> 'stepId', (v_step ->> 'order')::smallint, v_step ->> 'category', v_step ->> 'label', v_step ->> 'candidateId', v_step ->> 'kakaoPlaceId', v_step ->> 'candidateId', v_step ->> 'kakaoPlaceId', v_step ->> 'name', coalesce(v_step ->> 'address', ''), coalesce(v_step ->> 'roadAddress', ''), coalesce(v_step ->> 'mapUrl', ''), (v_step ->> 'latitude')::double precision, (v_step ->> 'longitude')::double precision, v_step ->> 'reason', coalesce((v_step ->> 'locked')::boolean, false));
  end loop;
  update public.recommendation_generation_attestations set consumed_at = now() where request_id = p_request_id and consumed_at is null;
  return public.get_recommendation_session(v_session_id);
end;
$$;

do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure) into v_definition;
  if position('candidate_pool = candidate_pool,' in lower(v_definition)) = 0 then
    v_definition := replace(v_definition, 'candidate_pool = case when v_uses_attestation then v_response #> ''{course,steps}'' else candidate_pool end,', 'candidate_pool = candidate_pool,');
    execute v_definition;
  end if;
  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure) into v_definition;
  if position('candidate_pool = candidate_pool,' in lower(v_definition)) = 0 then raise exception 'candidate pool immutability injection failed'; end if;
end;
$$;

commit;
