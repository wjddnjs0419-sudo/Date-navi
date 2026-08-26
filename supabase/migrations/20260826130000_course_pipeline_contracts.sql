begin;

-- Provider-neutral discovery can return 50 candidates. The attestation validator
-- must accept the same bound as the Edge response schema and ranking pipeline.
create or replace function public.validate_candidate_pool_snapshot(p_pool jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare v_item jsonb; v_provider text; v_place_id text;
begin
  if jsonb_typeof(p_pool) <> 'array' or jsonb_array_length(p_pool) not between 2 and 50 then return false; end if;
  if (select count(*) from jsonb_array_elements(p_pool)) <> (select count(distinct value ->> 'candidateId') from jsonb_array_elements(p_pool)) then return false; end if;
  for v_item in select value from jsonb_array_elements(p_pool) loop
    v_provider := coalesce(v_item #>> '{placeIdentity,provider}', case when nullif(btrim(v_item ->> 'kakaoPlaceId'), '') is not null then 'kakao' end);
    v_place_id := coalesce(v_item #>> '{placeIdentity,providerPlaceId}', nullif(btrim(v_item ->> 'kakaoPlaceId'), ''));
    if jsonb_typeof(v_item) <> 'object' or nullif(btrim(v_item ->> 'candidateId'), '') is null
      or v_provider not in ('kakao','naver') or v_place_id is null
      or jsonb_typeof(v_item -> 'rank') <> 'number' or jsonb_typeof(v_item -> 'scoreBreakdown') <> 'object'
      or jsonb_typeof(v_item -> 'priceAtRanking') <> 'object' then return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.validate_candidate_pool_snapshot(jsonb) from public, anon, authenticated;

-- A confirmed recommendation is still an unsaved draft card. The client can
-- promote it to active only when the user explicitly saves or sends it.
alter table public.date_cards drop constraint if exists date_cards_status_check;
alter table public.date_cards add constraint date_cards_status_check
  check (status in ('active', 'confirmed', 'done', 'archived', 'draft'));

-- Keep confirmation atomic: the card created by the confirmation RPC starts as
-- draft, so there is no active-card window and no second client-side status
-- mutation that can fail after the session has already been confirmed.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure)
    into v_definition;
  if position('recommendation_session_id, status' in lower(v_definition)) = 0 then
    v_definition := replace(
      v_definition,
      'recommendation_request_id, recommendation_session_id',
      'recommendation_request_id, recommendation_session_id, status'
    );
    v_definition := replace(
      v_definition,
      'v_session.request_id, p_session_id',
      'v_session.request_id, p_session_id, ''draft'''
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.apply_recommendation_session_mutation(text,text,jsonb)'::regprocedure)
    into v_definition;
  if position('recommendation_session_id, status' in lower(v_definition)) = 0
    or position('v_session.request_id, p_session_id, ''draft''' in lower(v_definition)) = 0 then
    raise exception 'confirmation draft injection failed';
  end if;
end;
$$;

-- The quota row is a reservation while the Edge function validates and stages
-- the result. This overload returns the exact consumption row so an internal
-- validation/attestation failure can return the reservation without guessing
-- which request to refund. The old signature remains for older callers.
create or replace function public.consume_ai_quota(
  p_user_id uuid, p_action text, p_request_id text, p_now timestamptz default now()
)
returns table (
  allowed boolean,
  limit_type text,
  retry_after_seconds integer,
  resets_at timestamptz,
  consumption_id bigint
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_burst_limit constant integer := 3;
  v_daily_limit constant integer := 20;
  v_daily_start timestamptz := ((p_now at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul');
  v_burst_count integer := 0;
  v_daily_count integer := 0;
  v_oldest_consumption timestamptz;
  v_consumption_id bigint;
begin
  if p_action <> 'course_generate' or nullif(btrim(p_request_id), '') is null then
    raise invalid_parameter_value using message = 'invalid_ai_quota';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_action, 0));
  delete from public.ai_quota_consumptions
  where user_id = p_user_id and action = p_action
    and consumed_at <= p_now - interval '5 minutes';

  select count(*)::integer, min(consumed_at)
  into v_burst_count, v_oldest_consumption
  from public.ai_quota_consumptions
  where user_id = p_user_id and action = p_action;
  select used_count into v_daily_count from public.ai_quota_buckets
  where user_id = p_user_id and action = p_action and bucket_type = 'daily' and bucket_start = v_daily_start;
  v_daily_count := coalesce(v_daily_count, 0);

  if v_burst_count >= v_burst_limit then
    return query select false, 'burst', greatest(1, ceil(extract(epoch from ((v_oldest_consumption + interval '5 minutes') - p_now)))::integer), null::timestamptz, null::bigint;
    return;
  end if;
  if v_daily_count >= v_daily_limit then
    return query select false, 'daily', null::integer, v_daily_start + interval '1 day', null::bigint;
    return;
  end if;

  insert into public.ai_quota_consumptions(user_id, action, consumed_at)
  values (p_user_id, p_action, p_now)
  returning id into v_consumption_id;
  insert into public.ai_quota_buckets(user_id, action, bucket_type, bucket_start, used_count, updated_at)
  values (p_user_id, p_action, 'daily', v_daily_start, 1, p_now)
  on conflict (user_id, action, bucket_type, bucket_start) do update
  set used_count = public.ai_quota_buckets.used_count + 1, updated_at = excluded.updated_at;

  return query select true, null::text, null::integer, null::timestamptz, v_consumption_id;
end;
$$;

create or replace function public.release_ai_quota(
  p_user_id uuid, p_action text, p_consumption_id bigint
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_consumed_at timestamptz;
  v_daily_start timestamptz;
begin
  if p_action <> 'course_generate' or p_consumption_id is null or p_consumption_id < 1 then
    raise invalid_parameter_value using message = 'invalid_ai_quota';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_action, 0));
  select consumed_at into v_consumed_at
  from public.ai_quota_consumptions
  where id = p_consumption_id and user_id = p_user_id and action = p_action
  for update;
  if not found then return; end if;

  delete from public.ai_quota_consumptions where id = p_consumption_id;
  v_daily_start := ((v_consumed_at at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul');
  update public.ai_quota_buckets
  set used_count = greatest(0, used_count - 1), updated_at = now()
  where user_id = p_user_id and action = p_action
    and bucket_type = 'daily' and bucket_start = v_daily_start;
end;
$$;

revoke all on function public.consume_ai_quota(uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.release_ai_quota(uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid,text,text,timestamptz) to service_role;
grant execute on function public.release_ai_quota(uuid,text,bigint) to service_role;

commit;
