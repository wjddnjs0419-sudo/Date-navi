import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('iOS app version policy rollback migration', () => {
  it('lowers the minimum version back to 1.0.1', () => {
    const migration = readFileSync(join(
      __dirname,
      '../supabase/migrations/20260827000000_lower_minimum_ios_version.sql',
    ), 'utf8');

    expect(migration).toContain("minimum_version = '1.0.1'");
    expect(migration).toContain("where platform = 'ios'");
  });
});
