begin;

-- JSONB object builders keep null-valued optional keys. The app contract uses
-- omitted keys for optional Kakao links, so strip nulls from both mutation
-- response builders before returning Naver steps without a verified link.
do $patch$
declare
  v_definition text;
  v_before text;
  v_old_steps text := $old_steps$
  select coalesce(jsonb_agg(jsonb_build_object(
    'stepId', step_id, 'order', step_order, 'category', category, 'label', label,
    'candidateId', current_candidate_id,
    'kakaoPlaceId', case when current_place_provider = 'naver' then current_kakao_link_place_id else current_kakao_place_id end,
    'placeIdentity', case when current_place_provider is not null then jsonb_build_object('provider', current_place_provider, 'providerPlaceId', current_provider_place_id) end,
    'name', place_name, 'address', address, 'roadAddress', road_address, 'mapUrl', map_url,
    'latitude', latitude, 'longitude', longitude, 'reason', reason, 'locked', locked
  ) order by step_order), '[]'::jsonb) into v_steps$old_steps$;
  v_new_steps text := $new_steps$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'stepId', step_id, 'order', step_order, 'category', category, 'label', label,
    'candidateId', current_candidate_id,
    'kakaoPlaceId', case when current_place_provider = 'naver' then current_kakao_link_place_id else current_kakao_place_id end,
    'placeIdentity', case when current_place_provider is not null then jsonb_build_object('provider', current_place_provider, 'providerPlaceId', current_provider_place_id) end,
    'name', place_name, 'address', address, 'roadAddress', road_address, 'mapUrl', map_url,
    'latitude', latitude, 'longitude', longitude, 'reason', reason, 'locked', locked
  )) order by step_order), '[]'::jsonb) into v_steps$new_steps$;
  v_old_card_steps text := $old_card_steps$
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', label, 'candidateId', current_candidate_id,
    'kakaoPlaceId', case when current_place_provider = 'naver' then current_kakao_link_place_id else current_kakao_place_id end,
    'placeIdentity', case when current_place_provider is not null then jsonb_build_object('provider', current_place_provider, 'providerPlaceId', current_provider_place_id) end,
    'place_name', place_name, 'place_address', nullif(road_address, ''), 'map_url', nullif(map_url, '')
  ) order by step_order), '[]'::jsonb) into v_card_steps$old_card_steps$;
  v_new_card_steps text := $new_card_steps$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'label', label, 'candidateId', current_candidate_id,
    'kakaoPlaceId', case when current_place_provider = 'naver' then current_kakao_link_place_id else current_kakao_place_id end,
    'placeIdentity', case when current_place_provider is not null then jsonb_build_object('provider', current_place_provider, 'providerPlaceId', current_provider_place_id) end,
    'place_name', place_name, 'place_address', nullif(road_address, ''), 'map_url', nullif(map_url, '')
  )) order by step_order), '[]'::jsonb) into v_card_steps$new_card_steps$;
begin
  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure)
    into v_definition;
  v_before := v_definition;

  if position('jsonb_strip_nulls(jsonb_build_object(' in lower(v_definition)) > 0 then
    return;
  end if;

  if position(v_old_steps in v_definition) = 0
    or position(v_old_card_steps in v_definition) = 0 then
    raise exception 'Null optional mutation field migration source shape not found';
  end if;

  v_definition := replace(v_definition, v_old_steps, v_new_steps);
  v_definition := replace(v_definition, v_old_card_steps, v_new_card_steps);

  if v_definition = v_before
    or position(v_old_steps in v_definition) > 0
    or position(v_old_card_steps in v_definition) > 0
    or position('jsonb_strip_nulls(jsonb_build_object(' in lower(v_definition)) = 0 then
    raise exception 'Null optional mutation field migration patch failed';
  end if;

  execute v_definition;
end;
$patch$;

-- The previous repair migration could have materialized a null optional
-- kakaoPlaceId. Rebuild only the derived card steps for affected sessions.
update public.recommendation_sessions rs
   set cards = (
     select coalesce(
       jsonb_agg(
         jsonb_set(
           card,
           '{steps}',
           (
             select coalesce(
               jsonb_agg(
                 jsonb_strip_nulls(jsonb_build_object(
                   'label', cs.label,
                   'candidateId', cs.current_candidate_id,
                   'kakaoPlaceId', case when cs.current_place_provider = 'naver'
                     then cs.current_kakao_link_place_id else cs.current_kakao_place_id end,
                   'placeIdentity', case when cs.current_place_provider is not null then
                     jsonb_build_object('provider', cs.current_place_provider, 'providerPlaceId', cs.current_provider_place_id)
                   end,
                   'place_name', cs.place_name,
                   'place_address', nullif(cs.road_address, ''),
                   'map_url', nullif(cs.map_url, '')
                 )) order by cs.step_order
               ),
               '[]'::jsonb
             )
             from public.recommendation_course_steps cs
             where cs.session_id = rs.id
           )
         )
       ),
       '[]'::jsonb
     )
     from jsonb_array_elements(coalesce(rs.cards, '[]'::jsonb)) card
   )
 where exists (
   select 1
   from public.recommendation_course_steps cs
   where cs.session_id = rs.id
     and cs.current_place_provider = 'naver'
 );

commit;
