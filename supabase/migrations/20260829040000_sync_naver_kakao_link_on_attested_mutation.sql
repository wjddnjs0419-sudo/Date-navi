begin;

-- Requires the response serializer patch from 20260829030000. This keeps the
-- optional Naver Kakao link in row state when an attested response replaces it.
do $patch$
declare
  v_definition text;
  v_before text;
  v_old_sync text := $old_sync$
  update public.recommendation_course_steps current_step
     set current_place_provider = case when v_uses_attestation then nullif(v_response #>> ARRAY['course', 'steps', (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1), 'placeIdentity', 'provider'], '') else current_step.current_place_provider end,
         current_provider_place_id = case when v_uses_attestation then nullif(v_response #>> ARRAY['course', 'steps', (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1), 'placeIdentity', 'providerPlaceId'], '') else current_step.current_provider_place_id end
     where current_step.session_id = p_session_id;
$old_sync$;
  v_new_sync text := $new_sync$
  update public.recommendation_course_steps current_step
     set current_place_provider = case when v_uses_attestation then nullif(v_response #>> ARRAY['course', 'steps', (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1), 'placeIdentity', 'provider'], '') else current_step.current_place_provider end,
         current_provider_place_id = case when v_uses_attestation then nullif(v_response #>> ARRAY['course', 'steps', (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1), 'placeIdentity', 'providerPlaceId'], '') else current_step.current_provider_place_id end,
         current_kakao_link_place_id = case
           when v_uses_attestation
             and nullif(v_response #>> ARRAY['course', 'steps', (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1), 'placeIdentity', 'provider'], '') = 'naver'
             then nullif(v_response #>> ARRAY['course', 'steps', (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1), 'kakaoPlaceId'], '')
           when v_uses_attestation then null
           else current_step.current_kakao_link_place_id
         end
     where current_step.session_id = p_session_id;
$new_sync$;
begin
  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure)
    into v_definition;
  v_before := v_definition;

  if position('current_kakao_link_place_id = case' in lower(v_definition)) > 0 then
    return;
  end if;

  if position('case when current_place_provider = ''naver'' then current_kakao_link_place_id else current_kakao_place_id end' in lower(v_definition)) = 0 then
    raise exception 'Naver link state migration prerequisite missing';
  end if;
  if position(v_old_sync in v_definition) = 0 then
    raise exception 'Naver link state migration source shape not found';
  end if;

  v_definition := replace(v_definition, v_old_sync, v_new_sync);

  if v_definition = v_before
    or position(v_old_sync in v_definition) > 0
    or position('current_kakao_link_place_id = case' in lower(v_definition)) = 0
    or position('when v_uses_attestation then null' in lower(v_definition)) = 0
    or position('else current_step.current_kakao_link_place_id' in lower(v_definition)) = 0 then
    raise exception 'Naver link state migration patch failed';
  end if;

  execute v_definition;
end;
$patch$;

commit;
