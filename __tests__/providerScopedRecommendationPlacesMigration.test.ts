import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260818010000_provider_scoped_recommendation_places.sql',
);

describe('provider-scoped recommendation place migration', () => {
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

  it('adds provider and provider-place-id columns without removing legacy Kakao columns', () => {
    expect(sql).toContain('add column if not exists original_place_provider text');
    expect(sql).toContain('add column if not exists original_provider_place_id text');
    expect(sql).toContain('add column if not exists current_place_provider text');
    expect(sql).toContain('add column if not exists current_provider_place_id text');
    expect(sql).not.toMatch(/drop\s+column\s+.*kakao_place_id/);
    expect(sql).not.toMatch(/rename\s+column\s+.*kakao_place_id/);
  });

  it('backfills existing Kakao rows and constrains only provider-scoped tuples', () => {
    expect(sql).toContain("set original_place_provider = 'kakao'");
    expect(sql).toContain('original_provider_place_id = original_kakao_place_id');
    expect(sql).toContain("set current_place_provider = 'kakao'");
    expect(sql).toContain('current_provider_place_id = current_kakao_place_id');
    expect(sql).toContain("in ('kakao', 'naver')");
    expect(sql).toContain('recommendation_course_steps_current_provider_place_identity_key');
  });

  it('keeps the legacy Kakao values synchronized for Kakao writes only', () => {
    expect(sql).toContain('sync_recommendation_course_step_provider_identity');
    expect(sql).toContain("new.current_place_provider = 'kakao'");
    expect(sql).toContain('new.current_kakao_place_id := new.current_provider_place_id');
    expect(sql).toContain("new.current_place_provider = 'naver'");
    expect(sql).toContain('new.current_kakao_place_id := null');
  });
});
