import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('generate-ai candidate-only recommend-date action', () => {
  const source = readFileSync(join(process.cwd(), 'supabase/functions/generate-ai/index.ts'), 'utf8');

  it('defines a strict recommend_date_select action and no legacy direct action', () => {
    expect(source).toContain('RECOMMEND_DATE_SELECT_SCHEMA');
    expect(source).toContain("recommend_date_select: { schema: RECOMMEND_DATE_SELECT_SCHEMA");
    const actionConfig = source.slice(source.indexOf('const ACTION_CONFIG'), source.indexOf('const MODEL'));
    for (const action of ['cards', 'soft_message', 'feeling_select', 'course_select', 'replacement_select', 'parse_step_intents']) {
      expect(actionConfig).not.toContain(`${action}:`);
    }
  });

  it('limits structured selection steps to stepId and candidateId only', () => {
    const schemaBlock = source.slice(
      source.indexOf('const RECOMMEND_DATE_SELECT_SCHEMA'),
      source.indexOf('const ACTION_CONFIG'),
    );
    expect(schemaBlock).toContain("stepId: { type: 'string' }");
    expect(schemaBlock).toContain("candidateId: { type: 'string' }");
    expect(schemaBlock).toContain("required: ['stepId', 'candidateId']");
    expect(schemaBlock).toContain('additionalProperties: false');
    expect(schemaBlock).not.toMatch(/place_name|price|opening|quiet|latitude|longitude/);
  });

  it('does not constrain the steps array with minItems/maxItems (Anthropic structured-outputs beta rejects maxItems and minItems > 1)', () => {
    const schemaBlock = source.slice(
      source.indexOf('const RECOMMEND_DATE_SELECT_SCHEMA'),
      source.indexOf('const ACTION_CONFIG'),
    );
    expect(schemaBlock).not.toMatch(/minItems|maxItems/);
  });

  it('keeps the Supabase logger generic and proves parsed JSON is an object before spreading it', () => {
    expect(source).toContain('ReturnType<typeof createClient<any>>');
    expect(source).toContain("if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))");
  });

  it('returns the strict recommend-date selection without the legacy usage envelope field', () => {
    expect(source).toContain("if (typeof action === 'string' && RAW_PASSTHROUGH_ACTIONS.has(action)) return json(parsed);");
    expect(source).toMatch(/RAW_PASSTHROUGH_ACTIONS = new Set\(\[[^\]]*'recommend_date_select'[^\]]*\]\)/s);
  });

  it('requires the private internal token and enforces action-specific prompt caps', () => {
    expect(source).toContain("req.headers.get('x-internal-ai-token')");
    expect(source).toContain("Deno.env.get('INTERNAL_AI_TOKEN')");
    expect(source).toContain("AI_ACTION_FORBIDDEN");
    expect(source).toContain("AI_PROMPT_TOO_LARGE");
    expect(source).toContain('maxPromptChars: 20_000');
    expect(source).toContain('maxPromptChars: 1_000');
  });
});
