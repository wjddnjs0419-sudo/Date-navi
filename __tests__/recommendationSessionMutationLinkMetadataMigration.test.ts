import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../supabase/migrations/20260829030000_preserve_naver_kakao_link_in_mutation_response.sql',
);

function readMigration(): string {
  return readFileSync(migrationPath, 'utf8');
}

describe('Naver Kakao link mutation response migration', () => {
  it('serializes the provider-specific legacy kakaoPlaceId in both response builders', () => {
    const sql = readMigration();

    expect(sql).toContain("case when current_place_provider = 'naver'");
    expect(sql).toContain('then current_kakao_link_place_id');
    expect(sql).toContain('else current_kakao_place_id');
    expect(sql).toContain('v_steps');
    expect(sql).toContain('v_card_steps');
  });

  it('keeps the patch scoped to response serialization and preserves identity fields', () => {
    const sql = readMigration();

    expect(sql).toContain('pg_get_functiondef');
    expect(sql).toContain('execute v_definition');
    expect(sql).toMatch(/raise exception '[^']*(migration|patch)[^']*failed'/i);
    expect(sql).toContain('placeIdentity');
    expect(sql).not.toContain('set current_place_provider');
    expect(sql).not.toContain('set current_provider_place_id');
    expect(sql).not.toContain('lockedSteps');
    expect(sql).not.toContain('recommendationRequestSchema');
  });

  it('is guarded and idempotent against an unexpected deployed function shape', () => {
    const sql = readMigration();

    expect(sql).toContain('v_before');
    expect(sql).toMatch(/if position\([^\n]+\) > 0[\s\S]*?return;/i);
    expect(sql).toMatch(/if v_definition = v_before[\s\S]*?raise exception/i);
  });
});
