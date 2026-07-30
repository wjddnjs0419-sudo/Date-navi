import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('place price estimation claim migration', () => {
  const migration = () => readFileSync(join(process.cwd(), 'supabase/migrations/20260729130000_place_price_estimation_claim.sql'), 'utf8');
  const canonical = () => readFileSync(join(process.cwd(), 'docs/supabase-schema.sql'), 'utf8');

  it.each([['migration', migration], ['canonical', canonical]])('%s defines an expiring service-role claim boundary', (_label, read) => {
    const sql = read();
    for (const column of ['price_estimation_status', 'price_estimation_claim_id', 'price_estimation_claimed_at']) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("interval '2 minutes'");
    for (const fn of ['claim_place_price_estimation', 'complete_place_price_estimation', 'release_place_price_estimation_claim']) {
      expect(sql).toContain(`create or replace function public.${fn}`);
      expect(sql).toContain(`revoke all on function public.${fn}`);
      expect(sql).toContain(`grant execute on function public.${fn}`);
    }
  });
});
