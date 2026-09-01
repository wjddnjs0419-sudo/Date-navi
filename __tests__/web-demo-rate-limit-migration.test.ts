import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('web demo rate-limit migration contract', () => {
  const sql = readFileSync(join(
    process.cwd(),
    'supabase/migrations/20260901063933_web_demo_rate_limits.sql',
  ), 'utf8').toLowerCase();

  it('stores only hashed scopes and separates recommendation/location counters', () => {
    expect(sql).toContain('create table if not exists public.web_demo_usage');
    expect(sql).toContain("action text not null check (action in ('recommend', 'location_search'))");
    expect(sql).toContain("scope text not null check (scope in ('visitor', 'network', 'global'))");
    expect(sql).toContain("visitor_hash text not null check (visitor_hash ~ '^[a-f0-9]{64}$')");
    expect(sql).toContain("network_hash text not null check (network_hash ~ '^[a-f0-9]{64}$')");
    expect(sql).not.toMatch(/raw[_ ]?ip|user[_ ]?agent|free[_ ]?input/);
  });

  it('implements the requested limits, attempt semantics, stale lease, and owner-checked release', () => {
    expect(sql).toContain('p_visitor_limit integer default 3');
    expect(sql).toContain('p_network_limit integer default 30');
    expect(sql).toContain('p_stale_after_seconds integer default 120');
    expect(sql).toContain('p_attempt = 1');
    expect(sql).toContain("'web-demo:global:recommend'");
    expect(sql).toContain("'already_running'");
    expect(sql).toContain('where permit_id = p_permit_id and owner_token = p_owner_token');
    expect(sql).toContain('if p_outcome = \'failure\' then');
    expect(sql).toContain('p_visitor_limit integer default 60');
    expect(sql).toContain('p_network_limit integer default 300');
    expect(sql).toContain('p_global_limit integer default 3000');
  });

  it('restricts table and RPC access to service_role', () => {
    expect(sql).toContain('revoke all on public.web_demo_usage from public, anon, authenticated');
    expect(sql).toContain('revoke all on public.web_demo_permits from public, anon, authenticated');
    expect(sql).toContain('grant all on public.web_demo_usage to service_role');
    expect(sql).toContain('grant all on public.web_demo_permits to service_role');
    expect(sql).toContain('grant execute on function public.acquire_web_demo_permit');
    expect(sql).toContain('grant execute on function public.finish_web_demo_permit');
    expect(sql).toContain('grant execute on function public.consume_web_demo_location_quota');
  });
});
