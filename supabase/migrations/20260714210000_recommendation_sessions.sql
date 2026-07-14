begin;

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
  on public.recommendation_sessions(couple_id, updated_at desc)
  where couple_id is not null;
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
create policy "recommendation_sessions_owner_select"
  on public.recommendation_sessions for select to authenticated
  using (owner_user_id = auth.uid());
create policy "recommendation_sessions_owner_insert"
  on public.recommendation_sessions for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "recommendation_sessions_owner_update"
  on public.recommendation_sessions for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy "recommendation_sessions_owner_delete"
  on public.recommendation_sessions for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "recommendation_course_steps_owner_select" on public.recommendation_course_steps;
drop policy if exists "recommendation_course_steps_owner_insert" on public.recommendation_course_steps;
drop policy if exists "recommendation_course_steps_owner_update" on public.recommendation_course_steps;
drop policy if exists "recommendation_course_steps_owner_delete" on public.recommendation_course_steps;
create policy "recommendation_course_steps_owner_select"
  on public.recommendation_course_steps for select to authenticated
  using (exists (
    select 1 from public.recommendation_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy "recommendation_course_steps_owner_insert"
  on public.recommendation_course_steps for insert to authenticated
  with check (exists (
    select 1 from public.recommendation_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy "recommendation_course_steps_owner_update"
  on public.recommendation_course_steps for update to authenticated
  using (exists (
    select 1 from public.recommendation_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.recommendation_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy "recommendation_course_steps_owner_delete"
  on public.recommendation_course_steps for delete to authenticated
  using (exists (
    select 1 from public.recommendation_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));

drop policy if exists "recommendation_step_events_owner_select" on public.recommendation_step_events;
drop policy if exists "recommendation_step_events_owner_insert" on public.recommendation_step_events;
create policy "recommendation_step_events_owner_select"
  on public.recommendation_step_events for select to authenticated
  using (exists (
    select 1 from public.recommendation_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy "recommendation_step_events_owner_insert"
  on public.recommendation_step_events for insert to authenticated
  with check (
    actor_user_id = auth.uid()
    and exists (
      select 1 from public.recommendation_sessions s
      where s.id = session_id and s.owner_user_id = auth.uid()
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
  )
  into v_payload
  from public.recommendation_sessions s
  where s.id = p_session_id
    and s.owner_user_id = auth.uid();

  return v_payload;
end;
$$;

create or replace function public.persist_recommendation_session(
  p_request jsonb,
  p_response jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_user_id uuid;
  v_couple_id text;
  v_request_id text;
  v_session_id text;
  v_existing_session_id text;
  v_existing_request_id text;
  v_steps jsonb;
  v_step jsonb;
begin
  v_owner_user_id := auth.uid();
  if v_owner_user_id is null then
    raise insufficient_privilege using message = 'not authenticated';
  end if;
  if jsonb_typeof(p_request) <> 'object' or jsonb_typeof(p_response) <> 'object' then
    raise invalid_parameter_value using message = 'request and response must be JSON objects';
  end if;

  v_request_id := nullif(btrim(p_response ->> 'requestId'), '');
  v_session_id := nullif(btrim(p_response #>> '{course,sessionId}'), '');
  v_steps := p_response #> '{course,steps}';
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

  select s.id, s.request_id
  into v_existing_session_id, v_existing_request_id
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

  select p.couple_id
  into v_couple_id
  from public.date_planner_profiles p
  where p.user_id = v_owner_user_id;

  insert into public.recommendation_sessions (
    id, request_id, owner_user_id, couple_id, original_request,
    current_course, cards, metadata, status
  ) values (
    v_session_id, v_request_id, v_owner_user_id, v_couple_id, p_request,
    p_response -> 'course', p_response -> 'cards', p_response -> 'metadata', 'draft'
  );

  for v_step in
    select value from jsonb_array_elements(v_steps)
  loop
    insert into public.recommendation_course_steps (
      session_id, step_id, step_order, category, label,
      original_candidate_id, original_kakao_place_id,
      current_candidate_id, current_kakao_place_id,
      place_name, address, road_address, map_url,
      latitude, longitude, reason, locked
    ) values (
      v_session_id,
      v_step ->> 'stepId',
      (v_step ->> 'order')::smallint,
      v_step ->> 'category',
      v_step ->> 'label',
      v_step ->> 'candidateId',
      v_step ->> 'kakaoPlaceId',
      v_step ->> 'candidateId',
      v_step ->> 'kakaoPlaceId',
      v_step ->> 'name',
      coalesce(v_step ->> 'address', ''),
      coalesce(v_step ->> 'roadAddress', ''),
      coalesce(v_step ->> 'mapUrl', ''),
      (v_step ->> 'latitude')::double precision,
      (v_step ->> 'longitude')::double precision,
      v_step ->> 'reason',
      coalesce((v_step ->> 'locked')::boolean, false)
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

comment on table public.recommendation_sessions is
  'Owner-private editable recommendation drafts. DB is the source of truth; route params carry IDs only.';
comment on table public.recommendation_course_steps is
  'Normalized initial/current Kakao-backed course steps for a recommendation session.';
comment on table public.recommendation_step_events is
  'Append-only foundation for Phase 11 recommendation edit/visit/feedback events.';

commit;
