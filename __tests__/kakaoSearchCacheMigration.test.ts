import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('kakao_search_cache migration', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260718020000_kakao_search_cache.sql'),
    'utf8',
  ).toLowerCase();

  it('creates a service-role-only cache table keyed by cache_key', () => {
    expect(sql).toContain('create table if not exists public.kakao_search_cache');
    expect(sql).toContain('cache_key text primary key');
    expect(sql).toContain('documents jsonb not null');
    expect(sql).toContain('fetched_at timestamptz not null default now()');
    expect(sql).toContain('alter table public.kakao_search_cache enable row level security');
    expect(sql).toContain('revoke all on table public.kakao_search_cache from anon, authenticated');
    expect(sql).not.toContain('create policy');
    expect(sql).toContain('create index if not exists kakao_search_cache_fetched_at_idx on public.kakao_search_cache (fetched_at)');
  });

  it('extends purge_expired_ai_data with the 30-day cache purge while keeping existing purges', () => {
    expect(sql).toContain("delete from public.recommendation_generation_attestations where created_at < now() - interval '30 days'");
    expect(sql).toContain("delete from public.ai_recommendation_logs where created_at < now() - interval '30 days'");
    expect(sql).toContain("delete from public.kakao_search_cache where fetched_at < now() - interval '30 days'");
  });
});
