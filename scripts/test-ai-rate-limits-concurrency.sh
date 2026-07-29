#!/usr/bin/env bash
set -euo pipefail

db_container="supabase_db_Codex_sample"
fixture_id="00000000-0000-0000-0000-000000000009"
lock_id="92001"
tmp_dir="$(mktemp -d)"
cleanup() {
  docker exec "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "delete from auth.users where id = '$fixture_id'" >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

docker exec "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('$fixture_id','authenticated','authenticated','ai-rate-concurrency@example.test','', '{}'::jsonb, '{}'::jsonb, now(), now()) on conflict (id) do nothing" >/dev/null
docker exec "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "delete from public.ai_request_locks where user_id = '$fixture_id'; delete from public.ai_quota_buckets where user_id = '$fixture_id'" >/dev/null

docker exec "$db_container" psql -U postgres -d postgres -Atqc "select pg_advisory_lock($lock_id); select pg_sleep(1); select pg_advisory_unlock($lock_id)" >/dev/null &
barrier_pid=$!
sleep 0.1
for index in 1 2; do
  docker exec "$db_container" psql -U postgres -d postgres -Atqc "with barrier as materialized (select pg_advisory_xact_lock($lock_id)) select acquired from barrier cross join lateral public.acquire_ai_request_lock('$fixture_id','course_generate','lock-$index','2026-07-29T12:00:00Z')" >"$tmp_dir/lock-$index" &
done
wait "$barrier_pid"
wait
[[ "$(grep -h '^t$' "$tmp_dir"/lock-* | wc -l | tr -d ' ')" == "1" ]]

docker exec "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "delete from public.ai_request_locks where user_id = '$fixture_id'; delete from public.ai_quota_buckets where user_id = '$fixture_id'" >/dev/null
docker exec "$db_container" psql -U postgres -d postgres -Atqc "select pg_advisory_lock($lock_id); select pg_sleep(1); select pg_advisory_unlock($lock_id)" >/dev/null &
barrier_pid=$!
sleep 0.1
for index in 1 2 3 4; do
  docker exec "$db_container" psql -U postgres -d postgres -Atqc "with barrier as materialized (select pg_advisory_xact_lock($lock_id)) select allowed from barrier cross join lateral public.consume_ai_quota('$fixture_id','course_generate','2026-07-29T12:00:00Z')" >"$tmp_dir/quota-$index" &
done
wait "$barrier_pid"
wait
[[ "$(grep -h '^t$' "$tmp_dir"/quota-* | wc -l | tr -d ' ')" == "3" ]]
