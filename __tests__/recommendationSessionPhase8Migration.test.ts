import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260714210000_recommendation_sessions.sql',
);
const hardeningMigrationPath = path.join(
  root,
  'supabase/migrations/20260714220000_harden_recommendation_sessions.sql',
);

describe('Phase 8 recommendation session migration contract', () => {
  it('is a self-contained transaction with three normalized tables and atomic persistence RPC', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(sql).toMatch(/^begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
    expect(sql).toContain('create table if not exists public.recommendation_sessions');
    expect(sql).toContain('create table if not exists public.recommendation_course_steps');
    expect(sql).toContain('create table if not exists public.recommendation_step_events');
    expect(sql).toContain('create or replace function public.persist_recommendation_session');
    expect(sql).toContain('create or replace function public.get_recommendation_session');
    expect(sql).toContain('v_owner_user_id := auth.uid()');
    expect(sql).not.toContain('p_owner_user_id');
    expect(sql).not.toContain('p_couple_id');
  });

  it('constrains stable step identity/order and append-only event linkage', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(sql).toContain('primary key (session_id, step_id)');
    expect(sql).toContain('unique (session_id, step_order)');
    expect(sql).toContain('foreign key (session_id, step_id)');
    expect(sql).toContain('check (step_order between 1 and 4)');
    expect(sql).toContain('check (candidate_rank is null or candidate_rank > 0)');
    expect(sql).toContain('recommendation_sessions_owner_idx');
    expect(sql).toContain('recommendation_course_steps_session_order_idx');
    expect(sql).toContain('recommendation_step_events_session_created_idx');
  });

  it('makes a same-owner persistence retry idempotent without overwriting session data', () => {
    const sql = fs.readFileSync(hardeningMigrationPath, 'utf8').toLowerCase();

    expect(sql).toMatch(/^begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('v_existing_session_id text');
    expect(sql).toContain('s.owner_user_id = v_owner_user_id');
    expect(sql).toContain('if v_existing_session_id is not null then');
    expect(sql).toContain('return public.get_recommendation_session(v_existing_session_id)');
    expect(sql).not.toMatch(/on\s+conflict[\s\S]{0,120}do\s+update/);
  });

  it('enables owner-only RLS without couple-member or anonymous draft access', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

    for (const table of ['recommendation_sessions', 'recommendation_course_steps', 'recommendation_step_events']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain('owner_user_id = auth.uid()');
    expect(sql).toContain('actor_user_id = auth.uid()');
    expect(sql).not.toContain('is_couple_member');
    expect(sql).not.toMatch(/to\s+anon/);
    expect(sql).not.toContain('recommendation_step_events_update');
    expect(sql).not.toContain('recommendation_step_events_delete');
  });

  it('hardens direct session writes to the caller profile couple instead of trusting a client couple ID', () => {
    const sql = fs.readFileSync(hardeningMigrationPath, 'utf8').toLowerCase();

    expect(sql).toContain('couple_id is not distinct from');
    expect(sql).toContain('from public.date_planner_profiles p');
    expect(sql).toContain('p.user_id = auth.uid()');
    expect(sql).toContain('recommendation_sessions_owner_insert');
    expect(sql).toContain('recommendation_sessions_owner_update');
  });

  it('keeps date_cards nullable/backward-compatible and contains no destructive data SQL', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8').toLowerCase();
    const canonical = fs.readFileSync(path.join(root, 'docs/supabase-schema.sql'), 'utf8').toLowerCase();

    expect(canonical).toContain('create table if not exists public.recommendation_sessions');
    expect(canonical).toContain('create table if not exists public.recommendation_course_steps');
    expect(canonical).toContain('create table if not exists public.recommendation_step_events');
    expect(canonical).toContain('old/manual date_cards rows remain valid');
    expect(`${migration}\n${canonical}`).not.toMatch(/drop\s+table|truncate\s+|delete\s+from\s+public\.date_cards/);
    expect(`${migration}\n${canonical}`).not.toMatch(/alter\s+column\s+(recommendation_request_id|recommendation_session_id|kakao_place_id)\s+set\s+not\s+null/);
  });
});
