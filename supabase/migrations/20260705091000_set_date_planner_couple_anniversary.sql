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
