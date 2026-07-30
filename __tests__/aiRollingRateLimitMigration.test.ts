import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('rolling AI burst-limit migration', () => {
  const migration = () => readFileSync(join(process.cwd(), 'supabase/migrations/20260730010000_ai_rolling_burst_limit.sql'), 'utf8');
  const canonical = () => readFileSync(join(process.cwd(), 'docs/supabase-schema.sql'), 'utf8');

  it.each([['migration', migration], ['canonical', canonical]])('%s records successful consumptions for a rolling 5-minute window', (_label, read) => {
    const sql = read();
    expect(sql).toContain('create table if not exists public.ai_quota_consumptions');
    expect(sql).toContain("p_now - interval '5 minutes'");
    expect(sql).toContain('min(consumed_at)');
    expect(sql).toContain('insert into public.ai_quota_consumptions');
  });
});
