begin;

-- A session's couple identity is derived by the RPC.  Direct owner writes are
-- still supported for later editing phases, but cannot claim another couple.
drop policy if exists "recommendation_sessions_owner_insert" on public.recommendation_sessions;
drop policy if exists "recommendation_sessions_owner_update" on public.recommendation_sessions;
create policy "recommendation_sessions_owner_insert"
  on public.recommendation_sessions for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and exists (
      select 1
      from public.date_planner_profiles p
      where p.user_id = auth.uid()
        and p.couple_id is not distinct from public.recommendation_sessions.couple_id
    )
  );
create policy "recommendation_sessions_owner_update"
  on public.recommendation_sessions for update to authenticated
  using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid()
    and exists (
      select 1
      from public.date_planner_profiles p
      where p.user_id = auth.uid()
        and p.couple_id is not distinct from public.recommendation_sessions.couple_id
    )
  );

-- The first migration used a SELECT-then-INSERT retry check.  Serialize the
-- identity check per session so concurrent retries return the existing draft.
create or replace function public.persist_recommendation_session(
  p_request jsonb,
  p_response jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_couple_id text;
  v_request_id text := nullif(btrim(p_response ->> 'requestId'), '');
  v_session_id text := nullif(btrim(p_response #>> '{course,sessionId}'), '');
  v_existing_session_id text;
  v_existing_request_id text;
  v_steps jsonb := p_response #> '{course,steps}';
  v_step jsonb;
begin
  if v_owner_user_id is null then
    raise insufficient_privilege using message = 'not authenticated';
  end if;
  if jsonb_typeof(p_request) <> 'object' or jsonb_typeof(p_response) <> 'object' then
    raise invalid_parameter_value using message = 'request and response must be JSON objects';
  end if;
  if v_request_id is null or v_session_id is null
    or p_request ->> 'requestId' is distinct from v_request_id
    or p_response #>> '{course,requestId}' is distinct from v_request_id then
    raise invalid_parameter_value using message = 'request/session identity mismatch';
  end if;
  if jsonb_typeof(v_steps) <> 'array' or jsonb_array_length(v_steps) not between 2 and 4
    or jsonb_typeof(p_response -> 'cards') <> 'array'
    or jsonb_array_length(p_response -> 'cards') < 1
    or jsonb_typeof(p_response -> 'metadata') <> 'object' then
    raise invalid_parameter_value using message = 'malformed recommendation response';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_session_id, 0));

  select s.id, s.request_id
  into v_existing_session_id, v_existing_request_id
  from public.recommendation_sessions s
  where s.owner_user_id = v_owner_user_id
    and (s.id = v_session_id or s.request_id = v_request_id)
  limit 1;

  if v_existing_session_id is not null then
    if v_existing_session_id = v_session_id and v_existing_request_id = v_request_id then
      return public.get_recommendation_session(v_existing_session_id);
    end if;
    raise unique_violation using message = 'recommendation identity is already in use';
  end if;

  select p.couple_id
  into v_couple_id
  from public.date_planner_profiles p
  where p.user_id = v_owner_user_id;

  insert into public.recommendation_sessions (
    id, request_id, owner_user_id, couple_id, original_request,
    current_course, cards, metadata, status
  ) values (
    v_session_id, v_request_id, v_owner_user_id, v_couple_id, p_request,
    p_response -> 'course', p_response -> 'cards', p_response -> 'metadata', 'draft'
  );

  for v_step in
    select value from jsonb_array_elements(v_steps)
  loop
    insert into public.recommendation_course_steps (
      session_id, step_id, step_order, category, label,
      original_candidate_id, original_kakao_place_id,
      current_candidate_id, current_kakao_place_id,
      place_name, address, road_address, map_url,
      latitude, longitude, reason, locked
    ) values (
      v_session_id,
      v_step ->> 'stepId',
      (v_step ->> 'order')::smallint,
      v_step ->> 'category',
      v_step ->> 'label',
      v_step ->> 'candidateId',
      v_step ->> 'kakaoPlaceId',
      v_step ->> 'candidateId',
      v_step ->> 'kakaoPlaceId',
      v_step ->> 'name',
      coalesce(v_step ->> 'address', ''),
      coalesce(v_step ->> 'roadAddress', ''),
      coalesce(v_step ->> 'mapUrl', ''),
      (v_step ->> 'latitude')::double precision,
      (v_step ->> 'longitude')::double precision,
      v_step ->> 'reason',
      coalesce((v_step ->> 'locked')::boolean, false)
    );
  end loop;

  return public.get_recommendation_session(v_session_id);
end;
$$;

commit;
