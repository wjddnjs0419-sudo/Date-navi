import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../supabase/migrations/20260829050000_add_provider_identity_to_mutation_cards.sql',
);

describe('mutation card provider identity migration', () => {
  it('adds the current provider tuple to rebuilt card steps', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("'placeIdentity', case when current_place_provider is not null");
    expect(sql).toContain('current_provider_place_id');
    expect(sql).toContain('current_kakao_link_place_id');
    expect(sql).toContain('pg_get_functiondef');
    expect(sql).toContain('execute v_definition');
  });

  it('fails closed when the deployed serializer shape differs', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('v_before');
    expect(sql).toContain('Mutation card identity migration source shape not found');
    expect(sql).toContain('Mutation card identity migration patch failed');
  });
});
