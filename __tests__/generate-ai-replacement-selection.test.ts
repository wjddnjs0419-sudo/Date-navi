import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('generate-ai replacement candidate curation action', () => {
  const source = readFileSync(join(process.cwd(), 'supabase/functions/generate-ai/index.ts'), 'utf8');

  it('defines a strict replacement_select action without changing recommend_date_select', () => {
    expect(source).toContain('REPLACEMENT_SELECT_SCHEMA');
    expect(source).toContain('replacement_select: { schema: REPLACEMENT_SELECT_SCHEMA');
    expect(source).toContain('recommend_date_select: { schema: RECOMMEND_DATE_SELECT_SCHEMA');
  });

  it('limits the selection to a list of verified candidateId strings only', () => {
    const schemaBlock = source.slice(
      source.indexOf('const REPLACEMENT_SELECT_SCHEMA'),
      source.indexOf('const ACTION_CONFIG'),
    );
    expect(schemaBlock).toContain('candidateIds');
    expect(schemaBlock).toContain("type: 'array'");
    expect(schemaBlock).toContain("required: ['candidateIds']");
    expect(schemaBlock).toContain('additionalProperties: false');
    expect(schemaBlock).not.toMatch(/place_name|price|opening|quiet|latitude|longitude/);
  });

  it('does not constrain the candidateIds array with minItems/maxItems (Anthropic structured-outputs beta rejects maxItems and minItems > 1) — the action is preserved infrastructure; the replacement sheet now serves deterministic ranking only', () => {
    const schemaBlock = source.slice(
      source.indexOf('const REPLACEMENT_SELECT_SCHEMA'),
      source.indexOf('const ACTION_CONFIG'),
    );
    expect(schemaBlock).not.toMatch(/minItems|maxItems/);
  });

  it('logs the action and returns the strict selection without the legacy usage envelope field', () => {
    expect(source).toContain('replacement_select: { schema: REPLACEMENT_SELECT_SCHEMA, maxTokens: 256, temperature: 0, logged: true }');
    expect(source).toContain("if (action === 'recommend_date_select' || action === 'replacement_select') return json(parsed);");
  });
});
