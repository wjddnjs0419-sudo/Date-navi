begin;

-- The provider-neutral mutation patch must preserve the provider tuple during
-- non-attested edits such as lock, unlock, reorder, and delete. Only an
-- attested regenerate/replace/add response is allowed to replace that tuple.
-- It must also keep lockedSteps out of latest_request; the per-step locked
-- column is the authoritative state and the abbreviated JSON shape is not a
-- valid RecommendationRequest.
do $patch$
declare
  v_definition text;
  v_before text;
  v_latest_request_marker text := $marker$latest_request = jsonb_set(coalesce(v_request, latest_request, original_request), '{coursesteps}', v_request_steps) - 'lockedsteps' - 'replacement'$marker$;
begin
  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure)
    into v_definition;
  v_before := v_definition;

  if position(v_latest_request_marker in lower(v_definition)) = 0 then
    v_definition := replace(v_definition,
      $$latest_request = case when jsonb_array_length(v_locked_steps) = 0
      then jsonb_set(coalesce(v_request, latest_request, original_request), '{courseSteps}', v_request_steps) - 'lockedSteps' - 'replacement'
      else jsonb_set(
        jsonb_set(coalesce(v_request, latest_request, original_request), '{courseSteps}', v_request_steps),
        '{lockedSteps}', v_locked_steps
      ) - 'replacement'
    end,$$,
      $$latest_request = jsonb_set(coalesce(v_request, latest_request, original_request), '{courseSteps}', v_request_steps) - 'lockedSteps' - 'replacement',$$
    );
  end if;

  if position('set current_place_provider = case when v_uses_attestation then' in lower(v_definition)) = 0 then
    v_definition := replace(v_definition,
      $$  update public.recommendation_course_steps current_step
     set current_place_provider = nullif(v_response #>> ('{course,steps,' || (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1) || ',placeIdentity,provider}'), ''),
         current_provider_place_id = nullif(v_response #>> ('{course,steps,' || (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1) || ',placeIdentity,providerPlaceId}'), '')
     where current_step.session_id = p_session_id;$$,
      $$  update public.recommendation_course_steps current_step
     set current_place_provider = case when v_uses_attestation then nullif(v_response #>> ('{course,steps,' || (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1) || ',placeIdentity,provider}'), '') else current_step.current_place_provider end,
         current_provider_place_id = case when v_uses_attestation then nullif(v_response #>> ('{course,steps,' || (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1) || ',placeIdentity,providerPlaceId}'), '') else current_step.current_provider_place_id end
     where current_step.session_id = p_session_id;$$
    );
  end if;

  if v_definition = v_before
    or position(v_latest_request_marker in lower(v_definition)) = 0
    or position('set current_place_provider = case when v_uses_attestation then' in lower(v_definition)) = 0 then
    raise exception 'provider-neutral mutation state patch failed';
  end if;
  execute v_definition;
end;
$patch$;

-- Repair sessions that were already touched by the buggy function before this
-- migration. Their per-step locked column remains authoritative.
update public.recommendation_sessions
set latest_request = latest_request - 'lockedSteps'
where latest_request ? 'lockedSteps';

commit;
