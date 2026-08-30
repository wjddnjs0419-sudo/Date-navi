begin;

-- External course links are capabilities, not alternate primary keys. The
-- underlying date_cards row stays behind its existing couple-member RLS.
create table public.date_card_shares (
  id uuid primary key default gen_random_uuid(),
  card_id text not null references public.date_cards(id) on delete cascade,
  share_token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

comment on table public.date_card_shares is
  'Revocable capability tokens for minimal public date-card sharing.';

create unique index date_card_shares_one_active_per_card
  on public.date_card_shares (card_id)
  where revoked_at is null;

alter table public.date_card_shares enable row level security;

-- The table itself is intentionally not exposed through the Data API. Both
-- creation and public resolution go through narrowly scoped RPCs below.
revoke all on table public.date_card_shares from public, anon, authenticated;

create policy date_card_shares_member_select
on public.date_card_shares for select to authenticated
using (
  exists (
    select 1
    from public.date_cards dc
    join public.date_planner_couples c on c.id = dc.couple_id
    where dc.id = date_card_shares.card_id
      and (c.owner_user_id = (select auth.uid()) or c.partner_user_id = (select auth.uid()))
  )
);

create policy date_card_shares_member_insert
on public.date_card_shares for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.date_cards dc
    join public.date_planner_couples c on c.id = dc.couple_id
    where dc.id = date_card_shares.card_id
      and (c.owner_user_id = (select auth.uid()) or c.partner_user_id = (select auth.uid()))
  )
);

create policy date_card_shares_member_update
on public.date_card_shares for update to authenticated
using (
  exists (
    select 1
    from public.date_cards dc
    join public.date_planner_couples c on c.id = dc.couple_id
    where dc.id = date_card_shares.card_id
      and (c.owner_user_id = (select auth.uid()) or c.partner_user_id = (select auth.uid()))
  )
)
with check (revoked_at is not null);

-- Returns NULL for both a missing card and an unauthorized card, so callers
-- do not get an authorization oracle while still receiving a useful token.
create or replace function public.create_date_card_share(p_card_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_card_id text := nullif(btrim(p_card_id), '');
  v_share_token text;
begin
  if v_user is null or v_card_id is null then
    return null;
  end if;

  -- SECURITY DEFINER bypasses date_cards RLS, so membership must be checked
  -- explicitly inside the function body.
  if not exists (
    select 1
    from public.date_cards dc
    join public.date_planner_couples c on c.id = dc.couple_id
    where dc.id = v_card_id
      and (c.owner_user_id = v_user or c.partner_user_id = v_user)
  ) then
    return null;
  end if;

  select s.share_token
    into v_share_token
  from public.date_card_shares s
  where s.card_id = v_card_id
    and s.revoked_at is null
  limit 1;

  if v_share_token is not null then
    return v_share_token;
  end if;

  begin
    insert into public.date_card_shares (card_id, share_token, created_by)
    values (v_card_id, encode(extensions.gen_random_bytes(32), 'hex'), v_user)
    returning share_token into v_share_token;
  exception when unique_violation then
    -- A concurrent request may have won the one-active-share race.
    select s.share_token
      into v_share_token
    from public.date_card_shares s
    where s.card_id = v_card_id
      and s.revoked_at is null
    limit 1;
  end;

  return v_share_token;
end;
$$;

-- Revocation is available to authenticated couple members for future UI use;
-- no client currently exposes this action.
create or replace function public.revoke_date_card_share(p_card_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    return false;
  end if;

  update public.date_card_shares s
  set revoked_at = now()
  where s.card_id = nullif(btrim(p_card_id), '')
    and s.revoked_at is null
    and exists (
      select 1
      from public.date_cards dc
      join public.date_planner_couples c on c.id = dc.couple_id
      where dc.id = s.card_id
        and (c.owner_user_id = v_user or c.partner_user_id = v_user)
    );

  return found;
end;
$$;

-- This function is the only anonymous read path. It projects a deliberately
-- small DTO and rebuilds every step object instead of returning steps JSONB.
create or replace function public.get_public_shared_course(p_share_token text)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'title', c.title,
    'summary', c.summary,
    'estimated_time', c.estimated_time,
    'estimated_budget', c.estimated_budget,
    'steps', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'label', btrim(raw.step ->> 'label'),
            'desc', nullif(btrim(raw.step ->> 'desc'), ''),
            'place_name', nullif(btrim(raw.step ->> 'place_name'), '')
          ) order by raw.ordinality
        )
        from jsonb_array_elements(
          case
            when jsonb_typeof(c.steps) = 'array' then c.steps
            else '[]'::jsonb
          end
        ) with ordinality as raw(step, ordinality)
        where jsonb_typeof(raw.step) = 'object'
          and nullif(btrim(raw.step ->> 'label'), '') is not null
      ),
      case
        when nullif(btrim(c.place_name), '') is not null then jsonb_build_array(
          jsonb_build_object(
            'label', btrim(c.place_name),
            'place_name', btrim(c.place_name)
          )
        )
        else '[]'::jsonb
      end
    )
  )
  from public.date_card_shares s
  join public.date_cards c on c.id = s.card_id
  where s.share_token = nullif(btrim(p_share_token), '')
    and s.revoked_at is null
  limit 1;
$$;

revoke all on function public.create_date_card_share(text) from public, anon;
grant execute on function public.create_date_card_share(text) to authenticated;

revoke all on function public.revoke_date_card_share(text) from public, anon;
grant execute on function public.revoke_date_card_share(text) to authenticated;

revoke all on function public.get_public_shared_course(text) from public;
grant execute on function public.get_public_shared_course(text) to anon, authenticated;

comment on function public.create_date_card_share(text) is
  'Create or reuse one active cryptographically random share token for a couple member card.';
comment on function public.get_public_shared_course(text) is
  'Resolve a non-revoked course share token to a minimal public DTO; no raw card row is returned.';

commit;
