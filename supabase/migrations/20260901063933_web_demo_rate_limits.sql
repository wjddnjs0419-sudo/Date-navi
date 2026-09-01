begin;

-- Loginless demo counters contain only HMAC-derived identifiers. The rows are
-- deliberately inaccessible to browser roles; Edge Functions call the RPCs
-- through the service-role client after validating the internal token.
create table if not exists public.web_demo_usage (
  action text not null check (action in ('recommend', 'location_search')),
  scope text not null check (scope in ('visitor', 'network', 'global')),
  scope_key text not null check (char_length(scope_key) between 1 and 64),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (action, scope, scope_key)
);

create table if not exists public.web_demo_permits (
  permit_id uuid primary key default gen_random_uuid(),
  owner_token uuid not null,
  request_id text not null check (char_length(btrim(request_id)) between 1 and 120),
  visitor_hash text not null check (visitor_hash ~ '^[a-f0-9]{64}$'),
  network_hash text not null check (network_hash ~ '^[a-f0-9]{64}$'),
  visitor_counted boolean not null,
  network_counted boolean not null,
  global_counted boolean not null default true,
  visitor_window_started_at timestamptz,
  network_window_started_at timestamptz,
  global_window_started_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists web_demo_permits_visitor_created_idx
  on public.web_demo_permits(visitor_hash, created_at);

alter table public.web_demo_usage enable row level security;
alter table public.web_demo_permits enable row level security;
revoke all on public.web_demo_usage from public, anon, authenticated;
revoke all on public.web_demo_permits from public, anon, authenticated;
grant all on public.web_demo_usage to service_role;
grant all on public.web_demo_permits to service_role;

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

  -- Every caller takes the same locks in the same order. This serializes
  -- counter updates and the one-active-recommendation lease per visitor.
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
    -- The caller holding the visitor advisory lock owns this stale takeover.
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

create or replace function public.finish_web_demo_permit(
  p_permit_id uuid,
  p_owner_token uuid,
  p_outcome text,
  p_now timestamptz default now()
)
returns table (released boolean)
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_permit public.web_demo_permits%rowtype;
begin
  if p_outcome is null or p_now is null or p_outcome not in ('success', 'failure') then
    raise invalid_parameter_value using message = 'invalid_web_demo_outcome';
  end if;

  select * into v_permit
  from public.web_demo_permits
  where permit_id = p_permit_id and owner_token = p_owner_token;
  if not found then
    return query select false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('web-demo:global:recommend', 0));
  perform pg_advisory_xact_lock(hashtextextended('web-demo:visitor:' || v_permit.visitor_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('web-demo:network:' || v_permit.network_hash, 0));

  delete from public.web_demo_permits
  where permit_id = p_permit_id and owner_token = p_owner_token;
  if not found then
    return query select false;
    return;
  end if;

  if p_outcome = 'failure' then
    if v_permit.visitor_counted then
      update public.web_demo_usage
      set request_count = request_count - 1, updated_at = p_now
      where action = 'recommend' and scope = 'visitor' and scope_key = v_permit.visitor_hash
        and window_started_at = v_permit.visitor_window_started_at and request_count > 0;
    end if;
    if v_permit.network_counted then
      update public.web_demo_usage
      set request_count = request_count - 1, updated_at = p_now
      where action = 'recommend' and scope = 'network' and scope_key = v_permit.network_hash
        and window_started_at = v_permit.network_window_started_at and request_count > 0;
    end if;
    if v_permit.global_counted then
      update public.web_demo_usage
      set request_count = request_count - 1, updated_at = p_now
      where action = 'recommend' and scope = 'global' and scope_key = 'global'
        and window_started_at = v_permit.global_window_started_at and request_count > 0;
    end if;
  end if;

  return query select true;
end;
$$;

create or replace function public.consume_web_demo_location_quota(
  p_visitor_hash text,
  p_network_hash text,
  p_visitor_limit integer default 60,
  p_network_limit integer default 300,
  p_global_limit integer default 3000,
  p_now timestamptz default now()
)
returns table (
  allowed boolean,
  limit_type text,
  retry_after_seconds integer,
  resets_at timestamptz
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
begin
  if p_visitor_hash is null or p_visitor_hash !~ '^[a-f0-9]{64}$'
    or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$'
    or p_visitor_limit is null or p_network_limit is null or p_global_limit is null
    or p_visitor_limit < 1 or p_network_limit < 1 or p_global_limit < 1
    or p_now is null then
    raise invalid_parameter_value using message = 'invalid_web_demo_location_quota';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('web-demo:global:location_search', 0));
  perform pg_advisory_xact_lock(hashtextextended('web-demo:visitor:location_search:' || p_visitor_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('web-demo:network:location_search:' || p_network_hash, 0));

  select request_count, window_started_at into v_visitor_count, v_visitor_window
  from public.web_demo_usage
  where action = 'location_search' and scope = 'visitor' and scope_key = p_visitor_hash;
  if not found then
    v_visitor_count := 0; v_visitor_window := p_now;
  elsif v_visitor_window <= p_now - interval '24 hours' then
    v_visitor_count := 0; v_visitor_window := p_now;
  end if;
  select request_count, window_started_at into v_network_count, v_network_window
  from public.web_demo_usage
  where action = 'location_search' and scope = 'network' and scope_key = p_network_hash;
  if not found then
    v_network_count := 0; v_network_window := p_now;
  elsif v_network_window <= p_now - interval '24 hours' then
    v_network_count := 0; v_network_window := p_now;
  end if;
  select request_count, window_started_at into v_global_count, v_global_window
  from public.web_demo_usage
  where action = 'location_search' and scope = 'global' and scope_key = 'global';
  if not found then
    v_global_count := 0; v_global_window := p_now;
  elsif v_global_window <= p_now - interval '24 hours' then
    v_global_count := 0; v_global_window := p_now;
  end if;

  if coalesce(v_visitor_count, 0) >= p_visitor_limit then
    return query select false, 'visitor', null::integer, v_visitor_window + interval '24 hours';
    return;
  end if;
  if coalesce(v_network_count, 0) >= p_network_limit then
    return query select false, 'network', null::integer, v_network_window + interval '24 hours';
    return;
  end if;
  if coalesce(v_global_count, 0) >= p_global_limit then
    return query select false, 'global', null::integer, v_global_window + interval '24 hours';
    return;
  end if;

  insert into public.web_demo_usage(action, scope, scope_key, window_started_at, request_count, updated_at)
  values
    ('location_search', 'visitor', p_visitor_hash, v_visitor_window, 1, p_now),
    ('location_search', 'network', p_network_hash, v_network_window, 1, p_now),
    ('location_search', 'global', 'global', v_global_window, 1, p_now)
  on conflict (action, scope, scope_key) do update
    set window_started_at = excluded.window_started_at,
        request_count = case
          when public.web_demo_usage.window_started_at <= p_now - interval '24 hours' then 1
          else public.web_demo_usage.request_count + 1
        end,
        updated_at = excluded.updated_at;

  return query select true, null::text, null::integer, null::timestamptz;
end;
$$;

revoke all on function public.acquire_web_demo_permit(text,text,text,smallint,boolean,boolean,boolean,integer,integer,integer,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.finish_web_demo_permit(uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.consume_web_demo_location_quota(text,text,integer,integer,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.acquire_web_demo_permit(text,text,text,smallint,boolean,boolean,boolean,integer,integer,integer,integer,timestamptz) to service_role;
grant execute on function public.finish_web_demo_permit(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.consume_web_demo_location_quota(text,text,integer,integer,integer,timestamptz) to service_role;

commit;
