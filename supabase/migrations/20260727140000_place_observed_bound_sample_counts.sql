-- 관측 임계치(표본 3건)는 "구간을 만든 답변 수"에 걸려야 한다. 직전 버전의
-- observed_sample_count는 가격을 답한 전체(보통 포함)를 세어, 보통 2건 + 비쌈 1건이면
-- 임계치를 통과시키고 하한이 단 한 사람의 앵커가 됐다. 경계별 표본 수를 따로 센다.
begin;

alter table public.places
  add column if not exists observed_min_sample_count integer not null default 0
    check (observed_min_sample_count >= 0),
  add column if not exists observed_max_sample_count integer not null default 0
    check (observed_max_sample_count >= 0);

comment on column public.places.observed_min_sample_count is
  '하한을 만든 "비쌈"(price_level=3) 답변 수. 소비 임계치는 이 값에 건다.';
comment on column public.places.observed_max_sample_count is
  '상한을 만든 "저렴"(price_level=1) 답변 수.';
comment on column public.places.observed_sample_count is
  '가격을 답한 커플 총수(보통 포함). 관측 가용 판정이 아니라 관측량 지표로만 쓴다.';

create or replace function public.recompute_place_observed_price(p_kakao_place_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_min integer; v_max integer; v_samples integer;
  v_min_samples integer; v_max_samples integer;
begin
  with couple_answers as (
    -- 커플당 최신 가격 답변 1건 = 1표본. 예산이 있는 세션만 앵커를 만들 수 있다.
    select distinct on (pf.couple_id)
      pf.price_level,
      round(((rs.original_request ->> 'totalBudgetKRW')::numeric)
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
    -- postgres 배열은 1-based라 TS의 0-based 인덱스에 +1.
    select
      case when lowers is null then null
        else lowers[floor((array_length(lowers, 1) - 1) * 0.75)::integer + 1] end as min_krw,
      case when uppers is null then null
        else uppers[ceil((array_length(uppers, 1) - 1) * 0.25)::integer + 1] end as max_krw,
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
revoke all on function public.recompute_place_observed_price(text) from public;
revoke all on function public.recompute_place_observed_price(text) from authenticated;
revoke all on function public.recompute_place_observed_price(text) from anon;

-- 기존 행 재계산: 새 컬럼이 0으로 남으면 이미 쌓인 관측이 영구히 무시된다.
do $$
declare r record;
begin
  for r in select kakao_place_id from public.places loop
    perform public.recompute_place_observed_price(r.kakao_place_id);
  end loop;
end $$;

commit;
