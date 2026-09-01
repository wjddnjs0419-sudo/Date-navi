import {
  toPublicWebDemoResponse,
  toRecommendationRequest,
  webDemoRecommendationRequestSchema,
  type WebDemoRecommendationRequest,
} from '../web-demo-contracts';

const validRequest: WebDemoRecommendationRequest = {
  courseSteps: [
    { id: 'meal-step', category: 'meal', intentTags: ['한식'] },
    { id: 'cafe-step', category: 'cafe' },
  ],
  location: {
    source: 'kakao',
    label: '서울숲',
    latitude: 37.5444,
    longitude: 127.0374,
    kakaoPlaceId: 'kakao-location-1',
  },
  meetingTime: '2026-08-31T19:30:00+09:00',
  moods: ['romantic', 'quiet'],
  maxWalkingMinutes: 10,
  language: 'ko',
};

describe('web demo recommendation contract', () => {
  it('accepts a valid 2-step request with one intent tag per step', () => {
    expect(webDemoRecommendationRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it.each([
    ['five steps', { courseSteps: Array.from({ length: 5 }, (_, index) => ({ id: `step-${index}`, category: 'meal' })) }],
    ['two intent tags', { courseSteps: [{ ...validRequest.courseSteps[0], intentTags: ['한식', '매운 음식'] }, validRequest.courseSteps[1]] }],
    ['41-character tag', { courseSteps: [{ ...validRequest.courseSteps[0], intentTags: ['가'.repeat(41)] }, validRequest.courseSteps[1]] }],
    ['unknown category', { courseSteps: [{ ...validRequest.courseSteps[0], category: 'unknown' }, validRequest.courseSteps[1]] }],
    ['latitude outside range', { location: { ...validRequest.location, latitude: 91 } }],
    ['longitude outside range', { location: { ...validRequest.location, longitude: 181 } }],
    ['non ISO-like meeting time', { meetingTime: 'tomorrow evening' }],
    ['unknown field', { unexpected: true }],
  ])('rejects %s', (_label, override) => {
    expect(webDemoRecommendationRequestSchema.safeParse({ ...validRequest, ...override }).success).toBe(false);
  });

  it('maps the web request to the existing localized recommendation request', () => {
    const result = toRecommendationRequest(validRequest, () => 'server-request-1');

    expect(result).toMatchObject({
      requestId: 'server-request-1',
      mode: 'course',
      language: 'ko',
      location: {
        source: 'kakao',
        kind: 'place',
        kakaoPlaceId: 'kakao-location-1',
      },
      courseSteps: [
        { id: 'meal-step', category: 'meal', label: '식사', intentTags: ['한식'] },
        { id: 'cafe-step', category: 'cafe', label: '카페' },
      ],
    });
    expect(result.additionalRequest).toContain('만날 시간:');
    expect(result.additionalRequest).toContain(validRequest.meetingTime);
  });

  it('preserves custom intent tags and current-location semantics', () => {
    const result = toRecommendationRequest({
      ...validRequest,
      location: { ...validRequest.location, source: 'current', kakaoPlaceId: undefined },
      language: 'en',
      courseSteps: [{ id: 'walk-step', category: 'walk', intentTags: ['한강 산책'] }, validRequest.courseSteps[1]],
    }, () => 'server-request-2');

    expect(result.location).toMatchObject({ source: 'current', kind: 'current' });
    expect(result.courseSteps[0]).toMatchObject({ category: 'walk', label: 'Walk', intentTags: ['한강 산책'] });
    expect(result.additionalRequest).toContain('Meeting time:');
  });

  it('removes mobile session, candidate, and retry fields recursively', () => {
    const internal = {
      requestId: 'request-1',
      course: {
        sessionId: 'session-1',
        steps: [{ stepId: 'step-1', candidateId: 'candidate-1', name: 'Place' }],
      },
      metadata: { nested: [{ candidateId: 'candidate-2', retryContext: { attempt: 1 } }] },
      retryContext: { attempt: 0, replacement: { candidateId: 'candidate-3' } },
    };

    const publicResponse = toPublicWebDemoResponse(internal);

    expect(JSON.stringify(publicResponse)).not.toMatch(/candidateId|sessionId|retryContext/);
    expect(publicResponse).toEqual({
      requestId: 'request-1',
      course: { steps: [{ stepId: 'step-1', name: 'Place' }] },
      metadata: { nested: [{}] },
    });
  });
});
