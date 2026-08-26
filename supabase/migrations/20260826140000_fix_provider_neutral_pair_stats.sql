begin;

-- Pair statistics are keyed by Kakao place ids. Provider-neutral/Naver-first
-- course steps intentionally leave current_kakao_place_id null, so they must
-- not be written to the Kakao-only statistics tables. A missing analytics
-- pair must never make course confirmation fail.
create or replace function public.aggregate_confirmed_place_pairs()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_couple_id text;
  v_source record;
  v_target record;
  v_new_couple boolean;
begin
  if new.event_type <> 'course_confirmed' then return new; end if;

  select couple_id into v_couple_id
  from public.recommendation_sessions
  where id = new.session_id;
  if v_couple_id is null then return new; end if;

  for v_source in
    select step_order, current_kakao_place_id
    from public.recommendation_course_steps
    where session_id = new.session_id
      and current_kakao_place_id is not null
    order by step_order
  loop
    for v_target in
      select step_order, current_kakao_place_id
      from public.recommendation_course_steps
      where session_id = new.session_id
        and step_order > v_source.step_order
        and current_kakao_place_id is not null
    loop
      -- Keep the provider check at the write boundary as well as in the
      -- source queries, so a future query change cannot reintroduce NULLs.
      if v_source.current_kakao_place_id is not null
        and v_target.current_kakao_place_id is not null then
        insert into public.place_pair_stat_couples(
          source_kakao_place_id,
          target_kakao_place_id,
          couple_id
        )
        values (
          v_source.current_kakao_place_id,
          v_target.current_kakao_place_id,
          v_couple_id
        )
        on conflict do nothing;
        v_new_couple := found;

        insert into public.place_pair_stats(
          source_kakao_place_id,
          target_kakao_place_id,
          confirmed_selection_count,
          unique_couple_count,
          last_confirmed_at
        )
        values (
          v_source.current_kakao_place_id,
          v_target.current_kakao_place_id,
          1,
          case when v_new_couple then 1 else 0 end,
          now()
        )
        on conflict (source_kakao_place_id, target_kakao_place_id) do update set
          confirmed_selection_count = public.place_pair_stats.confirmed_selection_count + 1,
          unique_couple_count = public.place_pair_stats.unique_couple_count
            + case when v_new_couple then 1 else 0 end,
          last_confirmed_at = excluded.last_confirmed_at,
          updated_at = now();
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

commit;
