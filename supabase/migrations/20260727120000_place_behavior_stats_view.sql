-- 장소 행동 통계. 테이블+트리거가 아니라 뷰인 이유: 같은 날 발견한 tg_op 소문자 비교
-- 사고처럼 트리거는 조용히 0을 세도 아무도 모른다. 뷰는 매번 재계산되어 틀리면 즉시
-- 드러나고 검증할 상태가 없다. 51곳 규모에서 성능은 고려 대상이 아니며 느려지면 실체화한다.
-- 이번 범위에서는 뷰만 만들고 소비하지 않는다 — 임계치 확정은 다음 작업.
begin;

-- security_invoker: 뷰가 정의자 권한으로 RLS를 우회하지 않게 한다(advisor security_definer_view 경고 회피).
-- 소비자는 service_role뿐이고 service_role은 RLS를 통과하므로 결과는 동일하다.
create or replace view public.place_behavior_stats
with (security_invoker = true) as
with exposures as (
  select cs.current_kakao_place_id as kakao_place_id, cs.session_id, rs.couple_id, rs.status
  from public.recommendation_course_steps cs
  join public.recommendation_sessions rs on rs.id = cs.session_id
),
events as (
  select previous_kakao_place_id as kakao_place_id, event_type
  from public.recommendation_step_events
  where event_type in ('place_replaced', 'place_deleted')
    and previous_kakao_place_id is not null
)
select
  e.kakao_place_id,
  count(distinct e.session_id) as exposure_session_count,
  count(distinct e.couple_id) filter (where e.couple_id is not null) as distinct_couple_count,
  count(distinct e.session_id) filter (where e.status = 'confirmed') as confirmed_session_count,
  count(distinct e.couple_id) filter (where e.status = 'confirmed' and e.couple_id is not null) as confirmed_couple_count,
  (select count(*) from events ev where ev.kakao_place_id = e.kakao_place_id and ev.event_type = 'place_replaced') as replaced_count,
  (select count(*) from events ev where ev.kakao_place_id = e.kakao_place_id and ev.event_type = 'place_deleted') as deleted_count
from exposures e
group by e.kakao_place_id;

revoke all on public.place_behavior_stats from authenticated;
revoke all on public.place_behavior_stats from anon;

commit;
