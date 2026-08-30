import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const migrationPath = resolve(root, 'supabase/migrations/20260830180250_date_card_shares.sql');

function readMigration(): string {
  return readFileSync(migrationPath, 'utf8');
}

describe('date card external sharing migration contract', () => {
  it('creates an RLS-protected share table without opening date_cards', () => {
    const sql = readMigration();

    expect(sql).toMatch(/create table public\.date_card_shares/i);
    expect(sql).toMatch(/id\s+uuid\s+primary key\s+default\s+gen_random_uuid\(\)/i);
    expect(sql).toMatch(/card_id\s+text\s+not null\s+references\s+public\.date_cards\s*\(id\)\s+on delete cascade/i);
    expect(sql).toMatch(/share_token\s+text\s+not null\s+unique/i);
    expect(sql).toMatch(/created_by\s+uuid\s+not null\s+references\s+auth\.users/i);
    expect(sql).toMatch(/revoked_at\s+timestamptz/i);
    expect(sql).toMatch(/alter table public\.date_card_shares enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.date_card_shares from public, anon, authenticated/i);
    expect(sql).not.toMatch(/create policy[^;]+on\s+public\.date_cards[^;]+for\s+select/i);
    expect(sql).not.toMatch(/grant\s+select[^;]+on\s+table\s+public\.date_cards\s+to\s+anon/i);
  });

  it('uses member-only authenticated RPCs and a separately public resolver', () => {
    const sql = readMigration();

    expect(sql).toMatch(/create(?: or replace)? function public\.create_date_card_share\s*\(p_card_id text\)\s*returns text/i);
    expect(sql).toMatch(/create(?: or replace)? function public\.revoke_date_card_share\s*\(p_card_id text\)\s*returns boolean/i);
    expect(sql).toMatch(/create(?: or replace)? function public\.get_public_shared_course\s*\(p_share_token text\)\s*returns jsonb/i);
    expect(sql).toMatch(/grant execute on function public\.create_date_card_share\(text\) to authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.revoke_date_card_share\(text\) to authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.get_public_shared_course\(text\) to anon, authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.create_date_card_share\(text\) from public, anon/i);
    expect(sql).toMatch(/revoke all on function public\.get_public_shared_course\(text\) from public/i);
  });

  it('pins every security-definer search path and generates 256-bit hex tokens', () => {
    const sql = readMigration();

    expect(sql).toMatch(/create(?: or replace)? function public\.create_date_card_share[\s\S]*?security definer\s+set search_path = ''/i);
    expect(sql).toMatch(/create(?: or replace)? function public\.revoke_date_card_share[\s\S]*?security definer\s+set search_path = ''/i);
    expect(sql).toMatch(/create(?: or replace)? function public\.get_public_shared_course[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
    expect(sql).toMatch(/encode\s*\(\s*extensions\.gen_random_bytes\(32\)\s*,\s*'hex'\s*\)/i);
    expect(sql).toMatch(/create unique index[^;]+on public\.date_card_shares\s*\(card_id\)[^;]+where revoked_at is null/i);
  });

  it('projects only the public course DTO fields', () => {
    const sql = readMigration();
    const resolver = sql.match(/create(?: or replace)? function public\.get_public_shared_course[\s\S]*?\$\$;/i)?.[0] ?? '';

    expect(resolver).toMatch(/jsonb_build_object\s*\(/i);
    for (const field of ['title', 'summary', 'estimated_time', 'estimated_budget', 'steps']) {
      expect(resolver).toMatch(new RegExp(`'${field}'`, 'i'));
    }
    for (const internalField of [
      'id', 'couple_id', 'created_by', 'request_id', 'recommendation_request_id',
      'candidate_id', 'kakao_place_id', 'place_address', 'map_url', 'latitude',
      'longitude', 'input_json', 'tags', 'why_recommended', 'content_i18n',
    ]) {
      expect(resolver).not.toMatch(new RegExp(`'${internalField}'`, 'i'));
    }
    expect(resolver).toMatch(/revoked_at is null/i);
    expect(resolver).toMatch(/jsonb_build_object\s*\(\s*'label'/i);
    expect(resolver).toMatch(/'desc'/i);
    expect(resolver).toMatch(/'place_name'/i);
  });
});
