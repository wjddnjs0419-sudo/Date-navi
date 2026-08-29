import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../supabase/migrations/20260829040000_sync_naver_kakao_link_on_attested_mutation.sql',
);

function readMigration(): string {
  return readFileSync(migrationPath, 'utf8');
}

describe('Naver Kakao link attested-state migration', () => {
  it('syncs the optional link only from an attested Naver response', () => {
    const sql = readMigration();

    expect(sql).toContain('current_kakao_link_place_id = case');
    expect(sql).toContain('when v_uses_attestation');
    expect(sql).toContain("= 'naver'");
    expect(sql).toContain("'kakaoPlaceId'");
    expect(sql).toContain("ARRAY['course', 'steps'");
  });

  it('clears the link for an attested Kakao response and preserves it for non-attested edits', () => {
    const sql = readMigration();

    expect(sql).toContain('when v_uses_attestation then null');
    expect(sql).toContain('else current_step.current_kakao_link_place_id');
    expect(sql).toContain('current_place_provider');
    expect(sql).toContain('current_provider_place_id');
  });

  it('requires the response migration first and fails closed on an unexpected function shape', () => {
    const sql = readMigration();

    expect(sql).toContain('pg_get_functiondef');
    expect(sql).toContain('v_before');
    expect(sql).toContain('execute v_definition');
    expect(sql).toContain('20260829030000');
    expect(sql).toMatch(/raise exception '[^']*(migration|patch)[^']*failed'/i);
  });
});
