import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { omitOneShotRequestFields } from '../lib/recommendation-request';
import type { RecommendationRequest } from '../shared/recommendation/contracts';

const request = {
  requestId: 'req-1',
  mode: 'course',
  language: 'ko',
  location: { source: 'kakao', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
  courseSteps: [
    { id: 'a', category: 'meal', label: '식사' },
    { id: 'b', category: 'cafe', label: '카페' },
  ],
  replacement: { stepId: 'a', kakaoPlaceId: '123' },
} as unknown as RecommendationRequest;

describe('omitOneShotRequestFields', () => {
  it('drops the one-shot replacement field while keeping standing request state', () => {
    const base = omitOneShotRequestFields(request);
    expect('replacement' in base).toBe(false);
    expect(base.requestId).toBe('req-1');
    expect(base.courseSteps).toHaveLength(2);
  });

  it('is a no-op copy for requests without one-shot fields', () => {
    const clean = omitOneShotRequestFields({ ...request, replacement: undefined } as never);
    expect('replacement' in clean).toBe(false);
    expect(clean.location.label).toBe('서울숲');
  });
});

describe('course-result edit flows never spread a stale replacement into new requests', () => {
  const screen = readFileSync(join(__dirname, '../app/mode-flow/course-result.tsx'), 'utf8');

  it('builds regenerate, replace, and add requests from the one-shot-stripped base request', () => {
    expect(screen).toContain('omitOneShotRequestFields');
    expect(screen).not.toContain('...snapshot.request,');
  });
});
