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
