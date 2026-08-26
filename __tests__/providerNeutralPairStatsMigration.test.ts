import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('provider-neutral pair statistics migration', () => {
  const migration = readFileSync(
    join(__dirname, '../supabase/migrations/20260826140000_fix_provider_neutral_pair_stats.sql'),
    'utf8',
  ).toLowerCase();

  it('skips pair aggregation when either step has no Kakao place id', () => {
    expect(migration).toContain('create or replace function public.aggregate_confirmed_place_pairs()');
    expect(migration).toMatch(/current_kakao_place_id\s+is\s+not\s+null/);
    expect(migration).toContain('v_source.current_kakao_place_id is not null');
    expect(migration).toContain('v_target.current_kakao_place_id is not null');
  });
});
