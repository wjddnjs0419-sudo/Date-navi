-- 버그 수정: get_invite_inviter 가 빈 테이블 public.couples/profiles(0행)을 조회해 항상 NULL을
-- 반환하던 문제. 앱 실데이터는 date_planner_couples / date_planner_profiles 에 있다.
-- 테이블명만 교체, 컬럼·정규화 로직·권한은 20260724100000 과 동일. 실데이터 검증(LKKO→Claudia).
create or replace function public.get_invite_inviter(invite_code text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.display_name
  from public.date_planner_couples c
  join public.date_planner_profiles p on p.user_id = c.owner_user_id
  where upper(c.code) = regexp_replace(
    regexp_replace(upper(coalesce(invite_code, '')), '^DN-?', ''),
    '[^A-Z0-9]', '', 'g'
  )
  limit 1;
$$;

revoke all on function public.get_invite_inviter(text) from public;
grant execute on function public.get_invite_inviter(text) to anon, authenticated;
