-- 로그아웃 시 본인 push_tokens 행을 지울 수 있어야 계정-기기 매핑 오염(다른 계정 기기로
-- 오발송)을 막는다. 기존 정책은 insert/update/select뿐이라 delete가 RLS에 막혔다.
drop policy if exists "push_tokens_delete_self" on public.push_tokens;
create policy "push_tokens_delete_self" on public.push_tokens
  for delete to authenticated
  using (auth.uid() = user_id);

-- 2026-07-24 검증 때 등록된 행 정리: 3행 전부 동일한 개발 기기 토큰이라 실사용 매핑이
-- 아니다. 앱이 다음 실행에서 권한 확인 후 현재 기기 토큰을 재등록한다.
delete from public.push_tokens;
