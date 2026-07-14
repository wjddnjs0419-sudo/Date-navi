import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260714000000_add_recommendation_identity_to_date_cards.sql',
);
const schemaPath = resolve(root, 'docs/supabase-schema.sql');
const identityColumns = [
  'kakao_place_id',
  'recommendation_request_id',
  'recommendation_session_id',
];

function readIfPresent(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

type AddedColumn = {
  name: string;
  ifNotExists: boolean;
  type: string;
  modifiers: string;
};

type AlterTableStatement = {
  target: string;
  additions: AddedColumn[];
};

function normalizeQualifiedIdentifier(identifier: string): string {
  return identifier.replace(/["\s]/g, '').toLowerCase();
}

function alterTableStatements(sql: string): AlterTableStatement[] {
  const statements: AlterTableStatement[] = [];
  const alterPattern =
    /alter\s+table\s+((?:"[^"]+"|[a-z_][a-z0-9_]*)\s*\.\s*(?:"[^"]+"|[a-z_][a-z0-9_]*))\s+([\s\S]*?);/gi;

  for (const alterMatch of sql.matchAll(alterPattern)) {
    const additions: AddedColumn[] = [];
    const addPattern =
      /add\s+column\s+(?:(if\s+not\s+exists)\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+([a-z_][a-z0-9_]*)([^,;]*)/gi;

    for (const addMatch of alterMatch[2].matchAll(addPattern)) {
      additions.push({
        name: (addMatch[2] ?? addMatch[3]).toLowerCase(),
        ifNotExists: addMatch[1] !== undefined,
        type: addMatch[4].toLowerCase(),
        modifiers: addMatch[5].trim(),
      });
    }

    statements.push({
      target: normalizeQualifiedIdentifier(alterMatch[1]),
      additions,
    });
  }

  return statements;
}

function expectIdentityAlterContract(sql: string): void {
  const statements = alterTableStatements(sql);

  expect(statements).toHaveLength(1);
  expect(statements.map(({ target }) => target)).toEqual([
    'public.date_cards',
  ]);

  const additions = statements.flatMap(({ additions: columns }) => columns);

  expect(additions).toHaveLength(3);
  expect(additions.map(({ name }) => name).sort()).toEqual(identityColumns);
  for (const addition of additions) {
    expect(addition.ifNotExists).toBe(true);
    expect(addition.type).toBe('text');
    expect(addition.modifiers).toBe('');
  }
}

describe('date_cards recommendation identity migration contract', () => {
  it('rejects required columns on the wrong table plus any fourth column', () => {
    const unsafeMigration = `
      alter table public.wrong_table
        add column if not exists recommendation_request_id text,
        add column if not exists recommendation_session_id text,
        add column if not exists kakao_place_id text;

      alter table public.date_cards
        add column if not exists unexpected_identity jsonb;
    `;

    expect(() => expectIdentityAlterContract(unsafeMigration)).toThrow();
  });

  it('adds only the three nullable text identity columns idempotently', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readIfPresent(migrationPath);

    expectIdentityAlterContract(migration);
    expect(migration).not.toMatch(/\bnot\s+null\b/i);
    expect(migration).not.toMatch(/\bdefault\b/i);
    expect(migration).not.toMatch(/\breferences\b/i);
    expect(migration).not.toMatch(/\bcreate\s+table\b/i);
    expect(migration).not.toMatch(
      /\b(?:drop|truncate|delete\s+from|update|insert\s+into)\b/i,
    );
  });

  it('documents legacy nullability and the identity boundaries', () => {
    const migration = readIfPresent(migrationPath);

    expect(migration).toMatch(/old\/manual cards remain null/i);
    expect(migration).toMatch(/one generation attempt/i);
    expect(migration).toMatch(/groups regenerations when available/i);
    expect(migration).toMatch(/single selected place/i);
    expect(migration).toMatch(/steps\[\]\.kakaoPlaceId/);
  });

  it('records the same extension in the rerunnable schema behind a table guard', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const guardedDateCardsBlock = schema.match(
      /if\s+to_regclass\(['"]public\.date_cards['"]\)\s+is\s+not\s+null\s+then([\s\S]*?)end\s+if/iu,
    );

    expect(guardedDateCardsBlock).not.toBeNull();
    const guardedSql = guardedDateCardsBlock?.[1] ?? '';

    expectIdentityAlterContract(guardedSql);
    for (const column of identityColumns) {
      expect(guardedSql).toMatch(
        new RegExp(
          `comment\\s+on\\s+column\\s+public\\.date_cards\\.${column}\\s+is\\b`,
          'i',
        ),
      );
    }
  });
});
