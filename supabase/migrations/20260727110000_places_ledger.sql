-- 장소 지식 원장: 세션 수명과 무관하게 살아남는 장소별 신원 스냅샷 + 가격 두 계층.
-- 추정(AI)과 관측(리뷰)은 절대 같은 컬럼에 섞지 않는다(스펙 §2).
begin;

create table if not exists public.places (
  kakao_place_id text primary key check (length(btrim(kakao_place_id)) > 0),
  place_name text not null check (length(btrim(place_name)) > 0),
  address text not null default '',
  road_address text not null default '',
  map_url text not null default '',
  category_group_code text not null default '',
  category_name text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  -- 추정 계층(AI, 1인 기준 원 단위 범위)
  estimated_min_krw integer check (estimated_min_krw >= 0),
  estimated_max_krw integer check (estimated_max_krw >= 0),
  estimated_at timestamptz,
  estimate_model text,
  -- 관측 계층(리뷰 유래)
  observed_min_krw integer check (observed_min_krw >= 0),
  observed_max_krw integer check (observed_max_krw >= 0),
  observed_sample_count integer not null default 0 check (observed_sample_count >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estimated_min_krw is null or estimated_max_krw is null or estimated_min_krw <= estimated_max_krw),
  check (observed_min_krw is null or observed_max_krw is null or observed_min_krw <= observed_max_krw)
);
comment on table public.places is
  '장소 지식 원장. 신원 스냅샷은 표시용 최소한이며 오래되면 재조회 갱신. service_role 전용.';

alter table public.places enable row level security;
revoke all on public.places from authenticated;
revoke all on public.places from anon;

alter table public.place_feedback
  add column if not exists price_level smallint
  check (price_level is null or price_level between 1 and 3);
comment on column public.place_feedback.price_level is '1=저렴, 2=보통, 3=비쌈. 행동으로 드러나지 않아 직접 묻는 유일한 항목.';

-- 무응답(null)과 부정(false)을 구별한다. revisit 태그 유무로 역추적하면 "별로였다"와
-- "만족도는 말 안 하고 가격만 답했다"가 같은 모양이 되어, 후자가 만족도를 깎는다.
alter table public.place_feedback add column if not exists satisfaction boolean;
comment on column public.place_feedback.satisfaction is
  'null=무응답(집계 제외), true=좋았음, false=별로. 만족도 비율은 non-null만 분모로 센다.';

-- 관측 범위 재계산: 커플 단위 중복 제거 후, 예산÷장소수 앵커의 부등식들을 안쪽 백분위로 좁힌다.
-- 백분위 선택과 모순 시 폐기는 shared/recommendation/place-price.ts와 동일 규칙(정본은 TS 테스트).
-- 보간형 백분위 집계는 쓸 수 없다 — 이상치를 부분적으로 섞어 구간을 붕괴시킨다.
-- 비보간형(disc) 집계도 규칙이 다르므로(N=3, f=0.75에서 최댓값 선택) 인덱스를 직접 계산한다:
-- 하한은 floor((n-1)*0.75), 상한은 ceil((n-1)*0.25) — 둘 다 이상치 반대 방향.
create or replace function public.recompute_place_observed_price(p_kakao_place_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_min integer; v_max integer; v_samples integer;
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
      sample_count
    from sorted
  )
  select
    case when b.min_krw is not null and b.max_krw is not null and b.min_krw > b.max_krw then null else b.min_krw end,
    case when b.min_krw is not null and b.max_krw is not null and b.min_krw > b.max_krw then null else b.max_krw end,
    b.sample_count
  into v_min, v_max, v_samples
  from bounds b;

  update public.places set
    observed_min_krw = v_min,
    observed_max_krw = v_max,
    observed_sample_count = coalesce(v_samples, 0),
    updated_at = now()
  where kakao_place_id = p_kakao_place_id;
end;
$$;
revoke all on function public.recompute_place_observed_price(text) from public;

-- 기존 owner 전용 4-인자 버전을 6-인자(가격·만족도 포함, 커플 멤버 허용)로 교체.
-- 같은 이름의 다른 인자 수 함수가 남으면 PostgREST rpc 해석이 모호해지므로 명시적으로 drop.
drop function if exists public.record_recommendation_place_feedback(text,text,boolean,text[]);
create or replace function public.record_recommendation_place_feedback(
  p_session_id text, p_step_id text, p_visited boolean,
  p_tags text[] default '{}'::text[], p_price_level smallint default null,
  p_satisfaction boolean default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid := auth.uid(); v_session public.recommendation_sessions%rowtype; v_place text;
begin
  if v_owner is null then raise insufficient_privilege using message = 'not authenticated'; end if;
  select * into v_session from public.recommendation_sessions where id = p_session_id;
  -- 리뷰는 커플 활동이다: 세션 생성자뿐 아니라 커플 상대도 장소 등급을 남길 수 있어야 한다.
  if not found or v_session.status <> 'confirmed'
    or (v_session.owner_user_id <> v_owner
      and (v_session.couple_id is null or not public.is_couple_member(v_session.couple_id))) then
    raise check_violation using message = 'constraint_violation';
  end if;
  select current_kakao_place_id into v_place from public.recommendation_course_steps
    where session_id = p_session_id and step_id = p_step_id;
  if v_place is null
    or coalesce(p_tags, '{}'::text[]) <@ array['conversation','quiet','noisy','value','expensive','photos','revisit','crowded']::text[] is false
    or (p_price_level is not null and p_price_level not between 1 and 3) then
    raise invalid_parameter_value using message = 'invalid_candidate';
  end if;
  insert into public.place_feedback(session_id,step_id,kakao_place_id,owner_user_id,couple_id,visited,tags,price_level,satisfaction)
    values (p_session_id,p_step_id,v_place,v_owner,v_session.couple_id,p_visited,coalesce(p_tags,'{}'::text[]),p_price_level,p_satisfaction)
    on conflict (session_id,step_id,owner_user_id) do update
      set visited=excluded.visited,tags=excluded.tags,price_level=excluded.price_level,
          satisfaction=excluded.satisfaction,updated_at=now();
  perform public.write_recommendation_step_event(p_session_id,p_step_id,
    case when p_visited then 'place_visited' else 'feedback_submitted' end,v_place,v_place);
  -- 부가 기록(관측 범위 갱신)은 원본 쓰기를 절대 되돌리지 않는다(스펙 오류 처리).
  begin
    perform public.recompute_place_observed_price(v_place);
  exception when others then null;
  end;
end;
$$;
revoke all on function public.record_recommendation_place_feedback(text,text,boolean,text[],smallint,boolean) from public;
grant execute on function public.record_recommendation_place_feedback(text,text,boolean,text[],smallint,boolean) to authenticated;

-- 리뷰 화면이 카드에서 코스 장소 목록을 읽는 통로. 세션 select RLS가 owner 전용이라
-- 파트너는 직접 조회가 불가능하므로 security definer + 커플 멤버 검사로 연다.
create or replace function public.get_course_places_for_review(p_card_id text)
returns table (session_id text, step_id text, step_order smallint, place_name text, kakao_place_id text)
language sql security definer set search_path = public, pg_temp stable as $$
  select cs.session_id, cs.step_id, cs.step_order, cs.place_name, cs.current_kakao_place_id
  from public.recommendation_sessions rs
  join public.recommendation_course_steps cs on cs.session_id = rs.id
  where rs.confirmed_card_id = p_card_id
    and rs.status = 'confirmed'
    and (rs.owner_user_id = auth.uid()
      or (rs.couple_id is not null and public.is_couple_member(rs.couple_id)))
  order by cs.step_order;
$$;
revoke all on function public.get_course_places_for_review(text) from public;
grant execute on function public.get_course_places_for_review(text) to authenticated;

-- generate-ai의 새 액션 로깅 허용. 허용 목록은 실 DB 실측(5종) + 코드가 이미 쓰지만
-- 제약에 없어 로그 insert가 실패하던 parse_step_intents + 신규 estimate_place_price.
alter table public.ai_recommendation_logs drop constraint if exists ai_recommendation_logs_action_check;
alter table public.ai_recommendation_logs add constraint ai_recommendation_logs_action_check
  check (action in ('cards','feeling_select','course_select','recommend_date_select','replacement_select','parse_step_intents','estimate_place_price'));

commit;
