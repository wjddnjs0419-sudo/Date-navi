import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('latest_request drop replacement migration', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260718030000_latest_request_drop_replacement.sql'),
    'utf8',
  );

  it('redefines the mutation RPC so latest_request never retains the one-shot replacement field', () => {
    expect(sql).toContain('create or replace function public.apply_recommendation_session_mutation');
    // Both lockedSteps branches of the latest_request assignment must strip 'replacement'.
    const assignment = sql.slice(sql.indexOf('latest_request = case'));
    expect(assignment).toContain("- 'lockedSteps' - 'replacement'");
    expect(assignment).toMatch(/'\{lockedSteps\}', v_locked_steps\s*\)\s*-\s*'replacement'/);
  });

  it('repairs already-polluted sessions in the same migration', () => {
    expect(sql).toContain("set latest_request = latest_request - 'replacement'");
    expect(sql).toContain("where latest_request ? 'replacement'");
  });
});
