-- 공유 링크 랜딩/OG가 초대코드로 "초대자 이름"만 익명 조회할 수 있게 하는 공개 RPC.
-- 노출은 오너의 display_name 문자열 하나뿐. couples/profiles 원본은 그대로 RLS 뒤에 둔다.
--
-- 매칭: couples.code 는 접두사 없는 본문("8K2P")으로 저장되지만, 공유 링크는 "DN-8K2P"로
-- 전달된다. 앱의 normalizeInviteCode/inviteCodeBody 와 동일하게 "DN-" 접두사와 비영숫자를
-- 제거해 본문끼리 비교한다.
create or replace function public.get_invite_inviter(invite_code text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.display_name
  from public.couples c
  join public.profiles p on p.user_id = c.owner_user_id
  where upper(c.code) = regexp_replace(
    regexp_replace(upper(coalesce(invite_code, '')), '^DN-?', ''),
    '[^A-Z0-9]', '', 'g'
  )
  limit 1;
$$;

-- 익명(anon)과 로그인 사용자만 실행 가능. 그 외 public 실행 권한은 회수.
revoke all on function public.get_invite_inviter(text) from public;
grant execute on function public.get_invite_inviter(text) to anon, authenticated;

comment on function public.get_invite_inviter(text) is
  '공유 링크 OG/랜딩용. 초대코드로 초대자 display_name 만 반환(익명 허용). 다른 필드 노출 없음.';
