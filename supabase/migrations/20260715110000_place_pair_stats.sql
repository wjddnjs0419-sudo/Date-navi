begin;

create table if not exists public.place_pair_stats (
  source_kakao_place_id text not null,
  target_kakao_place_id text not null,
  confirmed_selection_count integer not null default 0 check (confirmed_selection_count >= 0),
  unique_couple_count integer not null default 0 check (unique_couple_count >= 0),
  last_confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (source_kakao_place_id, target_kakao_place_id),
  check (source_kakao_place_id <> target_kakao_place_id)
);
create table if not exists public.place_pair_stat_couples (
  source_kakao_place_id text not null,
  target_kakao_place_id text not null,
  couple_id text not null references public.date_planner_couples(id) on delete cascade,
  first_confirmed_at timestamptz not null default now(),
  primary key (source_kakao_place_id, target_kakao_place_id, couple_id)
);
alter table public.place_pair_stats enable row level security;
alter table public.place_pair_stat_couples enable row level security;
revoke all on public.place_pair_stats from authenticated;
revoke all on public.place_pair_stat_couples from authenticated;

create or replace function public.aggregate_confirmed_place_pairs()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_couple_id text; v_source record; v_target record; v_new_couple boolean;
begin
  if new.event_type <> 'course_confirmed' then return new; end if;
  select couple_id into v_couple_id from public.recommendation_sessions where id = new.session_id;
  if v_couple_id is null then return new; end if;
  for v_source in select step_order, current_kakao_place_id from public.recommendation_course_steps where session_id = new.session_id order by step_order loop
    for v_target in select step_order, current_kakao_place_id from public.recommendation_course_steps where session_id = new.session_id and step_order > v_source.step_order order by step_order loop
      insert into public.place_pair_stat_couples(source_kakao_place_id,target_kakao_place_id,couple_id)
        values (v_source.current_kakao_place_id,v_target.current_kakao_place_id,v_couple_id)
        on conflict do nothing;
      v_new_couple := found;
      insert into public.place_pair_stats(source_kakao_place_id,target_kakao_place_id,confirmed_selection_count,unique_couple_count,last_confirmed_at)
        values (v_source.current_kakao_place_id,v_target.current_kakao_place_id,1,case when v_new_couple then 1 else 0 end,now())
        on conflict (source_kakao_place_id,target_kakao_place_id) do update set
          confirmed_selection_count = public.place_pair_stats.confirmed_selection_count + 1,
          unique_couple_count = public.place_pair_stats.unique_couple_count + case when v_new_couple then 1 else 0 end,
          last_confirmed_at = excluded.last_confirmed_at, updated_at = now();
    end loop;
  end loop;
  return new;
end;
$$;
drop trigger if exists recommendation_confirmed_pair_aggregate on public.recommendation_step_events;
create trigger recommendation_confirmed_pair_aggregate after insert on public.recommendation_step_events
  for each row when (new.event_type = 'course_confirmed') execute function public.aggregate_confirmed_place_pairs();

create or replace function public.get_place_pair_label(p_source_kakao_place_id text, p_target_kakao_place_id text)
returns text language sql security definer set search_path = public, pg_temp stable as $$
  select case when coalesce(unique_couple_count, 0) >= 10 and coalesce(confirmed_selection_count, 0) >= 15
    then 'often_selected_together' else 'fits_this_course' end
  from (select 1) seed left join public.place_pair_stats s on s.source_kakao_place_id = p_source_kakao_place_id and s.target_kakao_place_id = p_target_kakao_place_id;
$$;
revoke all on function public.get_place_pair_label(text,text) from public;
grant execute on function public.get_place_pair_label(text,text) to authenticated;

commit;
