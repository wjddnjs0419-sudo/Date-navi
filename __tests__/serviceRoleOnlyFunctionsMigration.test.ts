import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('서비스 롤 전용 함수 잠금 마이그레이션', () => {
  const root = join(__dirname, '..');
  const migration = readFileSync(
    join(root, 'supabase/migrations/20260727130000_lock_service_role_only_functions.sql'), 'utf8',
  );
  const canonical = readFileSync(join(root, 'docs/supabase-schema.sql'), 'utf8');

  // `revoke all ... from public`만으로는 부족하다: 이 프로젝트는 anon·authenticated에
  // 함수 실행 권한이 직접 부여되어 있어 실측상 두 롤 모두 호출 가능했다.
  it.each([['migration', () => migration], ['canonical', () => canonical]])(
    '%s: 집계·관측 재계산 함수는 anon·authenticated에서 명시적으로 회수된다', (_l, sql) => {
      for (const line of [
        'revoke all on function public.aggregate_ai_recommendation_log_daily_stats() from anon, authenticated',
        'revoke all on function public.recompute_place_observed_price(text) from anon, authenticated',
      ]) {
        expect(sql()).toContain(line);
      }
    });

  it('클라이언트가 호출해야 하는 리뷰 RPC 2개는 회수하지 않는다', () => {
    // 주석 언급은 허용하고 실행문만 본다.
    const statements = migration
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(statements).not.toContain('record_recommendation_place_feedback');
    expect(statements).not.toContain('get_course_places_for_review');
  });
});
