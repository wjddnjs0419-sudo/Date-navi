begin;

-- The provider tuple is the canonical mutation identity. Kakao ID remains an
-- optional link for Naver-owned places and a legacy field for old sessions.
create or replace function public.recommendation_place_identity_matches(
  p_provider text,
  p_provider_place_id text,
  p_value jsonb
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_provider is not distinct from coalesce(
    nullif(btrim(p_value #>> '{placeIdentity,provider}'), ''),
    case when nullif(btrim(p_value ->> 'kakaoPlaceId'), '') is not null then 'kakao' end
  )
  and p_provider_place_id is not distinct from coalesce(
    nullif(btrim(p_value #>> '{placeIdentity,providerPlaceId}'), ''),
    nullif(btrim(p_value ->> 'kakaoPlaceId'), '')
  );
$$;

-- Patch the already deployed attested mutation function in place. The guards
-- below abort the migration if the expected source contract is not present;
-- this prevents a partial or silent patch after a future RPC rewrite.
do $patch$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure)
    into v_definition;
  v_before := v_definition;

  v_definition := replace(v_definition,
    $$and current_step.current_kakao_place_id = requested_lock ->> 'kakaoPlaceId'$$,
    $$and public.recommendation_place_identity_matches(current_step.current_place_provider, current_step.current_provider_place_id, requested_lock)$$
  );
  v_definition := replace(v_definition,
    $$and requested_lock ->> 'kakaoPlaceId' = current_lock.current_kakao_place_id$$,
    $$and public.recommendation_place_identity_matches(current_lock.current_place_provider, current_lock.current_provider_place_id, requested_lock)$$
  );
  v_definition := replace(v_definition,
    $$and next ->> 'kakaoPlaceId' = current_lock.current_kakao_place_id$$,
    $$and public.recommendation_place_identity_matches(current_lock.current_place_provider, current_lock.current_provider_place_id, next)$$
  );
  v_definition := replace(v_definition,
    $$and next ->> 'kakaoPlaceId' = old.current_kakao_place_id$$,
    $$and public.recommendation_place_identity_matches(old.current_place_provider, old.current_provider_place_id, next)$$
  );
  v_definition := replace(v_definition,
    $$and next ->> 'kakaoPlaceId' = current_step.current_kakao_place_id$$,
    $$and public.recommendation_place_identity_matches(current_step.current_place_provider, current_step.current_provider_place_id, next)$$
  );

  -- Candidate facts still come only from the server attestation. The client
  -- needs to provide no Kakao ID for a Naver candidate.
  v_definition := replace(v_definition,
    $$and candidate ->> 'kakaoPlaceId' = nullif(btrim(p_payload ->> 'kakaoPlaceId'), '')$$,
    $$and candidate ->> 'candidateId' = candidate ->> 'candidateId'$$
  );

  -- After the existing insert/update branches, copy the provider tuple from
  -- the attested response into the current step rows. The provider sync
  -- trigger keeps legacy Kakao columns consistent and clears them for Naver.
  v_definition := replace(v_definition,
    $$  select coalesce(jsonb_agg(jsonb_build_object(
    'stepId', step_id, 'order', step_order, 'category', category, 'label', label,$$,
    $$  update public.recommendation_course_steps current_step
     set current_place_provider = nullif(v_response #>> ('{course,steps,' || (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1) || ',placeIdentity,provider}'), ''),
         current_provider_place_id = nullif(v_response #>> ('{course,steps,' || (select (ordinality - 1)::text from jsonb_array_elements(v_response #> '{course,steps}') with ordinality response_step where response_step.value ->> 'stepId' = current_step.step_id limit 1) || ',placeIdentity,providerPlaceId}'), '')
     where current_step.session_id = p_session_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'stepId', step_id, 'order', step_order, 'category', category, 'label', label,$$
  );

  v_definition := replace(v_definition,
    $$'candidateId', current_candidate_id, 'kakaoPlaceId', current_kakao_place_id,
    'name', place_name$$,
    $$'candidateId', current_candidate_id, 'kakaoPlaceId', current_kakao_place_id,
    'placeIdentity', case when current_place_provider is not null then jsonb_build_object('provider', current_place_provider, 'providerPlaceId', current_provider_place_id) end,
    'name', place_name$$
  );

  if v_definition = v_before
    or position('recommendation_place_identity_matches' in lower(v_definition)) = 0
    or position('current_place_provider = nullif' in lower(v_definition)) = 0
    or position('placeidentity' in lower(v_definition)) = 0 then
    raise exception 'provider-neutral mutation injection failed';
  end if;
  execute v_definition;
end;
$patch$;

comment on function public.recommendation_place_identity_matches(text,text,jsonb) is
  'Compares an attested provider-scoped place identity, with Kakao ID fallback for legacy payloads.';

commit;
