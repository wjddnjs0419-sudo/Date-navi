import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ai_recommendation_logs action check constraint widening', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260715152131_ai_recommendation_logs_add_recommend_date_action.sql'),
    'utf8',
  ).toLowerCase();

  it('allows the recommend_date_select action used by the recommend-date downstream call', () => {
    expect(sql).toContain('alter table public.ai_recommendation_logs drop constraint');
    expect(sql).toContain('ai_recommendation_logs_action_check');
    expect(sql).toContain("check (action in ('cards', 'feeling_select', 'course_select', 'recommend_date_select')");
  });
});
