import {
  buildLegacyResultParams,
  buildStructuredGeneratingParams,
  buildStructuredCourseResultParams,
  parseStructuredCourseResultParams,
} from '../lib/recommendation-route';

describe('recommendation route params', () => {
  it('emits only requestId for the structured course→generating handoff', () => {
    expect(buildStructuredGeneratingParams('req-001')).toEqual({ requestId: 'req-001' });
  });

  it('emits only requestId/sessionId for structured make_course result navigation', () => {
    expect(buildStructuredCourseResultParams('req-001', 'session-001')).toEqual({
      requestId: 'req-001',
      sessionId: 'session-001',
    });
    expect(Object.keys(buildStructuredCourseResultParams('req-001', 'session-001')).sort())
      .toEqual(['requestId', 'sessionId']);
  });

  it.each(['input', 'cards', 'course', 'candidates'])('rejects structured JSON payload key %s', (key) => {
    expect(() => parseStructuredCourseResultParams({
      requestId: 'req-001',
      sessionId: 'session-001',
      [key]: JSON.stringify({ private: 'payload' }),
    })).toThrow();
  });

  it.each([
    {},
    { requestId: '', sessionId: 'session-001' },
    { requestId: 'req-001' },
    { requestId: ['req-001'], sessionId: 'session-001' },
  ])('rejects missing or invalid structured IDs: %j', (params) => {
    expect(() => parseStructuredCourseResultParams(params)).toThrow();
  });

  it('preserves legacy feeling JSON params only through the explicit legacy builder', () => {
    expect(buildLegacyResultParams({
      mode: 'feeling',
      input: '{"mood":"quiet"}',
      cards: '[{"title":"legacy"}]',
      sessionId: 'legacy-session',
    })).toEqual({
      mode: 'feeling',
      input: '{"mood":"quiet"}',
      cards: '[{"title":"legacy"}]',
      sessionId: 'legacy-session',
    });
  });
});
