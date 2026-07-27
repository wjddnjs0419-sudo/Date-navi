import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260727160000_candidate_pool_snapshots.sql'), 'utf8');

describe('candidate pool snapshot persistence migration', () => {
  it('validates the attested full ranked pool before initial session storage', () => {
    expect(sql).toContain('validate_candidate_pool_snapshot');
    expect(sql).toContain("v_response -> 'candidatePool'");
    expect(sql).toContain("raise invalid_parameter_value using message = 'invalid_candidate'");
  });

  it('stores the immutable response snapshot and retains it during later mutations', () => {
    expect(sql).toContain("v_response -> 'candidatePool', 'draft'");
    expect(sql).toContain('candidate_pool = candidate_pool,');
  });
});
