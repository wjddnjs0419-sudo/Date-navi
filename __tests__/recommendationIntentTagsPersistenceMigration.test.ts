import { readFileSync } from 'fs';
import { resolve } from 'path';

const migrationPath = resolve(
  __dirname,
  '../supabase/migrations/20260731183000_preserve_recommendation_step_intent_tags.sql',
);

describe('recommendation step intent tag persistence migration', () => {
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

  it('restores missing per-step tags from the latest or original request without crossing categories', () => {
    expect(sql).toContain('create or replace function public.preserve_recommendation_step_intent_tags()');
    expect(sql).toContain("source_step ->> 'id' = next_step.value ->> 'id'");
    expect(sql).toContain("source_step ->> 'category' = next_step.value ->> 'category'");
    expect(sql).toContain("jsonb_typeof(source_step -> 'intenttags') = 'array'");
    expect(sql).toContain("next_step.value ? 'intenttags'");
  });

  it('runs before latest_request updates and backfills already damaged sessions', () => {
    expect(sql).toContain('before update of latest_request on public.recommendation_sessions');
    expect(sql).toContain('execute function public.preserve_recommendation_step_intent_tags()');
    expect(sql).toContain('set latest_request = latest_request');
  });
});
