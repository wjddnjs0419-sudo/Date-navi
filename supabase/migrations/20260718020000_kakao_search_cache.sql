begin;

-- Cross-user Kakao search result cache (30-day TTL, service-role only).
-- Readers filter on fetched_at, so correctness does not depend on the purge scheduler.
create table if not exists public.kakao_search_cache (
  cache_key text primary key,
  endpoint text not null check (endpoint in ('category', 'keyword')),
  category_code text,
  query_text text,
  grid_latitude double precision not null,
  grid_longitude double precision not null,
  page integer not null check (page between 1 and 3),
  documents jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists kakao_search_cache_fetched_at_idx on public.kakao_search_cache (fetched_at);

alter table public.kakao_search_cache enable row level security;
revoke all on table public.kakao_search_cache from anon, authenticated;

create or replace function public.purge_expired_ai_data()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.recommendation_generation_attestations where created_at < now() - interval '30 days';
  delete from public.ai_recommendation_logs where created_at < now() - interval '30 days';
  delete from public.kakao_search_cache where fetched_at < now() - interval '30 days';
end;
$$;
revoke all on function public.purge_expired_ai_data() from public;

commit;
