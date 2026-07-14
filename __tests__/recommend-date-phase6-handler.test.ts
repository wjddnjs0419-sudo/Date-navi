import type { RecommendationRequest } from '../shared/recommendation/schemas';
import { createRecommendationError } from '../shared/recommendation/errors';
import {
  handleRecommendDate,
  type RecommendDateDependencies,
} from '../supabase/functions/_shared/recommend-date-handler';
import { buildRecommendationPrompt } from '../supabase/functions/_shared/recommendation-prompt';
import type { RecommendationSearchPipelineResult } from '../supabase/functions/_shared/recommendation-search-pipeline';

const request = (language: 'ko' | 'en' = 'ko'): RecommendationRequest => ({
  requestId: `phase6-${language}`,
  mode: 'course',
  language,
  location: {
    source: 'kakao',
    label: language === 'ko' ? '서울숲' : 'Seoul Forest',
    latitude: 37.5444,
    longitude: 127.0374,
    kind: 'landmark',
  },
  courseSteps: [
    { id: 'meal', category: 'meal', label: 'Meal' },
    { id: 'cafe', category: 'cafe', label: 'Cafe' },
  ],
});

const searchResult: RecommendationSearchPipelineResult = {
  candidates: [{
    candidateId: 'candidate_001',
    kakaoPlaceId: 'kakao-001',
    name: '검증된 장소',
    categoryGroupCode: 'FD6',
    categoryGroupName: '음식점',
    categoryName: '음식점 > 한식',
    address: '서울 성동구',
    roadAddress: '서울 성동구 왕십리로',
    latitude: 37.545,
    longitude: 127.038,
    mapUrl: 'https://place.map.kakao.com/kakao-001',
    distanceFromSearchCenterMeters: 100,
    matchedSearchEvidence: [{ queryId: 'required-meal', source: 'category', page: 1, categoryCode: 'FD6' }],
    score: 65,
    scoreBreakdown: {
      intent: 40,
      distance: 20,
      budget: 0,
      preference: 0,
      routeFit: 0,
      diversity: 5,
      behavior: 0,
      penalty: 0,
    },
  }, {
    candidateId: 'candidate_002',
    kakaoPlaceId: 'kakao-002',
    name: '검증된 카페',
    categoryGroupCode: 'CE7',
    categoryGroupName: '카페',
    categoryName: '카페',
    address: '서울 성동구',
    roadAddress: '서울 성동구 왕십리로',
    latitude: 37.5451,
    longitude: 127.0381,
    mapUrl: 'https://place.map.kakao.com/kakao-002',
    distanceFromSearchCenterMeters: 120,
    matchedSearchEvidence: [{ queryId: 'required-cafe', source: 'category', page: 1, categoryCode: 'CE7' }],
    score: 60,
    scoreBreakdown: { intent: 40, distance: 20, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
  }],
  recallByCategory: { meal: 1, cafe: 1 },
  searchMetadata: {
    requestCount: 2, outcomes: [], successfulCount: 2, failedCount: 0,
    rateLimitedCount: 0, timeoutCount: 0, allSearchesFailed: false,
  },
};

function dependencies(overrides: Partial<RecommendDateDependencies> = {}): RecommendDateDependencies {
  return {
    authenticate: jest.fn(async () => ({ id: 'user' })),
    searchCandidates: jest.fn(async () => searchResult),
    generateSelection: jest.fn(async () => ({
      steps: [{ stepId: 'meal', candidateId: 'candidate_001' }, { stepId: 'cafe', candidateId: 'candidate_002' }],
    })),
    now: jest.fn(() => '2026-07-14T00:00:00.000Z'),
    ...overrides,
  };
}

describe('recommend-date Phase 6 handler boundary', () => {
  it('rejects auth, invalid schema, and structured conflict before Kakao search', async () => {
    const authDeps = dependencies();
    await handleRecommendDate({ method: 'POST', body: request() }, authDeps);
    expect(authDeps.searchCandidates).not.toHaveBeenCalled();

    const schemaDeps = dependencies();
    await handleRecommendDate({
      method: 'POST',
      authorization: 'Bearer valid',
      body: { ...request(), unknown: true },
    }, schemaDeps);
    expect(schemaDeps.searchCandidates).not.toHaveBeenCalled();

    const conflictDeps = dependencies();
    const result = await handleRecommendDate({
      method: 'POST',
      authorization: 'Bearer valid',
      body: { ...request(), additionalRequest: '카페는 빼줘' },
    }, conflictDeps);
    expect(result).toEqual({ status: 400, body: { error: createRecommendationError('INVALID_INPUT') } });
    expect(conflictDeps.searchCandidates).not.toHaveBeenCalled();
    expect(conflictDeps.generateSelection).not.toHaveBeenCalled();
  });

  it('rejects normalized top-level structured exclusion conflicts before search', async () => {
    const deps = dependencies();

    const result = await handleRecommendDate({
      method: 'POST',
      authorization: 'Bearer valid',
      body: { ...request(), excludedCategories: ['restaurant'] },
    }, deps);

    expect(result).toEqual({ status: 400, body: { error: createRecommendationError('INVALID_INPUT') } });
    expect(deps.searchCandidates).not.toHaveBeenCalled();
    expect(deps.generateSelection).not.toHaveBeenCalled();
  });

  it.each(['ko', 'en'] as const)('routes a valid %s request through the same search/rank dependency', async (language) => {
    const deps = dependencies();
    const input = request(language);

    await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: input }, deps);

    expect(deps.searchCandidates).toHaveBeenCalledWith(input);
    expect(deps.generateSelection).toHaveBeenCalledWith(expect.objectContaining({
      prompt: buildRecommendationPrompt(input, searchResult.candidates),
    }));
  });

  it('puts only verified candidate fields, evidence, and score in the server prompt', async () => {
    const deps = dependencies();

    await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, deps);

    const prompt = (deps.generateSelection as jest.Mock).mock.calls[0][0].prompt as string;
    expect(prompt).toContain('candidate_001');
    expect(prompt).toContain('kakao-001');
    expect(prompt).toContain('검증된 장소');
    expect(prompt).toContain('required-meal');
    expect(prompt).toContain('"budget": 0');
    const candidateBlock = prompt.slice(prompt.indexOf('Verified Kakao candidates:'));
    expect(candidateBlock).not.toMatch(/openingHours|quietness|crowding|priceClaim/);
  });

  it('drops nested client parsedPreferences when server parsing derives nothing', async () => {
    const deps = dependencies();
    const input = { ...request(), parsedPreferences: { quietPreferred: true } };

    await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: input }, deps);

    const searched = (deps.searchCandidates as jest.Mock).mock.calls[0][0] as RecommendationRequest;
    const prompt = (deps.generateSelection as jest.Mock).mock.calls[0][0].prompt as string;
    expect(searched.parsedPreferences).toBeUndefined();
    expect(prompt).toContain('"parsedPreferences": null');
    expect(prompt).not.toContain('"quietPreferred": true');
  });

  it('replaces conflicting nested client preferences with server-parsed raw values', async () => {
    const deps = dependencies();
    const input = {
      ...request(),
      additionalRequest: 'avoid quiet places',
      parsedPreferences: { quietPreferred: true, photoFriendlyPreferred: true },
    };

    await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: input }, deps);

    const searched = (deps.searchCandidates as jest.Mock).mock.calls[0][0] as RecommendationRequest;
    expect(searched.parsedPreferences).toEqual({ quietPreferred: false });
    expect(searched.quietPreferred).toBe(false);
    expect(JSON.stringify(searched)).not.toContain('photoFriendlyPreferred');
  });

  it('includes hard exclusions in structured prompt constraints as defense in depth', () => {
    const prompt = buildRecommendationPrompt({
      ...request(),
      excludedCategories: ['drinks'],
      excludedPlaceIds: ['blocked-place'],
    }, []);

    expect(prompt).toContain('"excludedCategories"');
    expect(prompt).toContain('"drinks"');
    expect(prompt).toContain('"excludedPlaceIds"');
    expect(prompt).toContain('"blocked-place"');
  });
});
