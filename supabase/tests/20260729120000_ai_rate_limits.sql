begin;
select plan(13);

-- 테스트용 UUID는 auth.users FK 없이도 RPC의 동시성·경계 동작을 보려는 값이다.
-- Supabase test db는 postgres로 실행하므로 이 transaction 안에서만 FK trigger를 끈다.
set local session_replication_role = replica;

delete from public.ai_request_locks;
delete from public.ai_quota_buckets;

select is(
  (select acquired from public.acquire_ai_request_lock('00000000-0000-0000-0000-000000000001', 'course_generate', 'request-a', '2026-07-29T10:00:00Z')),
  true,
  'first lock acquisition wins'
);
select is(
  (select acquired from public.acquire_ai_request_lock('00000000-0000-0000-0000-000000000001', 'course_generate', 'request-b', '2026-07-29T10:00:01Z')),
  false,
  'live lock rejects a second request'
);
select is(
  (select retry_after_seconds from public.acquire_ai_request_lock('00000000-0000-0000-0000-000000000001', 'course_generate', 'request-b', '2026-07-29T10:00:01Z')),
  119,
  'live lock reports remaining seconds'
);
select public.release_ai_request_lock('00000000-0000-0000-0000-000000000001', 'course_generate', 'wrong-request');
select is(
  (select acquired from public.acquire_ai_request_lock('00000000-0000-0000-0000-000000000001', 'course_generate', 'request-b', '2026-07-29T10:00:01Z')),
  false,
  'a different request cannot release the lock'
);
select is(
  (select acquired from public.acquire_ai_request_lock('00000000-0000-0000-0000-000000000001', 'course_generate', 'request-b', '2026-07-29T10:02:00Z')),
  true,
  'expired lock is handed to the next request'
);

select is((select allowed from public.consume_ai_quota('00000000-0000-0000-0000-000000000002', 'course_generate', '2026-07-29T10:00:00Z')), true, 'burst attempt one is allowed');
select is((select allowed from public.consume_ai_quota('00000000-0000-0000-0000-000000000002', 'course_generate', '2026-07-29T10:00:01Z')), true, 'burst attempt two is allowed');
select is((select allowed from public.consume_ai_quota('00000000-0000-0000-0000-000000000002', 'course_generate', '2026-07-29T10:00:02Z')), true, 'burst attempt three is allowed');
select is(
  (select limit_type from public.consume_ai_quota('00000000-0000-0000-0000-000000000002', 'course_generate', '2026-07-29T10:00:03Z')),
  'burst',
  'fourth request is burst-limited'
);
select is(
  (select count(distinct bucket_type) from public.ai_quota_buckets where user_id = '00000000-0000-0000-0000-000000000002'),
  2::bigint,
  'every allowed call writes both quota buckets'
);
select is(
  (select allowed from public.consume_ai_quota('00000000-0000-0000-0000-000000000003', 'course_generate', '2026-07-29T14:59:59Z')),
  true,
  'request before Seoul midnight is allowed'
);
select is(
  (select allowed from public.consume_ai_quota('00000000-0000-0000-0000-000000000003', 'course_generate', '2026-07-29T15:00:00Z')),
  true,
  'request after Seoul midnight is allowed in a new daily bucket'
);
select is(
  (select count(*) from public.ai_quota_buckets where user_id = '00000000-0000-0000-0000-000000000003' and bucket_type = 'daily'),
  2::bigint,
  'Seoul midnight creates a second daily bucket'
);

select * from finish();
rollback;
