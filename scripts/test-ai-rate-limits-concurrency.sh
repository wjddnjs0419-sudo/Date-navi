#!/usr/bin/env bash
set -euo pipefail

db_container="${SUPABASE_DB_CONTAINER:-supabase_db_Codex_sample}"
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

start_barrier() {
  local pid_file="$1"
  docker exec "$db_container" psql -U postgres -d postgres -Atqc "select pg_advisory_lock($lock_id); select pg_backend_pid(); select pg_sleep(30)" >"$pid_file" &
}
wait_for_waiters() {
  local expected="$1"
  local count
  for _ in $(seq 1 100); do
    count="$(docker exec "$db_container" psql -U postgres -d postgres -Atqc "select count(*) from pg_locks where locktype = 'advisory' and objid = $lock_id and granted = false")"
    [[ "$count" == "$expected" ]] && return 0
    sleep 0.05
  done
  return 1
}
release_barrier() {
  local pid_file="$1"
  local backend_pid
  for _ in $(seq 1 100); do
    backend_pid="$(grep -E '^[0-9]+$' "$pid_file" 2>/dev/null | head -n 1 || true)"
    [[ "$backend_pid" =~ ^[0-9]+$ ]] && break
    sleep 0.05
  done
  [[ "$backend_pid" =~ ^[0-9]+$ ]]
  docker exec "$db_container" psql -U postgres -d postgres -Atqc "select pg_terminate_backend($backend_pid)" | grep -qx 't'
}

start_barrier "$tmp_dir/lock-barrier-pid"
barrier_pid=$!
for index in 1 2; do
  docker exec "$db_container" psql -U postgres -d postgres -Atqc "with barrier as materialized (select pg_advisory_xact_lock($lock_id)) select acquired from barrier cross join lateral public.acquire_ai_request_lock('$fixture_id','course_generate','lock-$index','2026-07-29T12:00:00Z')" >"$tmp_dir/lock-$index" &
done
wait_for_waiters 2
release_barrier "$tmp_dir/lock-barrier-pid"
wait "$barrier_pid" || true
wait
[[ "$(grep -h '^t$' "$tmp_dir"/lock-* | wc -l | tr -d ' ')" == "1" ]]

docker exec "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "delete from public.ai_request_locks where user_id = '$fixture_id'; delete from public.ai_quota_buckets where user_id = '$fixture_id'" >/dev/null
start_barrier "$tmp_dir/quota-barrier-pid"
barrier_pid=$!
for index in 1 2 3 4; do
  docker exec "$db_container" psql -U postgres -d postgres -Atqc "with barrier as materialized (select pg_advisory_xact_lock($lock_id)) select allowed from barrier cross join lateral public.consume_ai_quota('$fixture_id','course_generate','2026-07-29T12:00:00Z')" >"$tmp_dir/quota-$index" &
done
wait_for_waiters 4
release_barrier "$tmp_dir/quota-barrier-pid"
wait "$barrier_pid" || true
wait
[[ "$(grep -h '^t$' "$tmp_dir"/quota-* | wc -l | tr -d ' ')" == "3" ]]
