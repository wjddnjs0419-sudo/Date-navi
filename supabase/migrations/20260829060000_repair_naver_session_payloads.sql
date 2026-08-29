begin;

-- Repair sessions that were mutated before the response/card and route
-- invariants were fixed. This only rebuilds derived card-step identity fields
-- and route metadata from recommendation_course_steps; place facts and order
-- remain authoritative in the step rows.
do $repair$
declare
  v_session_id text;
begin
  for v_session_id in
    select rs.id
    from public.recommendation_sessions rs
    where exists (
      select 1
      from public.recommendation_course_steps cs
      where cs.session_id = rs.id
        and cs.current_place_provider = 'naver'
    )
  loop
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
                     jsonb_build_object(
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
                     ) order by cs.step_order
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
     where rs.id = v_session_id;

    perform public.recompute_recommendation_session_route(v_session_id);
  end loop;
end;
$repair$;

commit;
