begin;

-- A verified Kakao link is display metadata for a Naver-owned place. Keeping
-- it separate prevents legacy mutation/ledger code from treating it as the
-- place's stable identity.
alter table public.recommendation_course_steps
  add column if not exists current_kakao_link_place_id text check (current_kakao_link_place_id is null or length(btrim(current_kakao_link_place_id)) > 0);

create or replace function public.persist_recommendation_session(p_request_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid := auth.uid(); v_attestation public.recommendation_generation_attestations%rowtype; v_couple_id text; v_request jsonb; v_response jsonb; v_session_id text; v_step jsonb; v_provider text; v_provider_place_id text; v_kakao_link_place_id text;
begin
  if v_owner is null then raise insufficient_privilege using message = 'not authenticated'; end if;
  select * into v_attestation from public.recommendation_generation_attestations where request_id = p_request_id and owner_user_id = v_owner for update;
  if not found then raise no_data_found using message = 'invalid_candidate'; end if;
  v_request := v_attestation.request_json; v_response := v_attestation.response_json; v_session_id := nullif(btrim(v_response #>> '{course,sessionId}'), '');
  if v_attestation.session_id <> p_request_id or v_request ->> 'requestId' is distinct from p_request_id or v_response ->> 'requestId' is distinct from p_request_id or v_session_id is distinct from p_request_id or v_request ? 'baseRequestId' or not public.validate_candidate_pool_snapshot(v_response -> 'candidatePool') then raise invalid_parameter_value using message = 'invalid_candidate'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_session_id, 0));
  if exists (select 1 from public.recommendation_sessions where id = v_session_id and owner_user_id = v_owner and request_id = p_request_id) then return public.get_recommendation_session(v_session_id); end if;
  if v_attestation.consumed_at is not null then raise check_violation using message = 'stale'; end if;
  select couple_id into v_couple_id from public.date_planner_profiles where user_id = v_owner;
  insert into public.recommendation_sessions (id,request_id,original_request_id,owner_user_id,couple_id,original_request,latest_request,current_course,cards,metadata,candidate_pool,status) values (v_session_id,p_request_id,p_request_id,v_owner,v_couple_id,v_request,v_request,v_response->'course',v_response->'cards',v_response->'metadata',v_response->'candidatePool','draft');
  for v_step in select value from jsonb_array_elements(v_response #> '{course,steps}') loop
    v_provider := coalesce(v_step #>> '{placeIdentity,provider}', case when v_step ? 'kakaoPlaceId' then 'kakao' end); v_provider_place_id := coalesce(v_step #>> '{placeIdentity,providerPlaceId}',v_step->>'kakaoPlaceId'); v_kakao_link_place_id := case when v_provider='naver' then nullif(btrim(v_step->>'kakaoPlaceId'),'') end;
    if v_provider not in ('kakao','naver') or nullif(btrim(v_provider_place_id),'') is null then raise invalid_parameter_value using message = 'invalid_candidate'; end if;
    insert into public.recommendation_course_steps (session_id,step_id,step_order,category,label,original_candidate_id,original_kakao_place_id,original_place_provider,original_provider_place_id,current_candidate_id,current_kakao_place_id,current_kakao_link_place_id,current_place_provider,current_provider_place_id,place_name,address,road_address,map_url,latitude,longitude,reason,locked) values (v_session_id,v_step->>'stepId',(v_step->>'order')::smallint,v_step->>'category',v_step->>'label',v_step->>'candidateId',case when v_provider='kakao' then v_provider_place_id end,v_provider,v_provider_place_id,v_step->>'candidateId',case when v_provider='kakao' then v_provider_place_id end,v_kakao_link_place_id,v_provider,v_provider_place_id,v_step->>'name',coalesce(v_step->>'address',''),coalesce(v_step->>'roadAddress',''),coalesce(v_step->>'mapUrl',''),(v_step->>'latitude')::double precision,(v_step->>'longitude')::double precision,v_step->>'reason',coalesce((v_step->>'locked')::boolean,false));
  end loop;
  update public.recommendation_generation_attestations set consumed_at = now() where request_id = p_request_id and consumed_at is null;
  return public.get_recommendation_session(v_session_id);
end;
$$;
commit;
