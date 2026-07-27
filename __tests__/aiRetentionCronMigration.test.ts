import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 계획 원안의 파일명(…140000)은 관측 표본 수 교정 마이그레이션이 이미 쓰고 있어 150000으로 민다.
const migration = readFileSync(
  join(__dirname, '..', 'supabase/migrations/20260727150000_pg_cron_ai_retention.sql'),
  'utf8',
);

describe('AI 보존 cron 마이그레이션', () => {
  it('한 함수 안에서 집계가 삭제보다 반드시 먼저 실행된다', () => {
    const body = migration.slice(migration.indexOf('run_ai_retention'));
    const aggregateIndex = body.indexOf('aggregate_ai_recommendation_log_daily_stats');
    const purgeIndex = body.indexOf('purge_expired_ai_data');
    expect(aggregateIndex).toBeGreaterThan(-1);
    expect(purgeIndex).toBeGreaterThan(aggregateIndex);
  });

  it('pg_cron으로 하루 한 번 스케줄된다', () => {
    expect(migration).toContain('create extension if not exists pg_cron');
    expect(migration).toContain('cron.schedule');
    expect(migration).toContain('run_ai_retention');
  });

  it('중복 등록을 막기 위해 같은 이름의 기존 잡을 먼저 내린다', () => {
    const unscheduleIndex = migration.indexOf('cron.unschedule');
    const scheduleIndex = migration.indexOf('cron.schedule');
    expect(unscheduleIndex).toBeGreaterThan(-1);
    expect(scheduleIndex).toBeGreaterThan(unscheduleIndex);
  });

  it('보존 함수는 익명·로그인 사용자가 호출할 수 없다', () => {
    expect(migration).toContain('revoke all on function public.run_ai_retention() from public');
  });
});
