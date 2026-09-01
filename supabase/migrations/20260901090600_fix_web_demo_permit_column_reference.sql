begin;

-- The output column permit_id shadows the table column inside PL/pgSQL.
-- Qualify the table reference so the RPC can acquire the first permit.
create or replace function public.acquire_web_demo_permit(
  p_visitor_hash text,
  p_network_hash text,
  p_request_id text,
  p_attempt smallint default 0,
  p_count_visitor boolean default true,
  p_count_network boolean default true,
  p_count_global boolean default true,
  p_visitor_limit integer default 3,
  p_network_limit integer default 30,
  p_global_limit integer default 500,
  p_stale_after_seconds integer default 120,
  p_now timestamptz default now()
)
returns table (
  allowed boolean,
  limit_type text,
  retry_after_seconds integer,
  resets_at timestamptz,
  permit_id uuid,
  owner_token uuid
)
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_visitor_count integer := 0;
  v_network_count integer := 0;
  v_global_count integer := 0;
  v_visitor_window timestamptz := p_now;
  v_network_window timestamptz := p_now;
  v_global_window timestamptz := p_now;
  v_existing_created_at timestamptz;
  v_existing_permit uuid;
  v_permit uuid;
  v_owner uuid;
begin
  if p_visitor_hash is null or p_visitor_hash !~ '^[a-f0-9]{64}$'
    or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$'
    or nullif(btrim(p_request_id), '') is null
    or char_length(p_request_id) > 120
    or p_attempt is null
    or p_count_visitor is null or p_count_network is null or p_count_global is null
    or p_attempt not in (0, 1)
    or p_visitor_limit is null or p_network_limit is null or p_global_limit is null
    or p_visitor_limit < 1 or p_network_limit < 1 or p_global_limit < 1
    or p_stale_after_seconds is null or p_stale_after_seconds < 1
    or p_now is null
    or (p_attempt = 0 and (not p_count_visitor or not p_count_network or not p_count_global))
    or (p_attempt = 1 and (p_count_visitor or p_count_network or not p_count_global)) then
    raise invalid_parameter_value using message = 'invalid_web_demo_permit';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('web-demo:global:recommend', 0));
  perform pg_advisory_xact_lock(hashtextextended('web-demo:visitor:' || p_visitor_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('web-demo:network:' || p_network_hash, 0));

  select permit.permit_id, permit.created_at
    into v_existing_permit, v_existing_created_at
  from public.web_demo_permits as permit
  where permit.visitor_hash = p_visitor_hash;

  if v_existing_permit is not null then
    if v_existing_created_at > p_now - make_interval(secs => p_stale_after_seconds) then
      return query select false, 'already_running',
        greatest(1, ceil(extract(epoch from ((v_existing_created_at + make_interval(secs => p_stale_after_seconds)) - p_now)))::integer),
        null::timestamptz, null::uuid, null::uuid;
      return;
    end if;
    delete from public.web_demo_permits where permit_id = v_existing_permit;
  end if;

  select request_count, window_started_at
    into v_visitor_count, v_visitor_window
  from public.web_demo_usage
  where action = 'recommend' and scope = 'visitor' and scope_key = p_visitor_hash;
  if not found then
    v_visitor_count := 0;
    v_visitor_window := p_now;
  elsif v_visitor_window <= p_now - interval '24 hours' then
    v_visitor_count := 0;
    v_visitor_window := p_now;
  end if;

  select request_count, window_started_at
    into v_network_count, v_network_window
  from public.web_demo_usage
  where action = 'recommend' and scope = 'network' and scope_key = p_network_hash;
  if not found then
    v_network_count := 0;
    v_network_window := p_now;
  elsif v_network_window <= p_now - interval '24 hours' then
    v_network_count := 0;
    v_network_window := p_now;
  end if;

  select request_count, window_started_at
    into v_global_count, v_global_window
  from public.web_demo_usage
  where action = 'recommend' and scope = 'global' and scope_key = 'global';
  if not found then
    v_global_count := 0;
    v_global_window := p_now;
  elsif v_global_window <= p_now - interval '24 hours' then
    v_global_count := 0;
    v_global_window := p_now;
  end if;

  if p_count_visitor and coalesce(v_visitor_count, 0) >= p_visitor_limit then
    return query select false, 'visitor', null::integer, v_visitor_window + interval '24 hours', null::uuid, null::uuid;
    return;
  end if;
  if p_count_network and coalesce(v_network_count, 0) >= p_network_limit then
    return query select false, 'network', null::integer, v_network_window + interval '24 hours', null::uuid, null::uuid;
    return;
  end if;
  if p_count_global and coalesce(v_global_count, 0) >= p_global_limit then
    return query select false, 'global', null::integer, v_global_window + interval '24 hours', null::uuid, null::uuid;
    return;
  end if;

  if p_count_visitor then
    insert into public.web_demo_usage(action, scope, scope_key, window_started_at, request_count, updated_at)
    values ('recommend', 'visitor', p_visitor_hash, v_visitor_window, 1, p_now)
    on conflict (action, scope, scope_key) do update
      set window_started_at = excluded.window_started_at,
          request_count = case
            when public.web_demo_usage.window_started_at <= p_now - interval '24 hours' then 1
            else public.web_demo_usage.request_count + 1
          end,
          updated_at = excluded.updated_at;
  end if;
  if p_count_network then
    insert into public.web_demo_usage(action, scope, scope_key, window_started_at, request_count, updated_at)
    values ('recommend', 'network', p_network_hash, v_network_window, 1, p_now)
    on conflict (action, scope, scope_key) do update
      set window_started_at = excluded.window_started_at,
          request_count = case
            when public.web_demo_usage.window_started_at <= p_now - interval '24 hours' then 1
            else public.web_demo_usage.request_count + 1
          end,
          updated_at = excluded.updated_at;
  end if;
  if p_count_global then
    insert into public.web_demo_usage(action, scope, scope_key, window_started_at, request_count, updated_at)
    values ('recommend', 'global', 'global', v_global_window, 1, p_now)
    on conflict (action, scope, scope_key) do update
      set window_started_at = excluded.window_started_at,
          request_count = case
            when public.web_demo_usage.window_started_at <= p_now - interval '24 hours' then 1
            else public.web_demo_usage.request_count + 1
          end,
          updated_at = excluded.updated_at;
  end if;

  v_permit := gen_random_uuid();
  v_owner := gen_random_uuid();
  insert into public.web_demo_permits(
    permit_id, owner_token, request_id, visitor_hash, network_hash,
    visitor_counted, network_counted, global_counted,
    visitor_window_started_at, network_window_started_at, global_window_started_at, created_at
  ) values (
    v_permit, v_owner, btrim(p_request_id), p_visitor_hash, p_network_hash,
    p_count_visitor, p_count_network, p_count_global,
    case when p_count_visitor then v_visitor_window else null end,
    case when p_count_network then v_network_window else null end,
    v_global_window, p_now
  );

  return query select true, null::text, null::integer, null::timestamptz, v_permit, v_owner;
end;
$$;

commit;
