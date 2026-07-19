import { PARSE_STEP_INTENTS_SCHEMA } from '../supabase/functions/generate-ai/parse-step-intents-schema';

describe('PARSE_STEP_INTENTS_SCHEMA', () => {
  const schema = PARSE_STEP_INTENTS_SCHEMA as unknown as {
    properties: Record<string, { items?: { properties?: Record<string, unknown> } }>;
    required: string[];
    additionalProperties: boolean;
  };

  it('stepIntents/unsupported/conflicts를 요구하고 여분 속성을 막는다', () => {
    expect(schema.required).toEqual(expect.arrayContaining(['stepIntents', 'unsupported', 'conflicts']));
    expect(schema.additionalProperties).toBe(false);
  });

  it('stepIntents 항목은 targetCategory/canonicalTerm/strength/negated/kakaoSearchTerms를 요구한다', () => {
    const item = schema.properties.stepIntents.items!.properties!;
    expect(Object.keys(item)).toEqual(expect.arrayContaining([
      'targetCategory', 'canonicalTerm', 'intentType', 'strength', 'negated', 'kakaoSearchTerms',
    ]));
  });

  it('unsupported 항목은 term/reason을 요구한다', () => {
    const item = schema.properties.unsupported.items!.properties!;
    expect(Object.keys(item)).toEqual(expect.arrayContaining(['term', 'reason']));
  });
});
