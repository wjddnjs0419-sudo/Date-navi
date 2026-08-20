-- Firebase is the full analytics source of truth. This table is an
-- authenticated-user mirror only; anonymous clients receive no insert grant.
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics_events
  alter column user_id set default auth.uid(),
  alter column params set default '{}'::jsonb,
  alter column created_at set default now();

update public.analytics_events
  set params = '{}'::jsonb
  where params is null;
update public.analytics_events
  set created_at = now()
  where created_at is null;

alter table public.analytics_events
  alter column params set not null,
  alter column created_at set not null;

alter table public.analytics_events enable row level security;

revoke all on table public.analytics_events from anon;
revoke all on table public.analytics_events from authenticated;
grant insert on table public.analytics_events to authenticated;

drop policy if exists "Users can insert own events" on public.analytics_events;
drop policy if exists analytics_events_authenticated_insert on public.analytics_events;
create policy analytics_events_authenticated_insert
  on public.analytics_events
  for insert
  to authenticated
  with check (auth.uid() is not null and user_id = auth.uid());

create index if not exists analytics_events_event_name_idx
  on public.analytics_events (event_name);
create index if not exists analytics_events_user_id_idx
  on public.analytics_events (user_id);
create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);
