import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('get_recommendation_session float round-trip fix', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260716000100_get_recommendation_session_float_precision.sql'),
    'utf8',
  ).toLowerCase();

  it('raises extra_float_digits on get_recommendation_session so lat/lng round-trip losslessly', () => {
    expect(sql).toContain('alter function public.get_recommendation_session(text)');
    expect(sql).toContain('set extra_float_digits = 3');
  });
});
