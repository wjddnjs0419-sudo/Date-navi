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

-- Mobile date_cards is managed by the Expo app's migration history and can be
-- absent from installations that only use the Date Planner web schema above.
do $$
begin
  if to_regclass('public.date_cards') is not null then
    alter table public.date_cards
      add column if not exists recommendation_request_id text,
      add column if not exists recommendation_session_id text,
      add column if not exists kakao_place_id text;

    comment on column public.date_cards.recommendation_request_id is
      'Old/manual cards remain null. This request ID identifies one generation attempt.';

    comment on column public.date_cards.recommendation_session_id is
      'Old/manual cards remain null. This session ID groups regenerations when available.';

    comment on column public.date_cards.kakao_place_id is
      'Old/manual cards remain null. This top-level Kakao ID belongs to the card''s single selected place; course place IDs remain in steps[].kakaoPlaceId.';
  end if;
end
$$;

-- Recommendation editing session schema (Phase 8).
-- This is additive. Old/manual date_cards rows remain valid, and the nullable
-- recommendation_request_id/recommendation_session_id/kakao_place_id boundary above
-- remains the backward-compatible dual-write path.
create table if not exists public.recommendation_sessions (
  id text primary key,
  request_id text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  couple_id text references public.date_planner_couples(id) on delete set null,
  original_request jsonb not null,
  current_course jsonb not null,
  cards jsonb not null,
  metadata jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'confirmed', 'archived', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(id)) > 0),
  check (length(btrim(request_id)) > 0),
  check (jsonb_typeof(original_request) = 'object'),
  check (jsonb_typeof(current_course) = 'object'),
  check (jsonb_typeof(cards) = 'array'),
  check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.recommendation_course_steps (
  session_id text not null references public.recommendation_sessions(id) on delete cascade,
  step_id text not null,
  step_order smallint not null check (step_order between 1 and 4),
  category text not null check (length(btrim(category)) > 0),
  label text not null check (length(btrim(label)) > 0),
  original_candidate_id text not null check (length(btrim(original_candidate_id)) > 0),
  original_kakao_place_id text not null check (length(btrim(original_kakao_place_id)) > 0),
  current_candidate_id text not null check (length(btrim(current_candidate_id)) > 0),
  current_kakao_place_id text not null check (length(btrim(current_kakao_place_id)) > 0),
  place_name text not null check (length(btrim(place_name)) > 0),
  address text not null default '',
  road_address text not null default '',
  map_url text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  reason text not null check (length(btrim(reason)) > 0),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, step_id),
  unique (session_id, step_order),
  check (length(btrim(step_id)) > 0)
);

create table if not exists public.recommendation_step_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.recommendation_sessions(id) on delete cascade,
  step_id text,
  event_type text not null check (length(btrim(event_type)) > 0),
  previous_kakao_place_id text,
  next_kakao_place_id text,
  candidate_rank integer,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (session_id, step_id)
    references public.recommendation_course_steps(session_id, step_id)
    on delete cascade,
  check (candidate_rank is null or candidate_rank > 0)
);

create index if not exists recommendation_sessions_owner_idx
  on public.recommendation_sessions(owner_user_id, updated_at desc);
create index if not exists recommendation_sessions_couple_idx
  on public.recommendation_sessions(couple_id, updated_at desc) where couple_id is not null;
create index if not exists recommendation_course_steps_session_order_idx
  on public.recommendation_course_steps(session_id, step_order);
create index if not exists recommendation_step_events_session_created_idx
  on public.recommendation_step_events(session_id, created_at desc);

alter table public.recommendation_sessions enable row level security;
alter table public.recommendation_course_steps enable row level security;
alter table public.recommendation_step_events enable row level security;

drop policy if exists "recommendation_sessions_owner_select" on public.recommendation_sessions;
drop policy if exists "recommendation_sessions_owner_insert" on public.recommendation_sessions;
drop policy if exists "recommendation_sessions_owner_update" on public.recommendation_sessions;
drop policy if exists "recommendation_sessions_owner_delete" on public.recommendation_sessions;
create policy "recommendation_sessions_owner_select" on public.recommendation_sessions
  for select to authenticated using (owner_user_id = auth.uid());
create policy "recommendation_sessions_owner_insert" on public.recommendation_sessions
  for insert to authenticated with check (
    owner_user_id = auth.uid()
    and exists (
      select 1
      from public.date_planner_profiles p
      where p.user_id = auth.uid()
        and p.couple_id is not distinct from public.recommendation_sessions.couple_id
    )
  );
create policy "recommendation_sessions_owner_update" on public.recommendation_sessions
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid()
    and exists (
      select 1
      from public.date_planner_profiles p
      where p.user_id = auth.uid()
        and p.couple_id is not distinct from public.recommendation_sessions.couple_id
    )
  );
create policy "recommendation_sessions_owner_delete" on public.recommendation_sessions
  for delete to authenticated using (owner_user_id = auth.uid());

drop policy if exists "recommendation_course_steps_owner_select" on public.recommendation_course_steps;
drop policy if exists "recommendation_course_steps_owner_insert" on public.recommendation_course_steps;
drop policy if exists "recommendation_course_steps_owner_update" on public.recommendation_course_steps;
drop policy if exists "recommendation_course_steps_owner_delete" on public.recommendation_course_steps;
create policy "recommendation_course_steps_owner_select" on public.recommendation_course_steps
  for select to authenticated using (exists (
    select 1 from public.recommendation_sessions s where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy "recommendation_course_steps_owner_insert" on public.recommendation_course_steps
  for insert to authenticated with check (exists (
    select 1 from public.recommendation_sessions s where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy "recommendation_course_steps_owner_update" on public.recommendation_course_steps
  for update to authenticated using (exists (
    select 1 from public.recommendation_sessions s where s.id = session_id and s.owner_user_id = auth.uid()
  )) with check (exists (
    select 1 from public.recommendation_sessions s where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy "recommendation_course_steps_owner_delete" on public.recommendation_course_steps
  for delete to authenticated using (exists (
    select 1 from public.recommendation_sessions s where s.id = session_id and s.owner_user_id = auth.uid()
  ));

drop policy if exists "recommendation_step_events_owner_select" on public.recommendation_step_events;
drop policy if exists "recommendation_step_events_owner_insert" on public.recommendation_step_events;
create policy "recommendation_step_events_owner_select" on public.recommendation_step_events
  for select to authenticated using (exists (
    select 1 from public.recommendation_sessions s where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy "recommendation_step_events_owner_insert" on public.recommendation_step_events
  for insert to authenticated with check (
    actor_user_id = auth.uid() and exists (
      select 1 from public.recommendation_sessions s where s.id = session_id and s.owner_user_id = auth.uid()
    )
  );

create or replace function public.get_recommendation_session(p_session_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'not authenticated';
  end if;
  select jsonb_build_object(
    'session', to_jsonb(s),
    'steps', coalesce((
      select jsonb_agg(to_jsonb(cs) order by cs.step_order)
      from public.recommendation_course_steps cs
      where cs.session_id = s.id
    ), '[]'::jsonb)
  ) into v_payload
  from public.recommendation_sessions s
  where s.id = p_session_id and s.owner_user_id = auth.uid();
  return v_payload;
end;
$$;

-- Atomic owner-derived write boundary. Client input never supplies owner/couple IDs.
create or replace function public.persist_recommendation_session(p_request jsonb, p_response jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_couple_id text;
  v_request_id text := nullif(btrim(p_response ->> 'requestId'), '');
  v_session_id text := nullif(btrim(p_response #>> '{course,sessionId}'), '');
  v_existing_session_id text;
  v_existing_request_id text;
  v_steps jsonb := p_response #> '{course,steps}';
  v_step jsonb;
begin
  if v_owner_user_id is null then
    raise insufficient_privilege using message = 'not authenticated';
  end if;
  if jsonb_typeof(p_request) <> 'object' or jsonb_typeof(p_response) <> 'object' then
    raise invalid_parameter_value using message = 'request and response must be JSON objects';
  end if;
  if v_request_id is null or v_session_id is null
    or p_request ->> 'requestId' is distinct from v_request_id
    or p_response #>> '{course,requestId}' is distinct from v_request_id then
    raise invalid_parameter_value using message = 'request/session identity mismatch';
  end if;
  if jsonb_typeof(v_steps) <> 'array' or jsonb_array_length(v_steps) not between 2 and 4
    or jsonb_typeof(p_response -> 'cards') <> 'array'
    or jsonb_array_length(p_response -> 'cards') < 1
    or jsonb_typeof(p_response -> 'metadata') <> 'object' then
    raise invalid_parameter_value using message = 'malformed recommendation response';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_session_id, 0));

  select s.id, s.request_id into v_existing_session_id, v_existing_request_id
  from public.recommendation_sessions s
  where s.owner_user_id = v_owner_user_id
    and (s.id = v_session_id or s.request_id = v_request_id)
  limit 1;
  if v_existing_session_id is not null then
    if v_existing_session_id = v_session_id and v_existing_request_id = v_request_id then
      return public.get_recommendation_session(v_existing_session_id);
    end if;
    raise unique_violation using message = 'recommendation identity is already in use';
  end if;

  select p.couple_id into v_couple_id
  from public.date_planner_profiles p where p.user_id = v_owner_user_id;

  insert into public.recommendation_sessions (
    id, request_id, owner_user_id, couple_id, original_request,
    current_course, cards, metadata, status
  ) values (
    v_session_id, v_request_id, v_owner_user_id, v_couple_id, p_request,
    p_response -> 'course', p_response -> 'cards', p_response -> 'metadata', 'draft'
  );

  for v_step in select value from jsonb_array_elements(v_steps)
  loop
    insert into public.recommendation_course_steps (
      session_id, step_id, step_order, category, label,
      original_candidate_id, original_kakao_place_id,
      current_candidate_id, current_kakao_place_id,
      place_name, address, road_address, map_url,
      latitude, longitude, reason, locked
    ) values (
      v_session_id, v_step ->> 'stepId', (v_step ->> 'order')::smallint,
      v_step ->> 'category', v_step ->> 'label',
      v_step ->> 'candidateId', v_step ->> 'kakaoPlaceId',
      v_step ->> 'candidateId', v_step ->> 'kakaoPlaceId',
      v_step ->> 'name', coalesce(v_step ->> 'address', ''),
      coalesce(v_step ->> 'roadAddress', ''), coalesce(v_step ->> 'mapUrl', ''),
      (v_step ->> 'latitude')::double precision,
      (v_step ->> 'longitude')::double precision,
      v_step ->> 'reason', coalesce((v_step ->> 'locked')::boolean, false)
    );
  end loop;
  return public.get_recommendation_session(v_session_id);
end;
$$;

revoke all on function public.get_recommendation_session(text) from public;
revoke all on function public.persist_recommendation_session(jsonb, jsonb) from public;
grant execute on function public.get_recommendation_session(text) to authenticated;
grant execute on function public.persist_recommendation_session(jsonb, jsonb) to authenticated;
grant select, insert, update, delete on public.recommendation_sessions to authenticated;
grant select, insert, update, delete on public.recommendation_course_steps to authenticated;
grant select, insert on public.recommendation_step_events to authenticated;

-- Phase 9: final attested editable draft lifecycle. This section is executable as part of the canonical schema and mirrors 20260715090000_editable_recommendation_sessions.sql.


-- Additive fields keep Phase 8 drafts readable: a null latest_request means
-- "the original request is still current", and an empty pool simply disables
-- client-side replacement until a server regeneration supplies candidates.
alter table public.recommendation_sessions
  add column if not exists original_request_id text,
  add column if not exists latest_request jsonb,
  add column if not exists candidate_pool jsonb not null default '[]'::jsonb,
  add column if not exists confirmed_card_id text;

create table if not exists public.recommendation_generation_attestations (
  request_id text primary key,
  session_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  request_json jsonb not null check (jsonb_typeof(request_json) = 'object'),
  response_json jsonb not null check (jsonb_typeof(response_json) = 'object'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (length(btrim(session_id)) > 0)
);
create index if not exists recommendation_generation_attestations_owner_session_idx
  on public.recommendation_generation_attestations(owner_user_id, session_id, created_at desc);
alter table public.recommendation_generation_attestations enable row level security;
revoke all on public.recommendation_generation_attestations from authenticated;

create unique index if not exists recommendation_sessions_confirmed_card_id_idx
  on public.recommendation_sessions(confirmed_card_id)
  where confirmed_card_id is not null;

alter table public.recommendation_sessions
  drop constraint if exists recommendation_sessions_candidate_pool_object;
alter table public.recommendation_sessions
  add constraint recommendation_sessions_candidate_pool_object
  check (jsonb_typeof(candidate_pool) = 'array');

-- Reordering needs a transient duplicate order while every value remains in
-- the 1..4 check range. Defer only this uniqueness check to transaction end.
alter table public.recommendation_course_steps
  drop constraint if exists recommendation_course_steps_session_id_step_order_key;
alter table public.recommendation_course_steps
  add constraint recommendation_course_steps_session_id_step_order_key
  unique (session_id, step_order) deferrable initially deferred;

create index if not exists recommendation_sessions_owner_status_updated_idx
  on public.recommendation_sessions(owner_user_id, status, updated_at desc);

create or replace function public.seed_recommendation_candidate_pool()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.candidate_pool = '[]'::jsonb and jsonb_typeof(new.current_course -> 'steps') = 'array' then
    new.candidate_pool := new.current_course -> 'steps';
  end if;
  if new.original_request_id is null then new.original_request_id := new.request_id; end if;
  return new;
end;
$$;
drop trigger if exists recommendation_sessions_seed_candidate_pool on public.recommendation_sessions;
create trigger recommendation_sessions_seed_candidate_pool
  before insert on public.recommendation_sessions
  for each row execute function public.seed_recommendation_candidate_pool();

-- Draft rows are owner-readable only. All state-changing writes go through the
-- definer RPC below, so REST cannot write a partial multi-row course.
drop policy if exists "recommendation_sessions_owner_insert" on public.recommendation_sessions;
drop policy if exists "recommendation_sessions_owner_update" on public.recommendation_sessions;
drop policy if exists "recommendation_sessions_owner_delete" on public.recommendation_sessions;
drop policy if exists "recommendation_course_steps_owner_insert" on public.recommendation_course_steps;
drop policy if exists "recommendation_course_steps_owner_update" on public.recommendation_course_steps;
drop policy if exists "recommendation_course_steps_owner_delete" on public.recommendation_course_steps;
revoke insert, update, delete on public.recommendation_sessions from authenticated;
revoke insert, update, delete on public.recommendation_course_steps from authenticated;

-- The Phase 8 JSON overload is deliberately disabled: accepting an arbitrary
-- response here would let a client manufacture persisted Kakao facts.  The
-- Edge function writes the authenticated, validated payload to the private
-- attestation table, then this opaque-ID overload consumes it atomically.
create or replace function public.persist_recommendation_session(
  p_request jsonb,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise insufficient_privilege using message = 'opaque attestation required';
end;
$$;
revoke all on function public.persist_recommendation_session(jsonb, jsonb) from public;
revoke all on function public.persist_recommendation_session(jsonb, jsonb) from authenticated;

create or replace function public.persist_recommendation_session(p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_attestation public.recommendation_generation_attestations%rowtype;
  v_couple_id text;
  v_request jsonb;
  v_response jsonb;
  v_session_id text;
  v_step jsonb;
begin
  if v_owner is null then raise insufficient_privilege using message = 'not authenticated'; end if;
  if nullif(btrim(p_request_id), '') is null then raise invalid_parameter_value using message = 'invalid_candidate'; end if;

  select * into v_attestation
  from public.recommendation_generation_attestations
  where request_id = p_request_id and owner_user_id = v_owner
  for update;
  if not found then raise no_data_found using message = 'invalid_candidate'; end if;

  v_request := v_attestation.request_json;
  v_response := v_attestation.response_json;
  v_session_id := nullif(btrim(v_response #>> '{course,sessionId}'), '');
  if v_attestation.session_id <> p_request_id
    or v_request ->> 'requestId' is distinct from p_request_id
    or v_response ->> 'requestId' is distinct from p_request_id
    or v_response #>> '{course,requestId}' is distinct from p_request_id
    or v_session_id is distinct from p_request_id
    or v_request ? 'baseRequestId'
    or jsonb_typeof(v_response #> '{course,steps}') <> 'array'
    or jsonb_array_length(v_response #> '{course,steps}') not between 2 and 4
    or jsonb_typeof(v_response -> 'cards') <> 'array'
    or jsonb_array_length(v_response -> 'cards') < 1
    or jsonb_typeof(v_response -> 'metadata') <> 'object' then
    raise invalid_parameter_value using message = 'invalid_candidate';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_session_id, 0));
  if exists (
    select 1 from public.recommendation_sessions s
    where s.id = v_session_id and s.owner_user_id = v_owner and s.request_id = p_request_id
  ) then
    return public.get_recommendation_session(v_session_id);
  end if;
  if v_attestation.consumed_at is not null then raise check_violation using message = 'stale'; end if;
  if exists (select 1 from public.recommendation_sessions s where s.id = v_session_id or s.request_id = p_request_id) then
    raise unique_violation using message = 'stale';
  end if;
  if not exists (select 1 from public.date_planner_profiles p where p.user_id = v_owner) then
    raise insufficient_privilege using message = 'unauthorized_edit';
  end if;
  select p.couple_id into v_couple_id from public.date_planner_profiles p where p.user_id = v_owner;

  insert into public.recommendation_sessions (
    id, request_id, original_request_id, owner_user_id, couple_id, original_request,
    latest_request, current_course, cards, metadata, candidate_pool, status
  ) values (
    v_session_id, p_request_id, p_request_id, v_owner, v_couple_id, v_request,
    v_request, v_response -> 'course', v_response -> 'cards', v_response -> 'metadata',
    v_response #> '{course,steps}', 'draft'
  );
  for v_step in select value from jsonb_array_elements(v_response #> '{course,steps}') loop
    insert into public.recommendation_course_steps (
      session_id, step_id, step_order, category, label,
      original_candidate_id, original_kakao_place_id, current_candidate_id, current_kakao_place_id,
      place_name, address, road_address, map_url, latitude, longitude, reason, locked
    ) values (
      v_session_id, v_step ->> 'stepId', (v_step ->> 'order')::smallint,
      v_step ->> 'category', v_step ->> 'label',
      v_step ->> 'candidateId', v_step ->> 'kakaoPlaceId',
      v_step ->> 'candidateId', v_step ->> 'kakaoPlaceId',
      v_step ->> 'name', coalesce(v_step ->> 'address', ''), coalesce(v_step ->> 'roadAddress', ''),
      coalesce(v_step ->> 'mapUrl', ''), (v_step ->> 'latitude')::double precision,
      (v_step ->> 'longitude')::double precision, v_step ->> 'reason',
      coalesce((v_step ->> 'locked')::boolean, false)
    );
  end loop;
  update public.recommendation_generation_attestations set consumed_at = now()
    where request_id = p_request_id and consumed_at is null;
  return public.get_recommendation_session(v_session_id);
end;
$$;
revoke all on function public.persist_recommendation_session(text) from public;
grant execute on function public.persist_recommendation_session(text) to authenticated;

create or replace function public.apply_recommendation_session_mutation(
  p_session_id text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_session public.recommendation_sessions%rowtype;
  v_attestation public.recommendation_generation_attestations%rowtype;
  v_attestation_request_id text;
  v_uses_attestation boolean := false;
  v_steps jsonb;
  v_step jsonb;
  v_order integer := 0;
  v_ids text[];
  v_target text;
  v_locked boolean;
  v_request jsonb;
  v_response jsonb;
  v_new_step jsonb;
  v_original_candidate text;
  v_original_place text;
  v_current_category text;
  v_current_label text;
  v_card jsonb;
  v_card_id text;
  v_card_steps jsonb;
  v_request_steps jsonb;
  v_locked_steps jsonb;
  v_persisted_locked_steps jsonb;
begin
  if v_owner is null then raise insufficient_privilege using message = 'not authenticated'; end if;
  if p_action not in ('lock','unlock','reorder','replace','add','delete','regenerate','confirm') then
    raise invalid_parameter_value using message = 'operation_failed';
  end if;
  select * into v_session from public.recommendation_sessions
    where id = p_session_id and owner_user_id = v_owner for update;
  if not found then raise no_data_found using message = 'missing'; end if;
  if not exists (select 1 from public.date_planner_profiles p
                 where p.user_id = v_owner and p.couple_id is not distinct from v_session.couple_id) then
    raise insufficient_privilege using message = 'unauthorized_edit';
  end if;
  if v_session.status = 'confirmed' and p_action <> 'confirm' then
    raise check_violation using message = 'confirmed';
  end if;
  -- Regeneration and selection changes consume a one-time Edge attestation.
  -- The client contributes only opaque IDs; all request/response/place facts
  -- below are read from the private server-issued row while both rows are
  -- locked in this transaction.
  if p_action in ('regenerate', 'replace', 'add') then
    v_attestation_request_id := nullif(btrim(p_payload ->> 'attestationRequestId'), '');
    if v_attestation_request_id is null then raise invalid_parameter_value using message = 'invalid_candidate'; end if;
    select * into v_attestation
      from public.recommendation_generation_attestations
      where request_id = v_attestation_request_id
        and session_id = p_session_id
        and owner_user_id = v_owner
        and consumed_at is null
      for update;
    if not found then raise check_violation using message = 'stale'; end if;
    v_request := v_attestation.request_json;
    v_response := v_attestation.response_json;
    if v_request ->> 'requestId' is distinct from v_attestation_request_id
      or v_response ->> 'requestId' is distinct from v_attestation_request_id
      or v_response #>> '{course,requestId}' is distinct from v_attestation_request_id
      or v_response #>> '{course,sessionId}' is distinct from p_session_id
      or v_attestation.request_json ->> 'baseRequestId' is distinct from v_session.request_id
      or jsonb_typeof(v_response #> '{course,steps}') <> 'array'
      or jsonb_array_length(v_response #> '{course,steps}') not between 2 and 4 then
      raise check_violation using message = 'stale';
    end if;
    if jsonb_typeof(coalesce(v_request -> 'lockedSteps', '[]'::jsonb)) <> 'array' then
      raise check_violation using message = 'locked';
    end if;
    -- Every temporary lock must name an exact current tuple. This lets the
    -- server enforce target replacement constraints without accepting forged
    -- or stale lock entries from an attested request.
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_request -> 'lockedSteps', '[]'::jsonb)) requested_lock
      where not exists (
        select 1 from public.recommendation_course_steps current_step
        where current_step.session_id = p_session_id
          and current_step.step_id = requested_lock ->> 'stepId'
          and current_step.current_candidate_id = requested_lock ->> 'candidateId'
          and current_step.current_kakao_place_id = requested_lock ->> 'kakaoPlaceId'
      )
    ) then
      raise check_violation using message = 'locked';
    end if;
    -- Persisted locks are a required subset. Replace/add may also use
    -- temporary request locks to make the server preserve unaffected steps.
    if exists (
      select 1 from public.recommendation_course_steps current_lock
      where current_lock.session_id = p_session_id and current_lock.locked
        and not exists (
          select 1 from jsonb_array_elements(coalesce(v_request -> 'lockedSteps', '[]'::jsonb)) requested_lock
          where requested_lock ->> 'stepId' = current_lock.step_id
            and requested_lock ->> 'candidateId' = current_lock.current_candidate_id
            and requested_lock ->> 'kakaoPlaceId' = current_lock.current_kakao_place_id
        )
    ) or exists (
      select 1 from public.recommendation_course_steps current_lock
      where current_lock.session_id = p_session_id and current_lock.locked
        and not exists (
          select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
          where next ->> 'stepId' = current_lock.step_id
            and next ->> 'candidateId' = current_lock.current_candidate_id
            and next ->> 'kakaoPlaceId' = current_lock.current_kakao_place_id
            and next ->> 'locked' = 'true'
        )
    ) then
      raise check_violation using message = 'locked';
    end if;
    if p_action = 'regenerate' and (
      jsonb_array_length(v_response #> '{course,steps}') <> (
        select count(*) from public.recommendation_course_steps where session_id = p_session_id
      ) or exists (
        select 1 from public.recommendation_course_steps current_step
        where current_step.session_id = p_session_id and not exists (
          select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
          where next ->> 'stepId' = current_step.step_id
            and next ->> 'category' = current_step.category
            and next ->> 'label' = current_step.label
            and (next ->> 'order')::smallint = current_step.step_order
        )
      ) or exists (
        select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
        where not exists (
          select 1 from public.recommendation_course_steps current_step
          where current_step.session_id = p_session_id
            and current_step.step_id = next ->> 'stepId'
            and current_step.category = next ->> 'category'
            and current_step.label = next ->> 'label'
            and current_step.step_order = (next ->> 'order')::smallint
        )
      )
    ) then
      raise check_violation using message = 'constraint_violation';
    end if;
    v_uses_attestation := true;
  end if;
  if p_action = 'confirm' then
    if v_session.status = 'confirmed' then return public.get_recommendation_session(p_session_id); end if;
    if (select count(*) from public.recommendation_course_steps where session_id = p_session_id) not between 2 and 4 then
      raise check_violation using message = 'min_steps';
    end if;
    if v_session.couple_id is null then raise check_violation using message = 'constraint_violation'; end if;
    v_card := v_session.cards -> 0;
    if jsonb_typeof(v_card) <> 'object' then raise check_violation using message = 'constraint_violation'; end if;
    v_card_id := gen_random_uuid()::text;
    insert into public.date_cards (
      id, couple_id, created_by, mode, input_json, source, title, summary,
      estimated_time, estimated_budget, tags, why_recommended, steps,
      recommendation_request_id, recommendation_session_id
    ) values (
      v_card_id, v_session.couple_id, v_owner, 'make_course',
      coalesce(v_session.latest_request, v_session.original_request), 'ai',
      coalesce(v_card ->> 'title', 'Date course'), coalesce(v_card ->> 'summary', ''),
      coalesce(v_card ->> 'estimated_time', ''), coalesce(v_card ->> 'estimated_budget', ''),
      coalesce(array(select jsonb_array_elements_text(v_card -> 'tags')), '{}'::text[]),
      coalesce(v_card ->> 'why_recommended', ''), coalesce(v_card -> 'steps', '[]'::jsonb),
      v_session.request_id, p_session_id
    );
    update public.recommendation_sessions set status = 'confirmed', confirmed_card_id = v_card_id, updated_at = now() where id = p_session_id;
    return public.get_recommendation_session(p_session_id);
  end if;

  if p_action in ('lock','unlock') then
    v_target := nullif(btrim(p_payload ->> 'stepId'), '');
    if v_target is null then raise invalid_parameter_value using message = 'missing'; end if;
    update public.recommendation_course_steps set locked = (p_action = 'lock'), updated_at = now()
      where session_id = p_session_id and step_id = v_target;
    if not found then raise no_data_found using message = 'missing'; end if;
  elsif p_action = 'reorder' then
    if jsonb_typeof(p_payload -> 'stepIds') <> 'array' then raise invalid_parameter_value using message = 'invalid_order'; end if;
    select array_agg(value #>> '{}') into v_ids from jsonb_array_elements(p_payload -> 'stepIds');
    if cardinality(v_ids) <> (select count(*) from public.recommendation_course_steps where session_id = p_session_id)
      or (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids)
      or exists (select 1 from public.recommendation_course_steps where session_id = p_session_id and step_id <> all(v_ids)) then
      raise invalid_parameter_value using message = 'invalid_order';
    end if;
    for v_order in 1..cardinality(v_ids) loop
      update public.recommendation_course_steps set step_order = v_order, updated_at = now()
        where session_id = p_session_id and step_id = v_ids[v_order];
    end loop;
  elsif p_action = 'delete' then
    v_target := nullif(btrim(p_payload ->> 'stepId'), '');
    select locked into v_locked from public.recommendation_course_steps where session_id = p_session_id and step_id = v_target;
    if not found then raise no_data_found using message = 'missing'; end if;
    if v_locked then raise check_violation using message = 'locked'; end if;
    if (select count(*) from public.recommendation_course_steps where session_id = p_session_id) <= 2 then raise check_violation using message = 'min_steps'; end if;
    delete from public.recommendation_course_steps where session_id = p_session_id and step_id = v_target;
    v_order := 0;
    update public.recommendation_course_steps s set step_order = ordered.next_order, updated_at = now()
      from (select step_id, row_number() over(order by step_order)::smallint as next_order
            from public.recommendation_course_steps where session_id = p_session_id) ordered
      where s.session_id = p_session_id and s.step_id = ordered.step_id;
  elsif p_action = 'regenerate' then
    -- v_request/v_response came exclusively from the locked attestation.
    select coalesce(jsonb_agg(jsonb_build_object(
      'stepId', step_id, 'candidateId', current_candidate_id, 'kakaoPlaceId', current_kakao_place_id
    )), '[]'::jsonb) into v_persisted_locked_steps
    from public.recommendation_course_steps where session_id = p_session_id and locked;
    if exists (
      select 1 from public.recommendation_course_steps old
      where old.session_id = p_session_id and old.locked
      and not exists (
        select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
        where next ->> 'stepId' = old.step_id
          and next ->> 'candidateId' = old.current_candidate_id
          and next ->> 'kakaoPlaceId' = old.current_kakao_place_id
      )
    ) then raise check_violation using message = 'locked'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
      group by next ->> 'stepId' having count(*) > 1
    ) or exists (
      select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
      group by next ->> 'candidateId' having count(*) > 1
    ) or exists (
      select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
      group by next ->> 'kakaoPlaceId' having count(*) > 1
    ) then raise check_violation using message = 'duplicate'; end if;
    delete from public.recommendation_course_steps where session_id = p_session_id;
    for v_new_step in select value from jsonb_array_elements(v_response #> '{course,steps}') loop
      insert into public.recommendation_course_steps (
        session_id, step_id, step_order, category, label,
        original_candidate_id, original_kakao_place_id, current_candidate_id, current_kakao_place_id,
        place_name, address, road_address, map_url, latitude, longitude, reason, locked
      ) values (
        p_session_id, v_new_step ->> 'stepId', (v_new_step ->> 'order')::smallint,
        v_new_step ->> 'category', v_new_step ->> 'label',
        v_new_step ->> 'candidateId', v_new_step ->> 'kakaoPlaceId',
        v_new_step ->> 'candidateId', v_new_step ->> 'kakaoPlaceId',
        v_new_step ->> 'name', coalesce(v_new_step ->> 'address',''), coalesce(v_new_step ->> 'roadAddress',''),
        coalesce(v_new_step ->> 'mapUrl',''), (v_new_step ->> 'latitude')::double precision,
        (v_new_step ->> 'longitude')::double precision, v_new_step ->> 'reason',
        exists (
          select 1 from jsonb_array_elements(v_persisted_locked_steps) persisted_lock
          where persisted_lock ->> 'stepId' = v_new_step ->> 'stepId'
            and persisted_lock ->> 'candidateId' = v_new_step ->> 'candidateId'
            and persisted_lock ->> 'kakaoPlaceId' = v_new_step ->> 'kakaoPlaceId'
        )
      );
    end loop;
  elsif p_action in ('replace', 'add') then
    -- Candidate identity is the only selection data accepted from the client.
    -- Facts, category, label, coordinates, address, and reason are copied from
    -- the Edge-validated attestation response.
    select candidate into v_new_step
    from jsonb_array_elements(v_response #> '{course,steps}') candidate
    where candidate ->> 'candidateId' = nullif(btrim(p_payload ->> 'candidateId'), '')
      and candidate ->> 'kakaoPlaceId' = nullif(btrim(p_payload ->> 'kakaoPlaceId'), '')
    limit 1;
    if v_new_step is null then
      raise invalid_parameter_value using message = 'invalid_candidate';
    end if;
    if p_action = 'add' then
      if (select count(*) from public.recommendation_course_steps where session_id = p_session_id) >= 4 then raise check_violation using message = 'max_steps'; end if;
      if jsonb_typeof(v_request -> 'courseSteps') <> 'array'
        or jsonb_array_length(v_request -> 'courseSteps') <> (
          select count(*) + 1 from public.recommendation_course_steps where session_id = p_session_id
        ) or jsonb_array_length(v_response #> '{course,steps}') <> (
          select count(*) + 1 from public.recommendation_course_steps where session_id = p_session_id
        ) or exists (
          select 1 from public.recommendation_course_steps current_step
          where current_step.session_id = p_session_id and not exists (
            select 1 from jsonb_array_elements(v_request -> 'courseSteps')
              with ordinality requested_step(value, ordinality)
            where requested_step.value ->> 'id' = current_step.step_id
              and requested_step.value ->> 'category' = current_step.category
              and requested_step.value ->> 'label' = current_step.label
              and requested_step.ordinality = current_step.step_order
          )
        ) or exists (
          select 1 from public.recommendation_course_steps current_step
          where current_step.session_id = p_session_id and not exists (
            select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
            where next ->> 'stepId' = current_step.step_id
              and next ->> 'category' = current_step.category
              and next ->> 'label' = current_step.label
              and next ->> 'candidateId' = current_step.current_candidate_id
              and next ->> 'kakaoPlaceId' = current_step.current_kakao_place_id
              and (next ->> 'locked')::boolean is not distinct from current_step.locked
              and (next ->> 'order')::smallint = current_step.step_order
          )
        ) or exists (
          select 1 from jsonb_array_elements(v_request -> 'courseSteps') new_step
          where not exists (
            select 1 from public.recommendation_course_steps current_step
            where current_step.session_id = p_session_id and current_step.step_id = new_step ->> 'id'
          ) and new_step ->> 'category' <> 'ai_decide'
        ) or not exists (
          select 1 from jsonb_array_elements(v_request -> 'courseSteps') new_step
          where new_step ->> 'id' = v_new_step ->> 'stepId'
            and new_step ->> 'category' = v_new_step ->> 'category'
            and new_step ->> 'label' = v_new_step ->> 'label'
            and new_step ->> 'category' = 'ai_decide'
        ) or (v_new_step ->> 'order')::smallint <> (
          select count(*) + 1 from public.recommendation_course_steps where session_id = p_session_id
        ) then
        raise check_violation using message = 'constraint_violation';
      end if;
      if exists (select 1 from public.recommendation_course_steps where session_id = p_session_id
                 and (step_id = v_new_step ->> 'stepId' or current_candidate_id = v_new_step ->> 'candidateId' or current_kakao_place_id = v_new_step ->> 'kakaoPlaceId')) then raise check_violation using message = 'duplicate'; end if;
      insert into public.recommendation_course_steps (session_id,step_id,step_order,category,label,original_candidate_id,original_kakao_place_id,current_candidate_id,current_kakao_place_id,place_name,address,road_address,map_url,latitude,longitude,reason,locked)
      values (p_session_id,v_new_step ->> 'stepId',(select count(*) + 1 from public.recommendation_course_steps where session_id=p_session_id),v_new_step ->> 'category',v_new_step ->> 'label',v_new_step ->> 'candidateId',v_new_step ->> 'kakaoPlaceId',v_new_step ->> 'candidateId',v_new_step ->> 'kakaoPlaceId',v_new_step ->> 'name',coalesce(v_new_step ->> 'address',''),coalesce(v_new_step ->> 'roadAddress',''),coalesce(v_new_step ->> 'mapUrl',''),(v_new_step ->> 'latitude')::double precision,(v_new_step ->> 'longitude')::double precision,v_new_step ->> 'reason',false);
    else
      v_target := nullif(btrim(p_payload ->> 'stepId'),'');
      select locked, current_candidate_id, current_kakao_place_id, category, label
        into v_locked, v_original_candidate, v_original_place, v_current_category, v_current_label
        from public.recommendation_course_steps where session_id=p_session_id and step_id=v_target;
      if not found then raise no_data_found using message = 'missing'; end if;
      if v_locked then raise check_violation using message = 'locked'; end if;
      if jsonb_typeof(v_request -> 'courseSteps') <> 'array'
        or jsonb_array_length(v_request -> 'courseSteps') <> (
          select count(*) from public.recommendation_course_steps where session_id = p_session_id
        ) or exists (
          select 1 from public.recommendation_course_steps current_step
          where current_step.session_id = p_session_id and not exists (
            select 1 from jsonb_array_elements(v_request -> 'courseSteps')
              with ordinality requested_step(value, ordinality)
            where requested_step.value ->> 'id' = current_step.step_id
              and requested_step.value ->> 'category' = current_step.category
              and requested_step.value ->> 'label' = current_step.label
              and requested_step.ordinality = current_step.step_order
          )
        ) or jsonb_array_length(v_response #> '{course,steps}') <> (
        select count(*) from public.recommendation_course_steps where session_id = p_session_id
      ) or v_new_step ->> 'stepId' is distinct from v_target
        or v_new_step ->> 'category' is distinct from v_current_category
        or v_new_step ->> 'label' is distinct from v_current_label
        or (v_new_step ->> 'order')::smallint is distinct from (
          select step_order from public.recommendation_course_steps
          where session_id = p_session_id and step_id = v_target
        )
        or v_original_candidate is not distinct from v_new_step ->> 'candidateId'
        or exists (
          select 1 from public.recommendation_course_steps current_step
          where current_step.session_id = p_session_id and current_step.step_id <> v_target
            and not exists (
              select 1 from jsonb_array_elements(v_response #> '{course,steps}') next
              where next ->> 'stepId' = current_step.step_id
                and next ->> 'category' = current_step.category
                and next ->> 'label' = current_step.label
                and next ->> 'candidateId' = current_step.current_candidate_id
                and next ->> 'kakaoPlaceId' = current_step.current_kakao_place_id
                and (next ->> 'locked')::boolean is not distinct from current_step.locked
                and (next ->> 'order')::smallint = current_step.step_order
            )
        ) then
        raise check_violation using message = 'constraint_violation';
      end if;
      if exists (select 1 from public.recommendation_course_steps where session_id=p_session_id and step_id<>v_target and (current_candidate_id=v_new_step ->> 'candidateId' or current_kakao_place_id=v_new_step ->> 'kakaoPlaceId')) then raise check_violation using message = 'duplicate'; end if;
      update public.recommendation_course_steps set current_candidate_id=v_new_step ->> 'candidateId', current_kakao_place_id=v_new_step ->> 'kakaoPlaceId', place_name=v_new_step ->> 'name', address=coalesce(v_new_step ->> 'address',''), road_address=coalesce(v_new_step ->> 'roadAddress',''), map_url=coalesce(v_new_step ->> 'mapUrl',''), latitude=(v_new_step ->> 'latitude')::double precision, longitude=(v_new_step ->> 'longitude')::double precision, reason=v_new_step ->> 'reason', updated_at=now() where session_id=p_session_id and step_id=v_target;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'stepId', step_id, 'order', step_order, 'category', category, 'label', label,
    'candidateId', current_candidate_id, 'kakaoPlaceId', current_kakao_place_id,
    'name', place_name, 'address', address, 'roadAddress', road_address, 'mapUrl', map_url,
    'latitude', latitude, 'longitude', longitude, 'reason', reason, 'locked', locked
  ) order by step_order), '[]'::jsonb) into v_steps
  from public.recommendation_course_steps where session_id = p_session_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', label, 'candidateId', current_candidate_id, 'kakaoPlaceId', current_kakao_place_id,
    'place_name', place_name, 'place_address', nullif(road_address, ''), 'map_url', nullif(map_url, '')
  ) order by step_order), '[]'::jsonb) into v_card_steps
  from public.recommendation_course_steps where session_id = p_session_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', step_id, 'category', category, 'label', label) order by step_order), '[]'::jsonb)
    into v_request_steps from public.recommendation_course_steps where session_id = p_session_id;
  select coalesce(jsonb_agg(jsonb_build_object('stepId', step_id, 'candidateId', current_candidate_id, 'kakaoPlaceId', current_kakao_place_id) order by step_order), '[]'::jsonb)
    into v_locked_steps from public.recommendation_course_steps where session_id = p_session_id and locked;
  update public.recommendation_sessions set
    request_id = case when v_uses_attestation then v_attestation_request_id else request_id end,
    current_course = jsonb_set(
      case when v_uses_attestation then v_response -> 'course' else current_course end,
      '{steps}', v_steps
    ),
    cards = (select coalesce(jsonb_agg(jsonb_set(card, '{steps}', v_card_steps)), '[]'::jsonb)
             from jsonb_array_elements(case when v_uses_attestation then v_response -> 'cards' else cards end) card),
    metadata = case when v_uses_attestation then v_response -> 'metadata' else metadata end,
    candidate_pool = case when v_uses_attestation then v_response #> '{course,steps}' else candidate_pool end,
    latest_request = case when jsonb_array_length(v_locked_steps) = 0
      then jsonb_set(coalesce(v_request, latest_request, original_request), '{courseSteps}', v_request_steps) - 'lockedSteps'
      else jsonb_set(
        jsonb_set(coalesce(v_request, latest_request, original_request), '{courseSteps}', v_request_steps),
        '{lockedSteps}', v_locked_steps
      )
    end,
    updated_at = now()
    where id = p_session_id;
  if v_uses_attestation then
    update public.recommendation_generation_attestations set consumed_at = now()
      where request_id = v_attestation_request_id and consumed_at is null;
  end if;
  return public.get_recommendation_session(p_session_id);
end;
$$;

revoke all on function public.apply_recommendation_session_mutation(text, text, jsonb) from public;
grant execute on function public.apply_recommendation_session_mutation(text, text, jsonb) to authenticated;

comment on function public.apply_recommendation_session_mutation(text, text, jsonb) is
  'Owner-only atomic draft mutations. Replace/add/regenerate require the Phase 9 server-issued snapshot path.';

-- Phase 11: first-party feedback is owner-readable but only owner-safe RPCs
-- can write it. The executable migration remains the authoritative replay for
-- audit triggers and action-context injection.
create table if not exists public.place_feedback (
  id uuid primary key default gen_random_uuid(), session_id text not null references public.recommendation_sessions(id) on delete cascade,
  step_id text not null, kakao_place_id text not null, owner_user_id uuid not null references auth.users(id) on delete cascade,
  couple_id text references public.date_planner_couples(id) on delete set null, visited boolean not null,
  tags text[] not null default '{}'::text[], created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (session_id, step_id, owner_user_id), foreign key (session_id, step_id) references public.recommendation_course_steps(session_id, step_id) on delete cascade,
  check (tags <@ array['conversation','quiet','noisy','value','expensive','photos','revisit','crowded']::text[])
);
alter table public.place_feedback enable row level security;
create policy "place_feedback_owner_select" on public.place_feedback for select to authenticated using (owner_user_id = auth.uid());
revoke insert, update, delete on public.place_feedback from authenticated;
revoke insert, update, delete on public.recommendation_step_events from authenticated;
-- See 20260715100000_recommendation_learning_events.sql for the canonical
-- SECURITY DEFINER trigger/RPC bodies: record_recommendation_step_event and
-- record_recommendation_place_feedback, both with search_path=public, pg_temp.
