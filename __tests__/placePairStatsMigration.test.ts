import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Phase 12 incremental pair statistics', () => {
  const sql = readFileSync(join(__dirname, '../supabase/migrations/20260715110000_place_pair_stats.sql'), 'utf8').toLowerCase();
  it('aggregates confirmed pairs incrementally and guards behavior language with both thresholds', () => {
    expect(sql).toContain('create table if not exists public.place_pair_stats');
    expect(sql).toContain('create table if not exists public.place_pair_stat_couples');
    expect(sql).toContain('course_confirmed');
    expect(sql).toMatch(/on conflict \(source_kakao_place_id,target_kakao_place_id\) do update/);
    expect(sql).toMatch(/coalesce\(unique_couple_count, 0\) >= 10 and coalesce\(confirmed_selection_count, 0\) >= 15/);
    expect(sql).toContain('often_selected_together');
  });
});
