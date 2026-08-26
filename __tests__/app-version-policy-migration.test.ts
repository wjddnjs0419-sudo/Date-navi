import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('iOS app version policy migration', () => {
  it('raises the enforced minimum version to 1.0.2', () => {
    const migration = readFileSync(join(
      __dirname,
      '../supabase/migrations/20260826120000_raise_minimum_ios_version.sql',
    ), 'utf8');

    expect(migration).toContain("minimum_version = '1.0.2'");
    expect(migration).toContain("where platform = 'ios'");
  });
});
