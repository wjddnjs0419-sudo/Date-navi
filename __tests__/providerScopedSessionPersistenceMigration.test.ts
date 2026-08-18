import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260818020000_provider_scoped_session_persistence.sql',
);

describe('provider-scoped session persistence migration', () => {
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

  it('permits provider-scoped Naver rows without fabricating Kakao IDs', () => {
    expect(sql).toContain('alter column original_kakao_place_id drop not null');
    expect(sql).toContain('alter column current_kakao_place_id drop not null');
    expect(sql).toContain("case when v_provider='kakao' then v_provider_place_id end");
  });

  it('requires a valid provider tuple in both pool snapshots and persisted steps', () => {
    expect(sql).toContain("v_provider not in ('kakao','naver')");
    expect(sql).toContain("v_provider := coalesce(v_step #>> '{placeidentity,provider}'");
    expect(sql).toContain('original_place_provider,original_provider_place_id');
    expect(sql).toContain('current_place_provider,current_provider_place_id');
  });
});
