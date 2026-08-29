import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../supabase/migrations/20260829020000_repair_recommendation_session_mutation.sql',
);

describe('recommendation session mutation repair migration', () => {
  it('uses a text-array jsonb path for provider identity extraction', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("$new$v_response #>> ARRAY['course', 'steps'");
    expect(sql).not.toContain(
      "set current_place_provider = case when v_uses_attestation then nullif(v_response #>> ('{course,steps,'",
    );
  });

  it('does not treat multiple missing Kakao IDs as a duplicate', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const duplicateCheck = sql.slice(sql.indexOf("group by next ->> 'kakaoPlaceId'"));

    expect(duplicateCheck).toContain("where next ->> 'kakaoPlaceId' is not null");
    expect(duplicateCheck).toContain("group by next ->> 'kakaoPlaceId'");
  });

  it('guards the patch and fails loudly when the deployed function shape is unexpected', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('pg_get_functiondef');
    expect(sql).toContain('execute v_definition');
    expect(sql).toContain("strpos(lower(v_definition), $bad$v_response #>> ('{course,steps,'$bad$) > 0");
    expect(sql).toMatch(/raise exception 'recommendation session mutation repair failed'/i);
  });
});
