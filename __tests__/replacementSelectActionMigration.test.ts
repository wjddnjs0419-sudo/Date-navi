import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ai_recommendation_logs action check constraint — replacement_select', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260716010000_ai_recommendation_logs_add_replacement_select_action.sql'),
    'utf8',
  ).toLowerCase();

  it('allows the replacement_select action used by the replacement-candidates curation call', () => {
    expect(sql).toContain('alter table public.ai_recommendation_logs drop constraint');
    expect(sql).toContain('ai_recommendation_logs_action_check');
    expect(sql).toContain("check (action in ('cards', 'feeling_select', 'course_select', 'recommend_date_select', 'replacement_select')");
  });
});
