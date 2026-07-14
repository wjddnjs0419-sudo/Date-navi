import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Phase 11 first-party learning boundary', () => {
  const migration = readFileSync(join(__dirname, '../supabase/migrations/20260715100000_recommendation_learning_events.sql'), 'utf8').toLowerCase();

  it('records only meaningful owner actions and never grants direct feedback/event writes', () => {
    expect(migration).toContain('create table if not exists public.place_feedback');
    expect(migration).toContain("event_type in ('initial_recommendation','place_replaced','place_locked','place_unlocked','place_deleted','place_added','course_confirmed','place_visited','feedback_submitted')");
    expect(migration).toContain('record_recommendation_place_feedback');
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = public, pg_temp');
    expect(migration).toContain('revoke insert, update, delete on public.recommendation_step_events from authenticated');
    expect(migration).toContain('revoke insert, update, delete on public.place_feedback from authenticated');
  });

  it('records initial/lock/replacement/confirm server-side and validates explicit delete events against the owner session', () => {
    expect(migration).toContain('recommendation_course_step_event_trigger');
    expect(migration).toContain("'initial_recommendation'");
    expect(migration).toContain("'place_replaced'");
    expect(migration).toContain("'place_locked'");
    expect(migration).toContain("'course_confirmed'");
    expect(migration).toContain("set_config(''app.recommendation_event_action'', p_action, true)");
    expect(migration).toContain("v_action = 'delete'");
  });
});
