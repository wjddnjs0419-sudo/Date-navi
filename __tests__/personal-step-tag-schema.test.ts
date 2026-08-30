import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(__dirname, '../supabase/migrations/20260729000000_personal_step_intent_tags.sql');
const limitMigrationPath = resolve(__dirname, '../supabase/migrations/20260829080000_personal_step_intent_tag_limit.sql');
const migrationsDirectory = resolve(__dirname, '../supabase/migrations');
const canonicalSchemaPath = resolve(__dirname, '../docs/supabase-schema.sql');

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

  it('enforces the personal keyword limit per user and category', () => {
    const sql = readFileSync(limitMigrationPath, 'utf8');

    expect(sql).toContain('create or replace function public.enforce_personal_step_intent_tag_limit()');
    expect(sql).toContain('v_count >= 20');
    expect(sql).toContain("personal_step_intent_tag_limit_reached");
    expect(sql).toContain('create trigger personal_step_intent_tag_limit');
  });

  it('keeps the limit trigger under caller RLS and unavailable as a direct RPC', () => {
    const hardeningMigrationName = readdirSync(migrationsDirectory)
      .find((name) => name.endsWith('_harden_personal_step_intent_tag_limit.sql'));

    expect(hardeningMigrationName).toBeDefined();

    const hardeningSql = readFileSync(resolve(migrationsDirectory, hardeningMigrationName!), 'utf8').toLowerCase();
    const canonicalSql = readFileSync(canonicalSchemaPath, 'utf8').toLowerCase();
    const canonicalFunction = canonicalSql.slice(
      canonicalSql.indexOf('create or replace function public.enforce_personal_step_intent_tag_limit()'),
      canonicalSql.indexOf('create trigger personal_step_intent_tag_limit'),
    );

    expect(hardeningSql).toContain('alter function public.enforce_personal_step_intent_tag_limit() security invoker');
    expect(hardeningSql).toContain("alter function public.enforce_personal_step_intent_tag_limit() set search_path = ''");
    expect(hardeningSql).toContain(
      'revoke all on function public.enforce_personal_step_intent_tag_limit() from public, anon, authenticated',
    );
    expect(hardeningSql).not.toContain('security definer');

    expect(canonicalFunction).toContain('security invoker');
    expect(canonicalFunction).toContain("set search_path = ''");
    expect(canonicalFunction).not.toContain('security definer');
  });
});
