import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AI 로그 일별 집계 마이그레이션', () => {
  const root = join(__dirname, '..');
  const migration = readFileSync(
    join(root, 'supabase/migrations/20260727100000_ai_log_daily_stats.sql'), 'utf8',
  );
  const canonical = readFileSync(join(root, 'docs/supabase-schema.sql'), 'utf8');

  it.each([['migration', () => migration], ['canonical', () => canonical]])(
    '%s: 집계 테이블·함수·서비스 롤 전용 잠금이 정의된다', (_l, sql) => {
      expect(sql()).toContain('create table if not exists public.ai_recommendation_log_daily_stats');
      expect(sql()).toContain('primary key (stat_date, action)');
      expect(sql()).toContain('aggregate_ai_recommendation_log_daily_stats');
      expect(sql()).toContain('percentile_cont(0.95) within group');
      expect(sql()).toContain('on conflict (stat_date, action) do update');
      expect(sql()).toContain('revoke all on public.ai_recommendation_log_daily_stats from authenticated');
    });

  it('개인정보 컬럼(prompt·response)은 집계에 포함되지 않는다', () => {
    expect(migration).not.toMatch(/insert into public\.ai_recommendation_log_daily_stats[\s\S]*?\b(prompt|response_json)\b/);
  });
});
