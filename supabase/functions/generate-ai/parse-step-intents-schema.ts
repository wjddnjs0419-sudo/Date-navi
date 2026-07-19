// parse_step_intents 액션의 json_schema. 규칙 파서가 놓친 자유텍스트를 사전 canonical로 매핑하고
// 미지원/충돌을 함께 보고한다(스펙 §8.2). 데이터 전용 — 프롬프트 로직과 분리한다.
export const PARSE_STEP_INTENTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stepIntents', 'unsupported', 'conflicts'],
  properties: {
    stepIntents: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['targetCategory', 'canonicalTerm', 'intentType', 'strength', 'negated', 'kakaoSearchTerms'],
        properties: {
          targetCategory: { type: 'string', enum: ['meal', 'cafe', 'culture', 'walk', 'drinks', 'activity'] },
          canonicalTerm: { type: 'string' },
          intentType: {
            type: 'string',
            enum: ['dish', 'cuisine', 'venue_subtype', 'activity', 'culture_subtype', 'drink_type'],
          },
          strength: { type: 'string', enum: ['required', 'preferred'] },
          negated: { type: 'boolean' },
          kakaoSearchTerms: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        },
      },
    },
    unsupported: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'reason'],
        properties: { term: { type: 'string' }, reason: { type: 'string' } },
      },
    },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description'],
        properties: { description: { type: 'string' } },
      },
    },
  },
} as const;
