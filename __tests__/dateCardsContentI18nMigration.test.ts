import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Confirmed cards are read by BOTH partners of a couple, who may run the app in different
// languages. The recommendation pipeline now emits card texts in ko AND en (cards[0].i18n);
// this migration persists that block on date_cards so each viewer can read the card in their
// own language instead of the requester's.
describe('date_cards content_i18n migration', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260717010000_date_cards_content_i18n.sql'),
    'utf8',
  );

  it('adds a nullable content_i18n jsonb column to date_cards', () => {
    expect(sql).toMatch(/alter table public\.date_cards\s+add column if not exists content_i18n jsonb/i);
  });

  it('redefines the mutation RPC so confirm copies the card i18n block', () => {
    expect(sql).toMatch(/create or replace function public\.apply_recommendation_session_mutation/i);
    expect(sql).toMatch(/insert into public\.date_cards \([\s\S]*?content_i18n[\s\S]*?\)/i);
    expect(sql).toContain("v_card -> 'i18n'");
  });

  it('keeps the function-level settings from the previous definition', () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public, pg_temp/i);
    expect(sql).toMatch(/set extra_float_digits = 3/i);
  });
});
