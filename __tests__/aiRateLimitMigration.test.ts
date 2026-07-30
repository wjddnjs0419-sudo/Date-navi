import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260729120000_ai_rate_limits.sql');

describe('AI rate-limit migration', () => {
  const migration = () => readFileSync(migrationPath, 'utf8');
  const canonical = () => readFileSync(join(process.cwd(), 'docs/supabase-schema.sql'), 'utf8');

  it.each([['migration', migration], ['canonical', canonical]])(
    '%s: quota, lock, event 테이블을 service role 전용으로 만든다', (_label, read) => {
      const sql = read();
      for (const table of ['ai_quota_buckets', 'ai_request_locks', 'ai_rate_limit_events']) {
        expect(sql).toContain(`create table if not exists public.${table}`);
        expect(sql).toContain(`alter table public.${table} enable row level security`);
        expect(sql).toContain(`revoke all on public.${table} from anon, authenticated`);
      }
    },
  );

  it('5분 burst와 Seoul 일일 한도를 SQL에 고정한다', () => {
    const sql = migration();
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).toContain("at time zone 'Asia/Seoul'");
    expect(sql).toContain('v_burst_limit constant integer := 3');
    expect(sql).toContain('v_daily_limit constant integer := 20');
  });

  it('quota는 사용자/action advisory lock 아래 두 bucket을 함께 소비한다', () => {
    const sql = migration();
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("p_action <> 'course_generate'");
    expect(sql).toContain("bucket_type = 'burst'");
    expect(sql).toContain("bucket_type = 'daily'");
  });

  it('TTL lock과 모든 RPC를 public/authenticated에서 철회한다', () => {
    const sql = migration();
    expect(sql).toContain("interval '2 minutes'");
    for (const fn of [
      'acquire_ai_request_lock',
      'release_ai_request_lock',
      'consume_ai_quota',
      'record_ai_rate_limit_event',
    ]) {
      expect(sql).toContain(`revoke all on function public.${fn}`);
    }
  });

  it('live lock이 경쟁적으로 사라지면 재조회 대신 획득을 재시도한다', () => {
    const sql = migration();
    const lockFunction = sql.slice(
      sql.indexOf('create or replace function public.acquire_ai_request_lock'),
      sql.indexOf('create or replace function public.release_ai_request_lock'),
    );
    expect(lockFunction).toContain('loop');
    expect(lockFunction).toContain('if not found then continue; end if;');
  });
});
