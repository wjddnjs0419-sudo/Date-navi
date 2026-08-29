begin;

-- The mutation RPC rebuilds card steps from recommendation_course_steps. A
-- Naver course has no current_kakao_place_id, so cards must carry the same
-- provider-scoped identity as current_course.steps; otherwise the client
-- response validator rejects every post-mutation hydrate.
do $patch$
declare
  v_definition text;
  v_before text;
  v_old_card_identity text := $old_card_identity$
    'kakaoPlaceId', case when current_place_provider = 'naver' then current_kakao_link_place_id else current_kakao_place_id end,
    'place_name', place_name$old_card_identity$;
  v_new_card_identity text := $new_card_identity$
    'kakaoPlaceId', case when current_place_provider = 'naver' then current_kakao_link_place_id else current_kakao_place_id end,
    'placeIdentity', case when current_place_provider is not null then jsonb_build_object('provider', current_place_provider, 'providerPlaceId', current_provider_place_id) end,
    'place_name', place_name$new_card_identity$;
begin
  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure)
    into v_definition;
  v_before := v_definition;

  if position(lower(v_new_card_identity) in lower(v_definition)) > 0 then
    return;
  end if;

  if position(v_old_card_identity in v_definition) = 0 then
    raise exception 'Mutation card identity migration source shape not found';
  end if;

  v_definition := replace(v_definition, v_old_card_identity, v_new_card_identity);

  if v_definition = v_before
    or position(lower(v_old_card_identity) in lower(v_definition)) > 0
    or position(lower(v_new_card_identity) in lower(v_definition)) = 0 then
    raise exception 'Mutation card identity migration patch failed';
  end if;

  execute v_definition;
end;
$patch$;

commit;
