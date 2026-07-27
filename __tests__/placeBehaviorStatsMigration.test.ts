import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('place_behavior_stats 뷰 마이그레이션', () => {
  const root = join(__dirname, '..');
  const migration = readFileSync(
    join(root, 'supabase/migrations/20260727120000_place_behavior_stats_view.sql'), 'utf8',
  );

  it('테이블+트리거가 아니라 뷰다 — tg_op 사고의 재발 방지 구조', () => {
    expect(migration).toContain('create or replace view public.place_behavior_stats');
    expect(migration).not.toMatch(/create trigger/i);
  });
  it('노출·교체·삭제·확정과 커플 중복 제거 카운트를 원본에서 계산한다', () => {
    for (const marker of ['exposure_session_count', 'replaced_count', 'deleted_count',
      'confirmed_session_count', 'distinct_couple_count', "event_type = 'place_replaced'",
      "event_type = 'place_deleted'", "status = 'confirmed'"]) {
      expect(migration).toContain(marker);
    }
  });
  it('클라이언트 롤에서 읽을 수 없다', () => {
    expect(migration).toContain('revoke all on public.place_behavior_stats from authenticated');
  });
});
