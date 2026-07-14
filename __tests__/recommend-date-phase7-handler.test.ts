import type { RecommendationRequest } from '../shared/recommendation/schemas';
import { createRecommendationError } from '../shared/recommendation/errors';
import {
  handleRecommendDate,
  type RecommendDateDependencies,
} from '../supabase/functions/_shared/recommend-date-handler';
import {
  RecommendDateDownstreamMalformedError,
  RecommendDateDownstreamTimeoutError,
} from '../supabase/functions/_shared/recommend-date-downstream';
import type { PlaceCandidate } from '../supabase/functions/_shared/recommendation-ranking';
import type { KakaoSearchMetadata } from '../supabase/functions/_shared/recommendation-search';

const request = (): RecommendationRequest => ({
  requestId: 'handler-phase7',
  mode: 'course',
  language: 'ko',
  location: { source: 'kakao', label: '서울숲', latitude: 37, longitude: 127, kind: 'landmark' },
  courseSteps: [
    { id: 'meal', category: 'meal', label: '식사' },
    { id: 'cafe', category: 'cafe', label: '카페' },
  ],
  maxWalkingMinutes: 10,
});

const candidate = (candidateId: string, kakaoPlaceId: string, code: string, longitude: number): PlaceCandidate => ({
  candidateId,
  kakaoPlaceId,
  name: `Verified ${kakaoPlaceId}`,
  categoryGroupCode: code,
  categoryGroupName: code === 'FD6' ? '음식점' : '카페',
  categoryName: code === 'FD6' ? '음식점 > 한식' : '카페',
  address: `Address ${kakaoPlaceId}`,
  roadAddress: `Road ${kakaoPlaceId}`,
  latitude: 37,
  longitude,
  mapUrl: `https://place.map.kakao.com/${kakaoPlaceId}`,
  matchedSearchEvidence: [{ queryId: candidateId, source: 'category', page: 1, categoryCode: code }],
  distanceFromSearchCenterMeters: 100,
  score: 60,
  scoreBreakdown: { intent: 40, distance: 20, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
});

const candidates = [candidate('meal-candidate', 'meal-id', 'FD6', 127), candidate('cafe-candidate', 'cafe-id', 'CE7', 127.001)];

const metadata = (overrides: Partial<KakaoSearchMetadata> = {}): KakaoSearchMetadata => ({
  requestCount: 2,
  outcomes: [],
  successfulCount: 2,
  failedCount: 0,
  rateLimitedCount: 0,
  timeoutCount: 0,
  allSearchesFailed: false,
  ...overrides,
});

function dependencies(overrides: Partial<RecommendDateDependencies> = {}): RecommendDateDependencies {
  return {
    authenticate: jest.fn(async () => ({ id: 'user' })),
    searchCandidates: jest.fn(async () => ({
      candidates,
      recallByCategory: { meal: 1, cafe: 1 },
      searchMetadata: metadata(),
    })),
    generateSelection: jest.fn(async () => ({
      steps: [{ stepId: 'meal', candidateId: 'meal-candidate' }, { stepId: 'cafe', candidateId: 'cafe-candidate' }],
    })),
    now: jest.fn(() => '2026-07-14T00:00:00.000Z'),
    ...overrides,
  };
}

describe('recommend-date Phase 7 typed search outcomes', () => {
  it('rejects the shared single_place shape before recommend-date search or AI selection', async () => {
    const deps = dependencies();
    const singlePlaceRequest: RecommendationRequest = {
      ...request(),
      mode: 'single_place',
      courseSteps: [{ id: 'meal', category: 'meal', label: '식사' }],
    };

    const result = await handleRecommendDate({
      method: 'POST', authorization: 'Bearer valid', body: singlePlaceRequest,
    }, deps);

    expect(result).toEqual({ status: 400, body: { error: createRecommendationError('INVALID_INPUT') } });
    expect(deps.searchCandidates).not.toHaveBeenCalled();
    expect(deps.generateSelection).not.toHaveBeenCalled();
  });

  it.each([
    ['rate limit', metadata({ requestCount: 2, successfulCount: 0, rateLimitedCount: 1, failedCount: 1, allSearchesFailed: true }), 429, 'PLACE_SEARCH_RATE_LIMITED'],
    ['timeout', metadata({ requestCount: 2, successfulCount: 0, timeoutCount: 1, failedCount: 1, allSearchesFailed: true }), 504, 'PLACE_SEARCH_TIMEOUT'],
  ] as const)('returns sanitized typed error when every search ends in %s', async (_case, searchMetadata, status, code) => {
    const deps = dependencies({
      searchCandidates: jest.fn(async () => ({ candidates: [], recallByCategory: {}, searchMetadata })),
    });

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, deps);

    expect(result).toEqual({ status, body: { error: createRecommendationError(code) } });
    expect(JSON.stringify(result.body)).not.toMatch(/query_|outcomes|provider detail|private/i);
    expect(deps.generateSelection).not.toHaveBeenCalled();
  });

  it.each([
    ['zero candidates', [], { meal: 0, cafe: 0 }],
    ['missing required category', [candidates[0]], { meal: 1, cafe: 0 }],
  ])('returns INSUFFICIENT_CANDIDATES for %s', async (_case, found, recallByCategory) => {
    const deps = dependencies({
      searchCandidates: jest.fn(async () => ({ candidates: found, recallByCategory, searchMetadata: metadata() })),
    });

    await expect(handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, deps))
      .resolves.toEqual({ status: 422, body: { error: createRecommendationError('INSUFFICIENT_CANDIDATES') } });
    expect(deps.generateSelection).not.toHaveBeenCalled();
  });

  it('continues after partial search failure when every required step still has candidates', async () => {
    const deps = dependencies({
      searchCandidates: jest.fn(async () => ({
        candidates,
        recallByCategory: { meal: 1, cafe: 1 },
        searchMetadata: metadata({ successfulCount: 1, timeoutCount: 1 }),
      })),
    });

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, deps);

    expect(result.status).toBe(200);
    expect(deps.generateSelection).toHaveBeenCalledTimes(1);
  });
});

describe('recommend-date Phase 7 candidate-only recovery and response', () => {
  it('replaces an AI route that exceeds walking when a compliant deterministic route exists', async () => {
    const routeCandidates = [
      candidate('meal', 'meal-id', 'FD6', 127),
      candidate('cafe-far', 'cafe-far-id', 'CE7', 127.05),
      candidate('cafe-near', 'cafe-near-id', 'CE7', 127.001),
    ];
    const deps = dependencies({
      searchCandidates: jest.fn(async () => ({
        candidates: routeCandidates,
        recallByCategory: { meal: 1, cafe: 2 },
        searchMetadata: metadata(),
      })),
      generateSelection: jest.fn(async () => ({
        steps: [{ stepId: 'meal', candidateId: 'meal' }, { stepId: 'cafe', candidateId: 'cafe-far' }],
      })),
    });

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, deps);

    expect(result).toMatchObject({
      status: 200,
      body: {
        course: { steps: [{ candidateId: 'meal' }, { candidateId: 'cafe-near' }], relaxedConstraints: [] },
        metadata: {
          fallbackUsed: true,
          selectionSource: 'deterministic_fallback',
          selectionReason: 'ai_route_constraint',
          route: { walkingLimitAssessment: 'provisional_within' },
        },
      },
    });
  });

  it.each([
    ['timeout', jest.fn(async () => { throw new RecommendDateDownstreamTimeoutError(); }), 'ai_timeout'],
    ['malformed JSON', jest.fn(async () => { throw new RecommendDateDownstreamMalformedError(); }), 'ai_malformed'],
    ['malformed', jest.fn(async () => ({ steps: [{ stepId: 'meal', candidateId: 'meal-candidate', placeName: 'invented' }] })), 'ai_malformed'],
    ['invalid selection', jest.fn(async () => ({ steps: [{ stepId: 'meal', candidateId: 'unknown' }, { stepId: 'cafe', candidateId: 'cafe-candidate' }] })), 'ai_invalid_selection'],
  ])('recovers %s with a valid candidate-only fallback', async (_case, generateSelection, selectionReason) => {
    const deps = dependencies({ generateSelection });

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, deps);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      requestId: 'handler-phase7',
      course: { requestId: 'handler-phase7', sessionId: 'handler-phase7' },
      cards: [{ steps: [
        expect.objectContaining({ candidateId: 'meal-candidate', kakaoPlaceId: 'meal-id' }),
        expect.objectContaining({ candidateId: 'cafe-candidate', kakaoPlaceId: 'cafe-id' }),
      ] }],
      metadata: { fallbackUsed: true, selectionSource: 'deterministic_fallback', selectionReason },
    });
  });

  it('returns strict verified success metadata without raw search outcomes or AI facts', async () => {
    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, dependencies());
    const serialized = JSON.stringify(result.body);

    expect(result).toMatchObject({
      status: 200,
      body: {
        requestId: 'handler-phase7',
        metadata: {
          fallbackUsed: false,
          selectionSource: 'ai',
          selectionReason: 'none',
          search: { requestCount: 2, successfulCount: 2, failedCount: 0, rateLimitedCount: 0, timeoutCount: 0 },
          route: { distanceMethod: 'haversine_straight_line' },
        },
      },
    });
    expect(serialized).not.toMatch(/outcomes|prompt|price|quiet|opening/i);
  });
});
