import { randomUUID } from 'expo-crypto';

import {
  FALLBACK_CARDS_BY_LANGUAGE,
  generateDateCards,
  type FeelingInput,
} from '../lib/ai';
import {
  buildRecommendationRequest,
  requestRecommendationCards,
  requestRecommendationResponse,
} from '../lib/recommend-date';
import {
  recommendationRequestSchema,
  recommendDateResponseSchema,
  type RecommendationRequest,
} from '../shared/recommendation/schemas';
import { supabase } from '../lib/supabase';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const invoke = jest.fn();
const randomUUIDMock = jest.mocked(randomUUID);
Object.assign(supabase, { functions: { invoke } });

const courseDraft: NonNullable<FeelingInput['courseDraft']> = {
  location: {
    source: 'kakao',
    kakaoPlaceId: 'origin-001',
    label: '서울숲',
    address: '서울 성동구',
    latitude: 37.5444,
    longitude: 127.0374,
    kind: 'landmark',
  },
  courseSteps: [
    { id: 'step-meal', category: 'meal', label: '식사' },
    { id: 'step-cafe', category: 'cafe', label: '카페' },
  ],
  maxWalkingMinutes: 10,
  totalBudgetKRW: 70000,
  moods: ['romantic', 'quiet'],
  duration: 'half_day',
  additionalRequest: '야경을 보고 싶어',
  parsedPreferences: { quietPreferred: true },
};

const input: FeelingInput = {
  energy: 'medium',
  distance: 'any',
  mood: 'romantic',
  duration: 'half_day',
  avoid: [],
  coords: { x: '127.0374', y: '37.5444' },
  recommendationLocation: courseDraft.location,
  courseDraft,
};

const bridgeCards = [{
  title: '서울숲 데이트',
  summary: '식사와 카페를 이어 즐겨요.',
  tags: ['course'],
  why_recommended: '선택한 코스 순서에 맞아요.',
  steps: [
    {
      label: '식사',
      candidateId: 'candidate-meal',
      kakaoPlaceId: 'place-meal',
      place_name: '검증 식당',
      place_address: '서울 성동구',
      map_url: 'https://place.map.kakao.com/place-meal',
    },
    {
      label: '카페',
      candidateId: 'candidate-cafe',
      kakaoPlaceId: 'place-cafe',
      place_name: '검증 카페',
      place_address: '서울 성동구',
      map_url: 'https://place.map.kakao.com/place-cafe',
    },
  ],
}];

const haversineMeters = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) => {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(value));
};

const routeDistance = haversineMeters(
  { latitude: 37.544, longitude: 127.037 },
  { latitude: 37.545, longitude: 127.038 },
);

const response = (requestId: string) => ({
  requestId,
  course: {
    requestId,
    sessionId: requestId,
    steps: [
      { stepId: 'step-meal', order: 1, category: 'meal', label: '식사', candidateId: 'candidate-meal', kakaoPlaceId: 'place-meal', name: '검증 식당', address: '서울 성동구', roadAddress: '', mapUrl: 'https://place.map.kakao.com/place-meal', latitude: 37.544, longitude: 127.037, reason: '검증된 식사 후보', locked: false },
      { stepId: 'step-cafe', order: 2, category: 'cafe', label: '카페', candidateId: 'candidate-cafe', kakaoPlaceId: 'place-cafe', name: '검증 카페', address: '서울 성동구', roadAddress: '', mapUrl: 'https://place.map.kakao.com/place-cafe', latitude: 37.545, longitude: 127.038, reason: '검증된 카페 후보', locked: false },
    ],
    relaxedConstraints: [],
    generatedAt: '2026-07-14T00:00:00.000Z',
  },
  cards: bridgeCards.map((card) => ({ ...card, requestId, sessionId: requestId })),
  metadata: {
    fallbackUsed: false,
    selectionSource: 'ai',
    selectionReason: 'none',
    search: { requestCount: 2, successfulCount: 2, failedCount: 0, rateLimitedCount: 0, timeoutCount: 0, candidateCount: 2 },
    route: {
      distanceMethod: 'haversine_straight_line',
      adjacentDistanceMeters: [routeDistance],
      totalDistanceMeters: routeDistance,
      walkingHeuristicMetersPerMinute: 80,
      walkingLimitAssessment: 'provisional_within',
      hardConstraintValidated: false,
    },
  },
});

beforeEach(() => {
  invoke.mockReset();
  randomUUIDMock.mockReset();
});

describe('structured recommend-date client', () => {
  it('returns the complete validated Phase 7 response for DB session persistence', async () => {
    const requestBody = buildRecommendationRequest(courseDraft, 'req-client-001', 'ko');
    const responseBody = response(requestBody.requestId);
    invoke.mockResolvedValue({ data: responseBody, error: null });

    await expect(requestRecommendationResponse(requestBody)).resolves.toEqual(responseBody);
  });

  it('forwards cancellation to the actual Edge invocation', async () => {
    const requestBody = buildRecommendationRequest(courseDraft, 'req-client-abort-001', 'ko');
    const responseBody = response(requestBody.requestId);
    const controller = new AbortController();
    invoke.mockResolvedValue({ data: responseBody, error: null });

    await requestRecommendationResponse(requestBody, { signal: controller.signal });

    expect(invoke).toHaveBeenCalledWith('recommend-date', {
      body: requestBody,
      signal: controller.signal,
    });
  });

  it('accepts a compatibility card only when it carries request/session identity', () => {
    expect(recommendDateResponseSchema.safeParse(response('req-client-001')).success).toBe(true);
  });

  it.each([
    ['course requestId mismatch', () => {
      const value = response('req-client-001');
      return { ...value, course: { ...value.course, requestId: 'req-other' } };
    }],
    ['temporary sessionId mismatch', () => {
      const value = response('req-client-001');
      return { ...value, course: { ...value.course, sessionId: 'session-other' } };
    }],
    ['card request identity mismatch', () => {
      const value = response('req-client-001');
      return { ...value, cards: [{ ...value.cards[0], requestId: 'req-other' }] };
    }],
    ['card session identity mismatch', () => {
      const value = response('req-client-001');
      return { ...value, cards: [{ ...value.cards[0], sessionId: 'session-other' }] };
    }],
    ['card step count mismatch', () => {
      const value = response('req-client-001');
      return { ...value, cards: [{ ...value.cards[0], steps: value.cards[0].steps.slice(0, 1) }] };
    }],
    ['card step order mismatch', () => {
      const value = response('req-client-001');
      return { ...value, cards: [{ ...value.cards[0], steps: [...value.cards[0].steps].reverse() }] };
    }],
    ['card candidate identity mismatch', () => {
      const value = response('req-client-001');
      return { ...value, cards: [{ ...value.cards[0], steps: [{ ...value.cards[0].steps[0], candidateId: 'candidate-other' }, value.cards[0].steps[1]] }] };
    }],
    ['card place name mismatch', () => {
      const value = response('req-client-001');
      return { ...value, cards: [{ ...value.cards[0], steps: [{ ...value.cards[0].steps[0], place_name: '다른 장소' }, value.cards[0].steps[1]] }] };
    }],
    ['card label mismatch', () => {
      const value = response('req-client-001');
      return { ...value, cards: [{ ...value.cards[0], steps: [{ ...value.cards[0].steps[0], label: '위조 라벨' }, value.cards[0].steps[1]] }] };
    }],
    ['card address mismatch', () => {
      const value = response('req-client-001');
      return { ...value, cards: [{ ...value.cards[0], steps: [{ ...value.cards[0].steps[0], place_address: '위조 주소' }, value.cards[0].steps[1]] }] };
    }],
    ['card map URL mismatch', () => {
      const value = response('req-client-001');
      return { ...value, cards: [{ ...value.cards[0], steps: [{ ...value.cards[0].steps[0], map_url: 'https://example.com/invented' }, value.cards[0].steps[1]] }] };
    }],
    ['course card top-level single-place identity', () => {
      const value = response('req-client-001');
      return { ...value, cards: [{ ...value.cards[0], candidateId: 'candidate-meal' }] };
    }],
    ['impossible search outcome sum', () => {
      const value = response('req-client-001');
      return { ...value, metadata: { ...value.metadata, search: { ...value.metadata.search, requestCount: 3 } } };
    }],
    ['zero successful searches', () => {
      const value = response('req-client-001');
      return { ...value, metadata: { ...value.metadata, search: { requestCount: 2, successfulCount: 0, failedCount: 2, rateLimitedCount: 0, timeoutCount: 0, candidateCount: 2 } } };
    }],
    ['candidate count below course steps', () => {
      const value = response('req-client-001');
      return { ...value, metadata: { ...value.metadata, search: { ...value.metadata.search, candidateCount: 1 } } };
    }],
    ['adjacent route count mismatch', () => {
      const value = response('req-client-001');
      return { ...value, metadata: { ...value.metadata, route: { ...value.metadata.route, adjacentDistanceMeters: [] } } };
    }],
    ['invented adjacent route distance', () => {
      const value = response('req-client-001');
      return { ...value, metadata: { ...value.metadata, route: { ...value.metadata.route, adjacentDistanceMeters: [1], totalDistanceMeters: 1 } } };
    }],
    ['route total differs from adjacent sum', () => {
      const value = response('req-client-001');
      return { ...value, metadata: { ...value.metadata, route: { ...value.metadata.route, totalDistanceMeters: routeDistance + 25 } } };
    }],
    ['AI source with fallback reason', () => {
      const value = response('req-client-001');
      return { ...value, metadata: { ...value.metadata, selectionReason: 'ai_timeout' } };
    }],
    ['fallback source without fallback flag', () => {
      const value = response('req-client-001');
      return { ...value, metadata: { ...value.metadata, selectionSource: 'deterministic_fallback' } };
    }],
    ['fallback flag without bounded reason', () => {
      const value = response('req-client-001');
      return { ...value, metadata: { ...value.metadata, fallbackUsed: true, selectionSource: 'deterministic_fallback', selectionReason: 'none' } };
    }],
  ] as const)('rejects cross-field %s', (_case, mutate) => {
    expect(recommendDateResponseSchema.safeParse(mutate()).success).toBe(false);
  });

  it.each(['ko', 'en'] as const)('builds a schema-validated %s request without any client prompt field', (language) => {
    const result = buildRecommendationRequest(courseDraft, 'req-client-001', language);

    expect(recommendationRequestSchema.safeParse(result).success).toBe(true);
    expect(result).toEqual({
      requestId: 'req-client-001',
      mode: 'course',
      language,
      ...courseDraft,
    });
    expect(result).not.toHaveProperty('prompt');
    expect(result).not.toHaveProperty('fullPrompt');
    expect(result).not.toHaveProperty('systemPrompt');
  });

  it('uses only recommend-date for make_course + courseDraft and preserves its requestId on every card', async () => {
    randomUUIDMock.mockReturnValue('00000000-0000-4000-8000-000000000501');
    const expectedRequestId = 'req_00000000-0000-4000-8000-000000000501';
    invoke.mockResolvedValue({ data: response(expectedRequestId), error: null });

    const result = await generateDateCards(input, 'make_course', undefined, 'ko');

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('recommend-date', {
      body: buildRecommendationRequest(courseDraft, expectedRequestId, 'ko'),
    });
    expect(invoke.mock.calls[0][1].body).not.toHaveProperty('prompt');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: bridgeCards[0].title,
      estimated_time: '반나절 (4~5시간)',
      estimated_budget: '',
      requestId: expectedRequestId,
    });
  });

  it.each([
    ['mismatched requestId', response('req-other')],
    ['empty cards', { ...response('req-client-001'), cards: [] }],
    ['invalid cards', { ...response('req-client-001'), cards: [{ title: 'missing fields' }] }],
    ['missing metadata', { requestId: 'req-client-001', course: response('req-client-001').course, cards: bridgeCards }],
    ['unknown response field', { ...response('req-client-001'), rawPrompt: 'must not be accepted' }],
    ['unknown nested metadata field', {
      ...response('req-client-001'),
      metadata: { ...response('req-client-001').metadata, rawOutcomes: [{ query: 'private' }] },
    }],
  ])('rejects %s responses at the client boundary', async (_case, responseBody) => {
    invoke.mockResolvedValue({ data: responseBody, error: null });

    await expect(requestRecommendationCards(
      buildRecommendationRequest(courseDraft, 'req-client-001', 'ko'),
    )).rejects.toThrow();
  });

  it.each([
    ['arbitrary stepId', (value: ReturnType<typeof response>) => ({
      ...value,
      course: { ...value.course, steps: [{ ...value.course.steps[0], stepId: 'invented-step' }, value.course.steps[1]] },
    })],
    ['arbitrary category', (value: ReturnType<typeof response>) => ({
      ...value,
      course: { ...value.course, steps: [{ ...value.course.steps[0], category: 'activity' }, value.course.steps[1]] },
    })],
    ['invented label shared by course and card', (value: ReturnType<typeof response>) => ({
      ...value,
      course: { ...value.course, steps: [{ ...value.course.steps[0], label: '위조 라벨' }, value.course.steps[1]] },
      cards: [{ ...value.cards[0], steps: [{ ...value.cards[0].steps[0], label: '위조 라벨' }, value.cards[0].steps[1]] }],
    })],
    ['walking assessment inconsistent with requested limit', (value: ReturnType<typeof response>) => ({
      ...value,
      metadata: { ...value.metadata, route: { ...value.metadata.route, walkingLimitAssessment: 'provisional_exceeded' as const } },
    })],
    ['spurious maxWalking relaxation', (value: ReturnType<typeof response>) => ({
      ...value,
      course: { ...value.course, relaxedConstraints: [{ constraint: 'maxWalkingMinutes', reason: 'not needed' }] },
    })],
  ] as const)('rejects request-aware %s at the client boundary', async (_case, mutate) => {
    const requestBody = buildRecommendationRequest(courseDraft, 'req-client-001', 'ko');
    const responseBody = mutate(response(requestBody.requestId));
    expect(recommendDateResponseSchema.safeParse(responseBody).success).toBe(true);
    invoke.mockResolvedValue({ data: responseBody, error: null });

    await expect(requestRecommendationCards(requestBody)).rejects.toThrow();
  });

  it('rejects response step count and lock state that do not match the original request', async () => {
    const baseRequest = buildRecommendationRequest(courseDraft, 'req-client-001', 'ko');
    const countRequest: RecommendationRequest = {
      ...baseRequest,
      courseSteps: [
        ...baseRequest.courseSteps,
        { id: 'step-activity', category: 'activity', label: '활동' },
      ],
    };
    invoke.mockResolvedValueOnce({ data: response(baseRequest.requestId), error: null });
    await expect(requestRecommendationCards(countRequest)).rejects.toThrow();

    const lockedRequest: RecommendationRequest = {
      ...baseRequest,
      lockedSteps: [{ stepId: 'step-meal', candidateId: 'candidate-meal', kakaoPlaceId: 'place-meal' }],
    };
    invoke.mockResolvedValueOnce({ data: response(baseRequest.requestId), error: null });
    await expect(requestRecommendationCards(lockedRequest)).rejects.toThrow();
  });

  it('rejects missing walking relaxation and walking metadata when no limit was requested', async () => {
    const baseRequest = buildRecommendationRequest(courseDraft, 'req-client-001', 'ko');
    const far = response(baseRequest.requestId);
    const farDistance = haversineMeters(
      far.course.steps[0],
      { ...far.course.steps[1], longitude: 127.05 },
    );
    const exceededWithoutRelaxation = {
      ...far,
      course: {
        ...far.course,
        steps: [far.course.steps[0], { ...far.course.steps[1], longitude: 127.05 }],
      },
      metadata: {
        ...far.metadata,
        route: {
          ...far.metadata.route,
          adjacentDistanceMeters: [farDistance],
          totalDistanceMeters: farDistance,
          walkingLimitAssessment: 'provisional_exceeded' as const,
        },
      },
    };
    expect(recommendDateResponseSchema.safeParse(exceededWithoutRelaxation).success).toBe(true);
    invoke.mockResolvedValueOnce({ data: exceededWithoutRelaxation, error: null });
    await expect(requestRecommendationCards(baseRequest)).rejects.toThrow();

    const { maxWalkingMinutes: _omitted, ...withoutWalkingLimit } = baseRequest;
    invoke.mockResolvedValueOnce({ data: response(baseRequest.requestId), error: null });
    await expect(requestRecommendationCards(withoutWalkingLimit)).rejects.toThrow();
  });

  it('does not hide a structured response mismatch behind static fallback cards', async () => {
    randomUUIDMock.mockReturnValue('00000000-0000-4000-8000-000000000502');
    invoke.mockResolvedValue({ data: response('req-other'), error: null });

    await expect(generateDateCards(input, 'make_course', undefined, 'en')).rejects.toThrow();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps legacy make_course without courseDraft on the existing generate-ai path', async () => {
    randomUUIDMock.mockReturnValue('00000000-0000-4000-8000-000000000503');
    invoke.mockResolvedValue({ data: { cards: bridgeCards }, error: null });

    await generateDateCards({ ...input, coords: undefined, recommendationLocation: undefined, courseDraft: undefined }, 'make_course');

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe('generate-ai');
  });

  it('keeps the legacy static fallback for make_course without courseDraft', async () => {
    randomUUIDMock.mockReturnValue('00000000-0000-4000-8000-000000000504');
    invoke.mockRejectedValue(new Error('legacy generate-ai unavailable'));

    const result = await generateDateCards(
      { ...input, coords: undefined, recommendationLocation: undefined, courseDraft: undefined },
      'make_course',
      undefined,
      'en',
    );

    expect(result.map(card => card.title)).toEqual(FALLBACK_CARDS_BY_LANGUAGE.en.map(card => card.title));
  });
});
