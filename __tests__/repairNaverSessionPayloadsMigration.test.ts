import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../supabase/migrations/20260829060000_repair_naver_session_payloads.sql',
);

describe('Naver session payload repair migration', () => {
  it('rebuilds derived card identity fields from authoritative step rows', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('recommendation_course_steps');
    expect(sql).toContain("current_place_provider = 'naver'");
    expect(sql).toContain("'placeIdentity', case when cs.current_place_provider is not null");
    expect(sql).toContain('current_kakao_link_place_id');
  });

  it('recomputes route metadata for every repaired session', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('recompute_recommendation_session_route(v_session_id)');
    expect(sql).toContain('for v_session_id in');
  });
});
