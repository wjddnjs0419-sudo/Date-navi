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

  it('returns STEP_INTENT_UNSATISFIED when a required step intent has no matching candidate', async () => {
    // meal 카테고리는 충족(무관 식당)하지만 "무조건 삼겹살" required intent를 만족하는 후보는 0.
    const intentRequest: RecommendationRequest = { ...request(), additionalRequest: '무조건 삼겹살이어야 해' };
    const deps = dependencies({
      searchCandidates: jest.fn(async () => ({
        candidates,
        recallByCategory: { meal: 1, cafe: 1 },
        searchMetadata: metadata(),
      })),
    });

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: intentRequest }, deps);

    expect(result).toEqual({ status: 422, body: { error: createRecommendationError('STEP_INTENT_UNSATISFIED') } });
    expect(deps.generateSelection).not.toHaveBeenCalled();
  });

  it('required intent 게이트는 카테고리까지 검사한다(이름만 전시인 비-culture는 통과 못 함)', async () => {
    // culture 스텝은 CT1 후보로 category 게이트를 통과하지만, "무조건 전시" required intent를
    // 만족하는 후보는 이름만 전시인 FD6뿐이라 culture ∩ 전시 매칭은 0 → STEP_INTENT_UNSATISFIED.
    const cultureRequest: RecommendationRequest = {
      ...request(),
      courseSteps: [
        { id: 'meal', category: 'meal', label: '식사' },
        { id: 'culture', category: 'culture', label: '문화' },
      ],
      additionalRequest: '무조건 전시',
    };
    const nameOnlyExhibit = { ...candidate('meal-c', 'meal-id', 'FD6', 127), name: '전시렌탈샵' };
    const cultureVenue = {
      ...candidate('culture-c', 'culture-id', 'CT1', 127.001),
      name: '서울숲 문화공간',
      categoryGroupName: '문화시설',
      categoryName: '문화시설 > 공연장',
    };
    const deps = dependencies({
      searchCandidates: jest.fn(async () => ({
        candidates: [nameOnlyExhibit, cultureVenue],
        recallByCategory: { meal: 1, culture: 1 },
        searchMetadata: metadata(),
      })),
    });

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: cultureRequest }, deps);

    expect(result).toEqual({ status: 422, body: { error: createRecommendationError('STEP_INTENT_UNSATISFIED') } });
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

describe('recommend-date step intent resolve 배선', () => {
  const porkCandidates = [
    { ...candidate('meal-candidate', 'meal-id', 'FD6', 127), categoryName: '음식점 > 한식 > 육류,고기 > 삼겹살' },
    candidate('cafe-candidate', 'cafe-id', 'CE7', 127.001),
  ];

  it('규칙 사전 히트("삼겹살")는 AI 파서를 호출하지 않고 200을 반환한다', async () => {
    const parseStepIntentsAi = jest.fn(async () => ({ stepIntents: [], unsupported: [], conflicts: [] }));
    const deps = dependencies({
      searchCandidates: jest.fn(async () => ({ candidates: porkCandidates, recallByCategory: { meal: 1, cafe: 1 }, searchMetadata: metadata() })),
      parseStepIntentsAi,
    });
    const body: RecommendationRequest = { ...request(), additionalRequest: '삼겹살 먹고 싶어' };
    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body }, deps);
    expect(result.status).toBe(200);
    expect(parseStepIntentsAi).not.toHaveBeenCalled();
  });

  it('사전 미검출 + 유의미 잔여 텍스트면 AI 파서를 한 번 호출한다', async () => {
    const parseStepIntentsAi = jest.fn(async () => ({ stepIntents: [], unsupported: [], conflicts: [] }));
    const deps = dependencies({ parseStepIntentsAi });
    const body: RecommendationRequest = { ...request(), additionalRequest: '뭔가 색다르고 이색적인 곳으로 가고파' };
    await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body }, deps);
    expect(parseStepIntentsAi).toHaveBeenCalledTimes(1);
  });

  it('additionalRequest가 없으면 AI 파서를 호출하지 않는다', async () => {
    const parseStepIntentsAi = jest.fn(async () => ({ stepIntents: [], unsupported: [], conflicts: [] }));
    const deps = dependencies({ parseStepIntentsAi });
    await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, deps);
    expect(parseStepIntentsAi).not.toHaveBeenCalled();
  });

  it('응답 metadata.stepIntent에 parserSource와 resolved 칩 데이터가 담긴다', async () => {
    const deps = dependencies({
      searchCandidates: jest.fn(async () => ({ candidates: porkCandidates, recallByCategory: { meal: 1, cafe: 1 }, searchMetadata: metadata() })),
    });
    const body: RecommendationRequest = { ...request(), additionalRequest: '삼겹살 먹고 싶어' };
    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body }, deps);
    expect(result.status).toBe(200);
    const meta = (result.body as { metadata: { stepIntent?: { parserSource: string; resolved: { canonicalTerm: string }[] } } }).metadata.stepIntent;
    expect(meta?.parserSource).toBe('rule');
    expect(meta?.resolved.map((r) => r.canonicalTerm)).toContain('삼겹살');
  });

  it('additionalRequest가 없으면 metadata.stepIntent를 넣지 않는다', async () => {
    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, dependencies());
    const meta = (result.body as { metadata: { stepIntent?: unknown } }).metadata;
    expect(meta.stepIntent).toBeUndefined();
  });
});
