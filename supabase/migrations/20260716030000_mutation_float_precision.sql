-- apply_recommendation_session_mutation rebuilds current_course.steps from the double-precision
-- coordinate columns via jsonb_build_object. Without extra_float_digits=3 that serialization
-- rounds coordinates to ~15 significant figures, while get_recommendation_session reads the same
-- columns at extra_float_digits=3 (full precision, migration 20260716000100). The client's strict
-- row-vs-course coordinate equality (mapRecommendationSessionPayload) then rejects any step whose
-- coordinate needs 16+ significant figures, so every edit after a mutation fails with "malformed".
-- Pin the mutation RPC to extra_float_digits=3 so its rebuild matches the read path, and repair
-- current_course coordinates already persisted at reduced precision.
alter function public.apply_recommendation_session_mutation(text, text, jsonb) set extra_float_digits = 3;

set local extra_float_digits = 3;
update public.recommendation_sessions s
  set current_course = jsonb_set(
    s.current_course,
    '{steps}',
    (
      select jsonb_agg(
        step || jsonb_build_object('latitude', to_jsonb(cs.latitude), 'longitude', to_jsonb(cs.longitude))
        order by (step ->> 'order')::int
      )
      from jsonb_array_elements(s.current_course -> 'steps') step
      join public.recommendation_course_steps cs
        on cs.session_id = s.id and cs.step_id = step ->> 'stepId'
    )
  )
  where jsonb_typeof(s.current_course -> 'steps') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(s.current_course -> 'steps') step
      join public.recommendation_course_steps cs
        on cs.session_id = s.id and cs.step_id = step ->> 'stepId'
      where to_jsonb(cs.latitude)::text is distinct from (step -> 'latitude')::text
        or to_jsonb(cs.longitude)::text is distinct from (step -> 'longitude')::text
    );
