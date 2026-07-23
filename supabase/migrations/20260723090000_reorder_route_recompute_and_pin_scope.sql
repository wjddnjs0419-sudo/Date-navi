-- Reorder/delete only rewrote current_course.steps; metadata.route (adjacent
-- distances, total, walking assessment) and course.relaxedConstraints stayed
-- frozen at generation time. The client re-derives adjacent distances from the
-- (now reordered) step coordinates and rejects any snapshot whose stored route
-- disagrees by >0.5m — so for 3+ step courses every reorder committed to the DB
-- and then bricked the session client-side. Recompute the route inside the RPC
-- for step-shape mutations that bypass Edge attestation, and repair sessions
-- already committed in the mismatched state.
--
-- Also narrow the regenerate pin carry-over: a pin only stays meaningful while
-- the step actually sits at the pinned place. When a regeneration moves the
-- step elsewhere (the caller excluded the pinned place to force a change),
-- carrying the old pin forward would make the next AI-path call force the step
-- back to the abandoned place — so the pin is dropped instead.
begin;

create or replace function public.recommendation_route_haversine_meters(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
)
returns double precision
language sql
immutable
as $fn$
  select 2 * 6371000 * asin(sqrt(
    pow(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * pow(sin(radians(lon2 - lon1) / 2), 2)
  ));
$fn$;
revoke all on function public.recommendation_route_haversine_meters(double precision, double precision, double precision, double precision) from public;
revoke all on function public.recommendation_route_haversine_meters(double precision, double precision, double precision, double precision) from anon;
revoke all on function public.recommendation_route_haversine_meters(double precision, double precision, double precision, double precision) from authenticated;

create or replace function public.recompute_recommendation_session_route(p_session_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_adjacent jsonb;
  v_total double precision;
  v_request jsonb;
  v_max_walking_text text;
  v_max_walking numeric;
  v_assessment text;
  v_relaxation jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(d.distance) order by d.rn), '[]'::jsonb), coalesce(sum(d.distance), 0)
    into v_adjacent, v_total
  from (
    select row_number() over (order by s.step_order) as rn,
      public.recommendation_route_haversine_meters(
        lag(s.latitude) over (order by s.step_order),
        lag(s.longitude) over (order by s.step_order),
        s.latitude, s.longitude
      ) as distance
    from public.recommendation_course_steps s
    where s.session_id = p_session_id
  ) d
  where d.distance is not null;

  select coalesce(latest_request, original_request) into v_request
    from public.recommendation_sessions where id = p_session_id;
  if v_request is null then return; end if;
  v_max_walking_text := v_request ->> 'maxWalkingMinutes';
  v_max_walking := nullif(v_max_walking_text, '')::numeric;
  v_assessment := case
    when v_max_walking is null then 'not_requested'
    when exists (
      select 1 from jsonb_array_elements(v_adjacent) dist
      where (dist #>> '{}')::double precision > v_max_walking * 80
    ) then 'provisional_exceeded'
    else 'provisional_within'
  end;
  if v_assessment = 'provisional_exceeded' then
    v_relaxation := jsonb_build_array(jsonb_build_object(
      'constraint', 'maxWalkingMinutes',
      'reason', case when coalesce(v_request ->> 'language', 'ko') = 'ko'
        then v_max_walking_text || '분 기준 직선거리 휴리스틱을 넘는 구간이 있어 이 조건을 완화했어요.'
        else 'One segment exceeds the ' || v_max_walking_text || '-minute straight-line heuristic, so this constraint was relaxed.'
      end
    ));
  end if;

  update public.recommendation_sessions set
    metadata = jsonb_set(jsonb_set(jsonb_set(metadata,
      '{route,adjacentDistanceMeters}', v_adjacent),
      '{route,totalDistanceMeters}', to_jsonb(v_total)),
      '{route,walkingLimitAssessment}', to_jsonb(v_assessment)),
    current_course = jsonb_set(current_course, '{relaxedConstraints}', (
      select coalesce(jsonb_agg(rc), '[]'::jsonb)
      from jsonb_array_elements(coalesce(current_course -> 'relaxedConstraints', '[]'::jsonb)) rc
      where rc ->> 'constraint' <> 'maxWalkingMinutes'
    ) || v_relaxation),
    updated_at = now()
    where id = p_session_id;
end;
$fn$;
revoke all on function public.recompute_recommendation_session_route(text) from public;
revoke all on function public.recompute_recommendation_session_route(text) from anon;
revoke all on function public.recompute_recommendation_session_route(text) from authenticated;

create or replace function public.apply_recommendation_session_mutation(
  p_session_id text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set extra_float_digits = 3
as $$
declare
  v_owner uuid := auth.uid();
  v_session public.recommendation_sessions%rowtype;
  v_attestation public.recommendation_generation_attestations%rowtype;
  v_attestation_request_id text;
  v_uses_attestation boolean := false;
  v_steps jsonb;
  v_step jsonb;
  v_order integer := 0;
  v_ids text[];
  v_target text;
  v_locked boolean;
  v_request jsonb;
  v_response jsonb;
  v_new_step jsonb;
  v_original_candidate text;
  v_original_place text;
  v_current_category text;
  v_current_label text;
  v_card jsonb;
  v_card_id text;
  v_card_steps jsonb;
  v_request_steps jsonb;
  v_locked_steps jsonb;
  v_persisted_locked_steps jsonb;
  v_persisted_pins jsonb;
begin
  if v_owner is null then raise insufficient_privilege using message = 'not authenticated'; end if;
  if p_action not in ('lock','unlock','reorder','replace','add','delete','regenerate','confirm') then
    raise invalid_parameter_value using message = 'operation_failed';
  end if;
  select * into v_session from public.recommendation_sessions
    where id = p_session_id and owner_user_id = v_owner for update;
  if not found then raise no_data_found using message = 'missing'; end if;
  if not exists (select 1 from public.date_planner_profiles p
                 where p.user_id = v_owner and p.couple_id is not distinct from v_session.couple_id) then
    raise insufficient_privilege using message = 'unauthorized_edit';
  end if;
  if v_session.status = 'confirmed' and p_action <> 'confirm' then
    raise check_violation using message = 'confirmed';
  end if;
  -- Regeneration and selection changes consume a one-time Edge attestation.
  -- The client contributes only opaque IDs; all request/response/place facts
  -- below are read from the private server-issued row while both rows are
  -- locked in this transaction.
  if p_action in ('regenerate', 'replace', 'add') then
    v_attestation_request_id := nullif(btrim(p_payload ->> 'attestationRequestId'), '');
    if v_attestation_request_id is null then raise invalid_parameter_value using message = 'invalid_candidate'; end if;
    select * into v_attestation
      from public.recommendation_generation_attestations
      where request_id = v_attestation_request_id
        and session_id = p_session_id
        and owner_user_id = v_owner
        and consumed_at is null
      for update;
    if not found then raise check_violation using message = 'stale'; end if;
    v_request := v_attestation.request_json;
    v_response := v_attestation.response_json;
    if v_request ->> 'requestId' is distinct from v_attestation_request_id
      or v_response ->> 'requestId' is distinct from v_attestation_request_id
      or v_response #>> '{course,requestId}' is distinct from v_attestation_request_id
      or v_response #>> '{course,sessionId}' is distinct from p_session_id
      or v_attestation.request_json ->> 'baseRequestId' is distinct from v_session.request_id
      or jsonb_typeof(v_response #> '{course,steps}') <> 'array'
      or jsonb_array_length(v_response #> '{course,steps}') not between 2 and 4 then
      raise check_violation using message = 'stale';
    end if;
    if jsonb_typeof(coalesce(v_request -> 'lockedSteps', '[]'::jsonb)) <> 'array' then
      raise check_violation using message = 'locked';
    end if;
    -- Every temporary lock must name an exact current tuple. This lets the
    -- server enforce target replacement constraints without accepting forged
    -- or stale lock entries from an attested request.
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_request -> 'lockedSteps', '[]'::jsonb)) requested_lock
      where not exists (
        select 1 from public.recommendation_course_steps current_step
        where current_step.session_id = p_session_id
          and current_step.step_id = requested_lock ->> 'stepId'
          and current_step.current_candidate_id = requested_lock ->> 'candidateId'
          and current_step.current_kakao_place_id = requested_lock ->> 'kakaoPlaceId'
      )
    ) then
      raise check_violation using message = 'locked';
    end if;
    -- Persisted locks are a required subset. Replace/add may also use
    -- temporary request locks to make the server preserve unaffected steps.
    if exists (
      select 1 from public.recommendation_course_steps current_lock
      where current_lock.session_id = p_session_id and current_lock.locked
        and not exists (
          select 1 from jsonb_array_elements(coalesce(v_request -> 'lockedSteps', '[]'::jsonb)) requested_lock
          where requested_lock ->> 'stepId' = current_lock.step_id
            and requested_lock ->> 'candidateId' = current_lock.current_candidate_id
            and requested_lock ->> 'kakaoPlaceId' = current_lock.current_kakao_place_id
        )
    ) or exists (
      select 1 from public.recommendation_course_steps current_lock
      where current_lock.session_id = p_session_id and current_lock.locked
        and not exists (
          select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
          where next ->> 'stepId' = current_lock.step_id
            and next ->> 'candidateId' = current_lock.current_candidate_id
            and next ->> 'kakaoPlaceId' = current_lock.current_kakao_place_id
            and next ->> 'locked' = 'true'
        )
    ) then
      raise check_violation using message = 'locked';
    end if;
    if p_action = 'regenerate' and (
      jsonb_array_length(v_response #> '{course,steps}') <> (
        select count(*) from public.recommendation_course_steps where session_id = p_session_id
      ) or exists (
        select 1 from public.recommendation_course_steps current_step
        where current_step.session_id = p_session_id and not exists (
          select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
          where next ->> 'stepId' = current_step.step_id
            and next ->> 'category' = current_step.category
            and next ->> 'label' = current_step.label
            and (next ->> 'order')::smallint = current_step.step_order
        )
      ) or exists (
        select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
        where not exists (
          select 1 from public.recommendation_course_steps current_step
          where current_step.session_id = p_session_id
            and current_step.step_id = next ->> 'stepId'
            and current_step.category = next ->> 'category'
            and current_step.label = next ->> 'label'
            and current_step.step_order = (next ->> 'order')::smallint
        )
      )
    ) then
      raise check_violation using message = 'constraint_violation';
    end if;
    v_uses_attestation := true;
  end if;
  if p_action = 'confirm' then
    if v_session.status = 'confirmed' then return public.get_recommendation_session(p_session_id); end if;
    if (select count(*) from public.recommendation_course_steps where session_id = p_session_id) not between 2 and 4 then
      raise check_violation using message = 'min_steps';
    end if;
    if v_session.couple_id is null then raise check_violation using message = 'constraint_violation'; end if;
    v_card := v_session.cards -> 0;
    if jsonb_typeof(v_card) <> 'object' then raise check_violation using message = 'constraint_violation'; end if;
    v_card_id := gen_random_uuid()::text;
    insert into public.date_cards (
      id, couple_id, created_by, mode, input_json, source, title, summary,
      estimated_time, estimated_budget, tags, why_recommended, steps, content_i18n,
      recommendation_request_id, recommendation_session_id
    ) values (
      v_card_id, v_session.couple_id, v_owner, 'make_course',
      coalesce(v_session.latest_request, v_session.original_request), 'ai',
      coalesce(v_card ->> 'title', 'Date course'), coalesce(v_card ->> 'summary', ''),
      coalesce(v_card ->> 'estimated_time', ''), coalesce(v_card ->> 'estimated_budget', ''),
      coalesce(array(select jsonb_array_elements_text(v_card -> 'tags')), '{}'::text[]),
      coalesce(v_card ->> 'why_recommended', ''), coalesce(v_card -> 'steps', '[]'::jsonb),
      case when jsonb_typeof(v_card -> 'i18n') = 'object' then v_card -> 'i18n' else null end,
      v_session.request_id, p_session_id
    );
    update public.recommendation_sessions set status = 'confirmed', confirmed_card_id = v_card_id, updated_at = now() where id = p_session_id;
    return public.get_recommendation_session(p_session_id);
  end if;

  if p_action in ('lock','unlock') then
    v_target := nullif(btrim(p_payload ->> 'stepId'), '');
    if v_target is null then raise invalid_parameter_value using message = 'missing'; end if;
    update public.recommendation_course_steps set locked = (p_action = 'lock'), updated_at = now()
      where session_id = p_session_id and step_id = v_target;
    if not found then raise no_data_found using message = 'missing'; end if;
  elsif p_action = 'reorder' then
    if jsonb_typeof(p_payload -> 'stepIds') <> 'array' then raise invalid_parameter_value using message = 'invalid_order'; end if;
    select array_agg(value #>> '{}') into v_ids from jsonb_array_elements(p_payload -> 'stepIds');
    if cardinality(v_ids) <> (select count(*) from public.recommendation_course_steps where session_id = p_session_id)
      or (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids)
      or exists (select 1 from public.recommendation_course_steps where session_id = p_session_id and step_id <> all(v_ids)) then
      raise invalid_parameter_value using message = 'invalid_order';
    end if;
    for v_order in 1..cardinality(v_ids) loop
      update public.recommendation_course_steps set step_order = v_order, updated_at = now()
        where session_id = p_session_id and step_id = v_ids[v_order];
    end loop;
  elsif p_action = 'delete' then
    v_target := nullif(btrim(p_payload ->> 'stepId'), '');
    select locked into v_locked from public.recommendation_course_steps where session_id = p_session_id and step_id = v_target;
    if not found then raise no_data_found using message = 'missing'; end if;
    if v_locked then raise check_violation using message = 'locked'; end if;
    if (select count(*) from public.recommendation_course_steps where session_id = p_session_id) <= 2 then raise check_violation using message = 'min_steps'; end if;
    delete from public.recommendation_course_steps where session_id = p_session_id and step_id = v_target;
    v_order := 0;
    update public.recommendation_course_steps s set step_order = ordered.next_order, updated_at = now()
      from (select step_id, row_number() over(order by step_order)::smallint as next_order
            from public.recommendation_course_steps where session_id = p_session_id) ordered
      where s.session_id = p_session_id and s.step_id = ordered.step_id;
  elsif p_action = 'regenerate' then
    -- v_request/v_response came exclusively from the locked attestation.
    select coalesce(jsonb_agg(jsonb_build_object(
      'stepId', step_id, 'candidateId', current_candidate_id, 'kakaoPlaceId', current_kakao_place_id
    )), '[]'::jsonb) into v_persisted_locked_steps
    from public.recommendation_course_steps where session_id = p_session_id and locked;
    -- A pin is a standing per-step designation, not tied to any one selection
    -- call — capture it by stepId before the wipe so a regenerated (but still
    -- present) step keeps forcing its user-designated place afterward.
    select coalesce(jsonb_agg(jsonb_build_object(
      'stepId', step_id, 'pinnedKakaoPlaceId', pinned_kakao_place_id, 'pinnedName', pinned_name
    )) filter (where pinned_kakao_place_id is not null), '[]'::jsonb) into v_persisted_pins
    from public.recommendation_course_steps where session_id = p_session_id;
    if exists (
      select 1 from public.recommendation_course_steps old
      where old.session_id = p_session_id and old.locked
      and not exists (
        select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
        where next ->> 'stepId' = old.step_id
          and next ->> 'candidateId' = old.current_candidate_id
          and next ->> 'kakaoPlaceId' = old.current_kakao_place_id
      )
    ) then raise check_violation using message = 'locked'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
      group by next ->> 'stepId' having count(*) > 1
    ) or exists (
      select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
      group by next ->> 'candidateId' having count(*) > 1
    ) or exists (
      select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
      group by next ->> 'kakaoPlaceId' having count(*) > 1
    ) then raise check_violation using message = 'duplicate'; end if;
    delete from public.recommendation_course_steps where session_id = p_session_id;
    for v_new_step in select value from jsonb_array_elements(v_response #> '{course,steps}') loop
      insert into public.recommendation_course_steps (
        session_id, step_id, step_order, category, label,
        original_candidate_id, original_kakao_place_id, current_candidate_id, current_kakao_place_id,
        place_name, address, road_address, map_url, latitude, longitude, reason, locked,
        pinned_kakao_place_id, pinned_name
      ) values (
        p_session_id, v_new_step ->> 'stepId', (v_new_step ->> 'order')::smallint,
        v_new_step ->> 'category', v_new_step ->> 'label',
        v_new_step ->> 'candidateId', v_new_step ->> 'kakaoPlaceId',
        v_new_step ->> 'candidateId', v_new_step ->> 'kakaoPlaceId',
        v_new_step ->> 'name', coalesce(v_new_step ->> 'address',''), coalesce(v_new_step ->> 'roadAddress',''),
        coalesce(v_new_step ->> 'mapUrl',''), (v_new_step ->> 'latitude')::double precision,
        (v_new_step ->> 'longitude')::double precision, v_new_step ->> 'reason',
        exists (
          select 1 from jsonb_array_elements(v_persisted_locked_steps) persisted_lock
          where persisted_lock ->> 'stepId' = v_new_step ->> 'stepId'
            and persisted_lock ->> 'candidateId' = v_new_step ->> 'candidateId'
            and persisted_lock ->> 'kakaoPlaceId' = v_new_step ->> 'kakaoPlaceId'
        ),
        (select p ->> 'pinnedKakaoPlaceId' from jsonb_array_elements(v_persisted_pins) p
          where p ->> 'stepId' = v_new_step ->> 'stepId'
            and p ->> 'pinnedKakaoPlaceId' = v_new_step ->> 'kakaoPlaceId' limit 1),
        (select p ->> 'pinnedName' from jsonb_array_elements(v_persisted_pins) p
          where p ->> 'stepId' = v_new_step ->> 'stepId'
            and p ->> 'pinnedKakaoPlaceId' = v_new_step ->> 'kakaoPlaceId' limit 1)
      );
    end loop;
  elsif p_action in ('replace', 'add') then
    -- Candidate identity is the only selection data accepted from the client.
    -- Facts, category, label, coordinates, address, and reason are copied from
    -- the Edge-validated attestation response.
    select candidate into v_new_step
    from jsonb_array_elements(v_response #> '{course,steps}') candidate
    where candidate ->> 'candidateId' = nullif(btrim(p_payload ->> 'candidateId'), '')
      and candidate ->> 'kakaoPlaceId' = nullif(btrim(p_payload ->> 'kakaoPlaceId'), '')
    limit 1;
    if v_new_step is null then
      raise invalid_parameter_value using message = 'invalid_candidate';
    end if;
    if p_action = 'add' then
      if (select count(*) from public.recommendation_course_steps where session_id = p_session_id) >= 4 then raise check_violation using message = 'max_steps'; end if;
      if jsonb_typeof(v_request -> 'courseSteps') <> 'array'
        or jsonb_array_length(v_request -> 'courseSteps') <> (
          select count(*) + 1 from public.recommendation_course_steps where session_id = p_session_id
        ) or jsonb_array_length(v_response #> '{course,steps}') <> (
          select count(*) + 1 from public.recommendation_course_steps where session_id = p_session_id
        ) or exists (
          select 1 from public.recommendation_course_steps current_step
          where current_step.session_id = p_session_id and not exists (
            select 1 from jsonb_array_elements(v_request -> 'courseSteps')
              with ordinality requested_step(value, ordinality)
            where requested_step.value ->> 'id' = current_step.step_id
              and requested_step.value ->> 'category' = current_step.category
              and requested_step.value ->> 'label' = current_step.label
              and requested_step.ordinality = current_step.step_order
          )
        ) or exists (
          select 1 from public.recommendation_course_steps current_step
          where current_step.session_id = p_session_id and not exists (
            select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
            where next ->> 'stepId' = current_step.step_id
              and next ->> 'category' = current_step.category
              and next ->> 'label' = current_step.label
              and next ->> 'candidateId' = current_step.current_candidate_id
              and next ->> 'kakaoPlaceId' = current_step.current_kakao_place_id
              and (next ->> 'locked')::boolean is not distinct from current_step.locked
              and (next ->> 'order')::smallint = current_step.step_order
          )
        ) or exists (
          select 1 from jsonb_array_elements(v_request -> 'courseSteps') new_step
          where not exists (
            select 1 from public.recommendation_course_steps current_step
            where current_step.session_id = p_session_id and current_step.step_id = new_step ->> 'id'
          ) and new_step ->> 'category' <> 'ai_decide'
        ) or not exists (
          select 1 from jsonb_array_elements(v_request -> 'courseSteps') new_step
          where new_step ->> 'id' = v_new_step ->> 'stepId'
            and new_step ->> 'category' = v_new_step ->> 'category'
            and new_step ->> 'label' = v_new_step ->> 'label'
            and new_step ->> 'category' = 'ai_decide'
        ) or (v_new_step ->> 'order')::smallint <> (
          select count(*) + 1 from public.recommendation_course_steps where session_id = p_session_id
        ) then
        raise check_violation using message = 'constraint_violation';
      end if;
      if exists (select 1 from public.recommendation_course_steps where session_id = p_session_id
                 and (step_id = v_new_step ->> 'stepId' or current_candidate_id = v_new_step ->> 'candidateId' or current_kakao_place_id = v_new_step ->> 'kakaoPlaceId')) then raise check_violation using message = 'duplicate'; end if;
      insert into public.recommendation_course_steps (session_id,step_id,step_order,category,label,original_candidate_id,original_kakao_place_id,current_candidate_id,current_kakao_place_id,place_name,address,road_address,map_url,latitude,longitude,reason,locked,pinned_kakao_place_id,pinned_name)
      values (p_session_id,v_new_step ->> 'stepId',(select count(*) + 1 from public.recommendation_course_steps where session_id=p_session_id),v_new_step ->> 'category',v_new_step ->> 'label',v_new_step ->> 'candidateId',v_new_step ->> 'kakaoPlaceId',v_new_step ->> 'candidateId',v_new_step ->> 'kakaoPlaceId',v_new_step ->> 'name',coalesce(v_new_step ->> 'address',''),coalesce(v_new_step ->> 'roadAddress',''),coalesce(v_new_step ->> 'mapUrl',''),(v_new_step ->> 'latitude')::double precision,(v_new_step ->> 'longitude')::double precision,v_new_step ->> 'reason',false,null,null);
    else
      v_target := nullif(btrim(p_payload ->> 'stepId'),'');
      select locked, current_candidate_id, current_kakao_place_id, category, label
        into v_locked, v_original_candidate, v_original_place, v_current_category, v_current_label
        from public.recommendation_course_steps where session_id=p_session_id and step_id=v_target;
      if not found then raise no_data_found using message = 'missing'; end if;
      if v_locked then raise check_violation using message = 'locked'; end if;
      if jsonb_typeof(v_request -> 'courseSteps') <> 'array'
        or jsonb_array_length(v_request -> 'courseSteps') <> (
          select count(*) from public.recommendation_course_steps where session_id = p_session_id
        ) or exists (
          select 1 from public.recommendation_course_steps current_step
          where current_step.session_id = p_session_id and not exists (
            select 1 from jsonb_array_elements(v_request -> 'courseSteps')
              with ordinality requested_step(value, ordinality)
            where requested_step.value ->> 'id' = current_step.step_id
              and requested_step.value ->> 'category' = current_step.category
              and requested_step.value ->> 'label' = current_step.label
              and requested_step.ordinality = current_step.step_order
          )
        ) or jsonb_array_length(v_response #> '{course,steps}') <> (
        select count(*) from public.recommendation_course_steps where session_id = p_session_id
      ) or v_new_step ->> 'stepId' is distinct from v_target
        or v_new_step ->> 'category' is distinct from v_current_category
        or v_new_step ->> 'label' is distinct from v_current_label
        or (v_new_step ->> 'order')::smallint is distinct from (
          select step_order from public.recommendation_course_steps
          where session_id = p_session_id and step_id = v_target
        )
        or v_original_place is not distinct from v_new_step ->> 'kakaoPlaceId'
        or exists (
          select 1 from public.recommendation_course_steps current_step
          where current_step.session_id = p_session_id and current_step.step_id <> v_target
            and not exists (
              select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
              where next ->> 'stepId' = current_step.step_id
                and next ->> 'category' = current_step.category
                and next ->> 'label' = current_step.label
                and next ->> 'candidateId' = current_step.current_candidate_id
                and next ->> 'kakaoPlaceId' = current_step.current_kakao_place_id
                and (next ->> 'locked')::boolean is not distinct from current_step.locked
                and (next ->> 'order')::smallint = current_step.step_order
            )
        ) then
        raise check_violation using message = 'constraint_violation';
      end if;
      if exists (select 1 from public.recommendation_course_steps where session_id=p_session_id and step_id<>v_target and (current_candidate_id=v_new_step ->> 'candidateId' or current_kakao_place_id=v_new_step ->> 'kakaoPlaceId')) then raise check_violation using message = 'duplicate'; end if;
      update public.recommendation_course_steps set current_candidate_id=v_new_step ->> 'candidateId', current_kakao_place_id=v_new_step ->> 'kakaoPlaceId', place_name=v_new_step ->> 'name', address=coalesce(v_new_step ->> 'address',''), road_address=coalesce(v_new_step ->> 'roadAddress',''), map_url=coalesce(v_new_step ->> 'mapUrl',''), latitude=(v_new_step ->> 'latitude')::double precision, longitude=(v_new_step ->> 'longitude')::double precision, reason=v_new_step ->> 'reason', pinned_kakao_place_id=null, pinned_name=null, updated_at=now() where session_id=p_session_id and step_id=v_target;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'stepId', step_id, 'order', step_order, 'category', category, 'label', label,
    'candidateId', current_candidate_id, 'kakaoPlaceId', current_kakao_place_id,
    'name', place_name, 'address', address, 'roadAddress', road_address, 'mapUrl', map_url,
    'latitude', latitude, 'longitude', longitude, 'reason', reason, 'locked', locked
  ) order by step_order), '[]'::jsonb) into v_steps
  from public.recommendation_course_steps where session_id = p_session_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', label, 'candidateId', current_candidate_id, 'kakaoPlaceId', current_kakao_place_id,
    'place_name', place_name, 'place_address', nullif(road_address, ''), 'map_url', nullif(map_url, '')
  ) order by step_order), '[]'::jsonb) into v_card_steps
  from public.recommendation_course_steps where session_id = p_session_id;
  select coalesce(jsonb_agg(
    case when pinned_kakao_place_id is not null
      then jsonb_build_object(
        'id', step_id, 'category', category, 'label', label,
        'pinnedKakaoPlaceId', pinned_kakao_place_id, 'pinnedName', pinned_name
      )
      else jsonb_build_object('id', step_id, 'category', category, 'label', label)
    end order by step_order
  ), '[]'::jsonb)
    into v_request_steps from public.recommendation_course_steps where session_id = p_session_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'stepId', step_id, 'candidateId', current_candidate_id, 'kakaoPlaceId', current_kakao_place_id,
    'name', place_name, 'address', address, 'roadAddress', road_address, 'mapUrl', map_url,
    'latitude', latitude, 'longitude', longitude
  ) order by step_order), '[]'::jsonb)
    into v_locked_steps from public.recommendation_course_steps where session_id = p_session_id and locked;
  update public.recommendation_sessions set
    request_id = case when v_uses_attestation then v_attestation_request_id else request_id end,
    current_course = jsonb_set(
      case when v_uses_attestation then v_response -> 'course' else current_course end,
      '{steps}', v_steps
    ),
    cards = (select coalesce(jsonb_agg(jsonb_set(card, '{steps}', v_card_steps)), '[]'::jsonb)
             from jsonb_array_elements(case when v_uses_attestation then v_response -> 'cards' else cards end) card),
    metadata = case when v_uses_attestation then v_response -> 'metadata' else metadata end,
    candidate_pool = case when v_uses_attestation then v_response #> '{course,steps}' else candidate_pool end,
    latest_request = case when jsonb_array_length(v_locked_steps) = 0
      then jsonb_set(coalesce(v_request, latest_request, original_request), '{courseSteps}', v_request_steps) - 'lockedSteps' - 'replacement'
      else jsonb_set(
        jsonb_set(coalesce(v_request, latest_request, original_request), '{courseSteps}', v_request_steps),
        '{lockedSteps}', v_locked_steps
      ) - 'replacement'
    end,
    updated_at = now()
    where id = p_session_id;
  if v_uses_attestation then
    update public.recommendation_generation_attestations set consumed_at = now()
      where request_id = v_attestation_request_id and consumed_at is null;
  end if;
  if p_action in ('reorder', 'delete') then
    perform public.recompute_recommendation_session_route(p_session_id);
  end if;
  return public.get_recommendation_session(p_session_id);
end;
$$;

revoke all on function public.apply_recommendation_session_mutation(text, text, jsonb) from public;
grant execute on function public.apply_recommendation_session_mutation(text, text, jsonb) to authenticated;

-- Repair sessions whose stored route no longer matches their (reordered) steps.
-- Recomputing is idempotent for consistent sessions, so sweep them all.
do $repair$
declare
  r record;
begin
  for r in
    select s.id from public.recommendation_sessions s
    where exists (select 1 from public.recommendation_course_steps c where c.session_id = s.id)
  loop
    perform public.recompute_recommendation_session_route(r.id);
  end loop;
end;
$repair$;

commit;
