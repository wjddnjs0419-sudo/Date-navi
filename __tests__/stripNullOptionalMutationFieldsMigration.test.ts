import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../supabase/migrations/20260829070000_strip_null_optional_mutation_fields.sql',
);

describe('null optional mutation field migration', () => {
  it('strips null Kakao links from both mutation response builders', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('jsonb_strip_nulls(jsonb_build_object(');
    expect(sql).toContain('v_steps');
    expect(sql).toContain('v_card_steps');
  });

  it('repairs derived card steps without changing authoritative place rows', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('update public.recommendation_sessions rs');
    expect(sql).toContain('recommendation_course_steps');
    expect(sql).not.toContain('update public.recommendation_course_steps');
  });
});
