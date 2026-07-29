import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('generate-ai internal action guard', () => {
  const source = readFileSync(join(process.cwd(), 'supabase/functions/generate-ai/index.ts'), 'utf8');

  it('allows only the two server-owned actions', () => {
    const actionConfig = source.slice(source.indexOf('const ACTION_CONFIG'), source.indexOf('const MODEL'));
    expect(actionConfig).toContain('recommend_date_select:');
    expect(actionConfig).toContain('estimate_place_price:');
    for (const action of ['cards', 'soft_message', 'feeling_select', 'course_select', 'replacement_select', 'parse_step_intents']) {
      expect(actionConfig).not.toContain(`${action}:`);
    }
    for (const schema of ['CARDS_SCHEMA', 'SOFT_MESSAGE_SCHEMA', 'FEELING_SELECT_SCHEMA', 'COURSE_SELECT_SCHEMA', 'REPLACEMENT_SELECT_SCHEMA', 'PARSE_STEP_INTENTS_SCHEMA']) {
      expect(source).not.toContain(schema);
    }
  });

  it('rejects non-internal actions and missing internal credentials with a safe 403', () => {
    expect(source).toContain("if (!config) {");
    expect(source).toContain("return json({ error: { code: 'AI_ACTION_FORBIDDEN' } }, 403);");
    expect(source).toContain('function hasInternalAiToken');
    expect(source).toContain("if (!internalAiToken) {");
    expect(source).toContain("return json({ error: 'Internal configuration error' }, 500);");
  });
});
