-- totalBudgetKRW는 2인 코스 총액, places.*_krw는 1인 장소당 금액이다.
-- 기존 관측 앵커가 2인·장소당으로 저장된 단위 오류를 정정하고 전체 원장을 재계산한다.
begin;

create or replace function public.recompute_place_observed_price(p_kakao_place_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_min integer; v_max integer; v_samples integer;
  v_min_samples integer; v_max_samples integer;
begin
  with couple_answers as (
    select distinct on (pf.couple_id)
      pf.price_level,
      round(((rs.original_request ->> 'totalBudgetKRW')::numeric)
        / 2
        / greatest((select count(*) from public.recommendation_course_steps cs where cs.session_id = pf.session_id), 1)
      )::integer as anchor_krw
    from public.place_feedback pf
    join public.recommendation_sessions rs on rs.id = pf.session_id
    where pf.kakao_place_id = p_kakao_place_id
      and pf.price_level is not null
      and pf.couple_id is not null
      and (rs.original_request ->> 'totalBudgetKRW') ~ '^[0-9]+$'
    order by pf.couple_id, pf.updated_at desc
  ),
  sorted as (
    select
      array_agg(anchor_krw order by anchor_krw) filter (where price_level = 3) as lowers,
      array_agg(anchor_krw order by anchor_krw) filter (where price_level = 1) as uppers,
      count(*)::integer as sample_count
    from couple_answers
  ),
  bounds as (
    select
      case when lowers is null then null else lowers[floor((array_length(lowers, 1) - 1) * 0.75)::integer + 1] end as min_krw,
      case when uppers is null then null else uppers[ceil((array_length(uppers, 1) - 1) * 0.25)::integer + 1] end as max_krw,
      sample_count,
      coalesce(array_length(lowers, 1), 0) as min_sample_count,
      coalesce(array_length(uppers, 1), 0) as max_sample_count
    from sorted
  )
  select
    case when b.min_krw is not null and b.max_krw is not null and b.min_krw > b.max_krw then null else b.min_krw end,
    case when b.min_krw is not null and b.max_krw is not null and b.min_krw > b.max_krw then null else b.max_krw end,
    b.sample_count, b.min_sample_count, b.max_sample_count
  into v_min, v_max, v_samples, v_min_samples, v_max_samples
  from bounds b;

  update public.places set
    observed_min_krw = v_min,
    observed_max_krw = v_max,
    observed_sample_count = coalesce(v_samples, 0),
    observed_min_sample_count = coalesce(v_min_samples, 0),
    observed_max_sample_count = coalesce(v_max_samples, 0),
    updated_at = now()
  where kakao_place_id = p_kakao_place_id;
end;
$$;
revoke all on function public.recompute_place_observed_price(text) from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select kakao_place_id from public.places loop
    perform public.recompute_place_observed_price(r.kakao_place_id);
  end loop;
end $$;

commit;
