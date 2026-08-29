begin;

-- Repair the deployed mutation function without changing the client contract.
-- The previous provider-neutral patch built a text path for #>>, but PostgreSQL
-- only defines jsonb #>> text[]. It also grouped missing Kakao IDs together,
-- which made two valid Naver steps look like a duplicate.
do $repair$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure)
    into v_definition;
  v_before := v_definition;

  if position('v_response #>> array[' in lower(v_definition)) > 0
    and position('where next ->> ''kakaoplaceid'' is not null' in lower(v_definition)) > 0 then
    return;
  end if;

  v_definition := replace(v_definition,
    $old$v_response #>> ('{course,steps,' || (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1) || ',placeIdentity,provider}')$old$,
    $new$v_response #>> ARRAY['course', 'steps', (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1), 'placeIdentity', 'provider']$new$
  );
  v_definition := replace(v_definition,
    $old$v_response #>> ('{course,steps,' || (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1) || ',placeIdentity,providerPlaceId}')$old$,
    $new$v_response #>> ARRAY['course', 'steps', (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1), 'placeIdentity', 'providerPlaceId']$new$
  );
  v_definition := replace(v_definition,
    $$group by next ->> 'kakaoPlaceId' having count(*) > 1$$,
    $$where next ->> 'kakaoPlaceId' is not null
      group by next ->> 'kakaoPlaceId' having count(*) > 1$$
  );

  if v_definition = v_before
    or position('v_response #>> array[' in lower(v_definition)) = 0
    or position('where next ->> ''kakaoplaceid'' is not null' in lower(v_definition)) = 0
    or strpos(lower(v_definition), $bad$v_response #>> ('{course,steps,'$bad$) > 0 then
    raise exception 'recommendation session mutation repair failed';
  end if;

  execute v_definition;
end;
$repair$;

commit;
