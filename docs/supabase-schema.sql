-- Date Planner Supabase schema
-- Run this in Supabase Dashboard > SQL Editor.
-- This script is safe to run again.

create table if not exists public.date_planner_profiles (
  id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  couple_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.date_planner_couples (
  id text primary key,
  code text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  partner_user_id uuid references auth.users(id) on delete set null,
  status text not null check (status in ('waiting', 'linked')),
  created_at timestamptz not null default now(),
  linked_at timestamptz
);

alter table public.date_planner_profiles
  drop constraint if exists date_planner_profiles_couple_id_fkey;

alter table public.date_planner_profiles
  add constraint date_planner_profiles_couple_id_fkey
  foreign key (couple_id) references public.date_planner_couples(id) on delete set null;

create table if not exists public.date_planner_proposals (
  id text primary key,
  couple_id text not null references public.date_planner_couples(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  proposed_date date not null,
  proposed_time time not null,
  location_area text not null,
  category text not null check (category in ('meal', 'movie', 'walk', 'cafe', 'activity', 'custom')),
  details text not null default '',
  status text not null check (status in ('pending', 'accepted', 'declined')),
  selected_option_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.date_planner_options (
  id text primary key,
  proposal_id text not null references public.date_planner_proposals(id) on delete cascade,
  label text not null,
  place_name text not null,
  address text not null default '',
  description text not null default '',
  estimated_cost text not null default '',
  external_url text not null default '',
  image_url text not null default '',
  partner_preference text not null check (partner_preference in ('liked', 'neutral', 'not_interested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.date_planner_proposals
  drop constraint if exists date_planner_proposals_selected_option_id_fkey;

alter table public.date_planner_proposals
  add constraint date_planner_proposals_selected_option_id_fkey
  foreign key (selected_option_id) references public.date_planner_options(id) on delete set null;

create table if not exists public.date_planner_comments (
  id text primary key,
  option_id text not null references public.date_planner_options(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  type text not null check (type in ('comment', 'request_change')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.date_planner_ai_requests (
  id text primary key,
  couple_id text not null references public.date_planner_couples(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  result_json jsonb,
  status text not null check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.date_planner_profiles enable row level security;
alter table public.date_planner_couples enable row level security;
alter table public.date_planner_proposals enable row level security;
alter table public.date_planner_options enable row level security;
alter table public.date_planner_comments enable row level security;
alter table public.date_planner_ai_requests enable row level security;

create or replace function public.is_couple_member(target_couple_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.date_planner_couples c
    where c.id = target_couple_id
      and (c.owner_user_id = auth.uid() or c.partner_user_id = auth.uid())
  );
$$;

create or replace function public.disconnect_date_planner_couple()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_couple public.date_planner_couples%rowtype;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select c.*
    into v_couple
  from public.date_planner_profiles p
  join public.date_planner_couples c on c.id = p.couple_id
  where p.user_id = v_user
    and (c.owner_user_id = v_user or c.partner_user_id = v_user)
  limit 1;

  if not found then
    return;
  end if;

  update public.date_planner_profiles
  set couple_id = null,
      updated_at = now()
  where couple_id = v_couple.id
    and user_id in (v_couple.owner_user_id, v_couple.partner_user_id);

  update public.date_planner_couples
  set partner_user_id = null,
      status = 'waiting',
      linked_at = null
  where id = v_couple.id;
end;
$$;

revoke all on function public.disconnect_date_planner_couple() from public;
grant execute on function public.disconnect_date_planner_couple() to authenticated;

create or replace function public.set_date_planner_couple_anniversary(p_anniversary_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_couple_id text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select couple_id
    into v_couple_id
  from public.date_planner_profiles
  where user_id = v_user;

  if v_couple_id is null then
    update public.date_planner_profiles
    set anniversary_date = p_anniversary_date,
        updated_at = now()
    where user_id = v_user;
    return;
  end if;

  if not public.is_couple_member(v_couple_id) then
    raise exception 'not a couple member';
  end if;

  update public.date_planner_profiles
  set anniversary_date = p_anniversary_date,
      updated_at = now()
  where couple_id = v_couple_id;
end;
$$;

revoke all on function public.set_date_planner_couple_anniversary(date) from public;
grant execute on function public.set_date_planner_couple_anniversary(date) to authenticated;

drop policy if exists "profiles_select_self" on public.date_planner_profiles;
drop policy if exists "profiles_insert_self" on public.date_planner_profiles;
drop policy if exists "profiles_update_self" on public.date_planner_profiles;
drop policy if exists "couples_select_member_or_waiting_code" on public.date_planner_couples;
drop policy if exists "couples_insert_owner" on public.date_planner_couples;
drop policy if exists "couples_update_member_or_join" on public.date_planner_couples;
drop policy if exists "date_proposals_member_all" on public.date_planner_proposals;
drop policy if exists "date_options_member_all" on public.date_planner_options;
drop policy if exists "option_comments_member_all" on public.date_planner_comments;
drop policy if exists "ai_suggestion_requests_member_all" on public.date_planner_ai_requests;

create policy "profiles_select_self"
on public.date_planner_profiles for select
using (user_id = auth.uid());

create policy "profiles_insert_self"
on public.date_planner_profiles for insert
with check (user_id = auth.uid());

create policy "profiles_update_self"
on public.date_planner_profiles for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "couples_select_member_or_waiting_code"
on public.date_planner_couples for select
using (
  owner_user_id = auth.uid()
  or partner_user_id = auth.uid()
  or status = 'waiting'
);

create policy "couples_insert_owner"
on public.date_planner_couples for insert
with check (owner_user_id = auth.uid());

create policy "couples_update_member_or_join"
on public.date_planner_couples for update
using (
  owner_user_id = auth.uid()
  or partner_user_id = auth.uid()
  or (status = 'waiting' and partner_user_id is null)
)
with check (
  owner_user_id = auth.uid()
  or partner_user_id = auth.uid()
);

create policy "date_proposals_member_all"
on public.date_planner_proposals for all
using (public.is_couple_member(couple_id))
with check (public.is_couple_member(couple_id));

create policy "date_options_member_all"
on public.date_planner_options for all
using (
  exists (
    select 1
    from public.date_planner_proposals p
    where p.id = proposal_id
      and public.is_couple_member(p.couple_id)
  )
)
with check (
  exists (
    select 1
    from public.date_planner_proposals p
    where p.id = proposal_id
      and public.is_couple_member(p.couple_id)
  )
);

create policy "option_comments_member_all"
on public.date_planner_comments for all
using (
  exists (
    select 1
    from public.date_planner_options o
    join public.date_planner_proposals p on p.id = o.proposal_id
    where o.id = option_id
      and public.is_couple_member(p.couple_id)
  )
)
with check (
  exists (
    select 1
    from public.date_planner_options o
    join public.date_planner_proposals p on p.id = o.proposal_id
    where o.id = option_id
      and public.is_couple_member(p.couple_id)
  )
);

create policy "ai_suggestion_requests_member_all"
on public.date_planner_ai_requests for all
using (public.is_couple_member(couple_id))
with check (public.is_couple_member(couple_id));

create table if not exists public.date_planner_option_preferences (
  option_id text not null references public.date_planner_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preference text not null default 'neutral' check (preference in ('liked', 'neutral', 'not_interested')),
  updated_at timestamptz not null default now(),
  primary key (option_id, user_id)
);

alter table public.date_planner_option_preferences enable row level security;

drop policy if exists "option_preferences_own" on public.date_planner_option_preferences;
drop policy if exists "option_preferences_couple_read" on public.date_planner_option_preferences;

create policy "option_preferences_own"
  on public.date_planner_option_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "option_preferences_couple_read"
  on public.date_planner_option_preferences
  for select
  using (
    exists (
      select 1 from public.date_planner_options o
      join public.date_planner_proposals p on p.id = o.proposal_id
      where o.id = date_planner_option_preferences.option_id
        and public.is_couple_member(p.couple_id)
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.date_planner_option_preferences;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.date_planner_proposals;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.date_planner_options;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.date_planner_comments;
exception
  when duplicate_object then null;
end $$;
