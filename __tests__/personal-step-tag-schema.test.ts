import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(__dirname, '../supabase/migrations/20260729000000_personal_step_intent_tags.sql');

describe('personal step tag schema', () => {
  it('declares user-scoped personal tags, hidden defaults, RLS, and realtime publication', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('create table if not exists public.personal_step_intent_tags');
    expect(sql).toContain('unique (user_id, category, normalized_tag)');
    expect(sql).toContain('create table if not exists public.personal_hidden_step_intent_defaults');
    expect(sql).toContain('alter table public.personal_step_intent_tags enable row level security');
    expect(sql).toContain('alter table public.personal_hidden_step_intent_defaults enable row level security');
    expect(sql).toContain('alter publication supabase_realtime add table public.personal_step_intent_tags');
    expect(sql).toContain('alter publication supabase_realtime add table public.personal_hidden_step_intent_defaults');
  });
});
