begin;
select plan(13);

set local session_replication_role = replica;

delete from public.date_card_shares where card_id = 'share-test-card';
delete from public.date_cards where id = 'share-test-card';
delete from public.date_planner_couples where id = 'share-test-couple';

insert into public.date_planner_couples (
  id, code, owner_user_id, partner_user_id, status
) values (
  'share-test-couple', 'SHARETEST',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002', 'linked'
);

insert into public.date_cards (
  id, couple_id, created_by, mode, title, summary,
  estimated_time, estimated_budget, tags, steps
) values (
  'share-test-card', 'share-test-couple',
  '00000000-0000-0000-0000-000000000001', 'make_course',
  '공개 코스', '공개 설명', '총 3시간', '5만원대',
  array['내부 검색어처럼 보일 수 있는 태그'],
  '[{"label":"식사","desc":"첫 번째","place_name":"공개 식당","candidateId":"candidate-secret","kakaoPlaceId":"kakao-secret"},{"label":"카페","place_name":"공개 카페","request_id":"request-secret"}]'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

select set_config('test.share_token', public.create_date_card_share('share-test-card'), true);
select ok(current_setting('test.share_token') ~ '^[0-9a-f]{64}$', 'couple member can create a cryptographically random token');
select is(public.create_date_card_share('share-test-card'), current_setting('test.share_token'), 'active token is reused');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select is(public.create_date_card_share('share-test-card'), null, 'a different couple user cannot create a share');
select is((select count(*) from public.date_cards where id = 'share-test-card'), 0::bigint, 'a different couple user cannot directly select the card');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select ok(public.get_public_shared_course(current_setting('test.share_token')) is not null, 'anonymous user can resolve a valid token');
select is(public.get_public_shared_course('not-a-real-share-token'), null, 'invalid token is not found');
select ok(not (public.get_public_shared_course(current_setting('test.share_token')) ? 'couple_id'), 'public DTO has no couple_id');
select ok(not (public.get_public_shared_course(current_setting('test.share_token')) ? 'created_by'), 'public DTO has no created_by');
select ok(not (public.get_public_shared_course(current_setting('test.share_token')) ? 'request_id'), 'public DTO has no request_id');
select ok(not (public.get_public_shared_course(current_setting('test.share_token')) -> 'steps' -> 0 ? 'candidateId'), 'public steps have no candidateId');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is(public.revoke_date_card_share('share-test-card'), true, 'a couple member can revoke a share');

set local role anon;
select is(public.get_public_shared_course(current_setting('test.share_token')), null, 'revoked token is not found');
select is(public.get_public_shared_course('not-a-real-share-token'), null, 'invalid and revoked tokens have the same not-found result');

select * from finish();
rollback;
