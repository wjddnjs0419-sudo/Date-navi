import type { RecommendationRequest } from '../shared/recommendation/schemas';
import type { RecommendationHistoryContext } from '../shared/recommendation/recommendation-history';
import { handleRecommendDate, type RecommendDateDependencies } from '../supabase/functions/_shared/recommend-date-handler';

const request: RecommendationRequest = {
  requestId: 'history-request',
  mode: 'course',
  language: 'ko',
  location: { source: 'kakao', kakaoPlaceId: 'origin', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
  courseSteps: [
    { id: 'meal', category: 'meal', label: '식사' },
    { id: 'cafe', category: 'cafe', label: '카페' },
  ],
};

const candidate = (candidateId: string, kakaoPlaceId: string, categoryGroupCode: string) => ({
  candidateId, kakaoPlaceId, name: kakaoPlaceId, categoryGroupCode,
  categoryGroupName: categoryGroupCode === 'FD6' ? '음식점' : '카페',
  categoryName: categoryGroupCode === 'FD6' ? '음식점 > 한식' : '카페',
  address: '서울', roadAddress: '서울', mapUrl: '', latitude: 37.5444, longitude: 127.0374,
  distanceFromSearchCenterMeters: 100,
  matchedSearchEvidence: [], score: 60,
  scoreBreakdown: { intent: 40, distance: 20, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
});

const search = {
  candidates: [candidate('meal-candidate', 'meal-place', 'FD6'), candidate('cafe-candidate', 'cafe-place', 'CE7')],
  recallByCategory: { meal: 1, cafe: 1 },
  searchMetadata: {
    requestCount: 2, outcomes: [], successfulCount: 2, failedCount: 0, rateLimitedCount: 0, timeoutCount: 0, allSearchesFailed: false,
  },
};

function dependencies(overrides: Partial<RecommendDateDependencies> = {}): RecommendDateDependencies {
  return {
    authenticate: async () => ({ id: 'user-001' }),
    searchCandidates: async () => search,
    generateSelection: async () => ({ steps: [
      { stepId: 'meal', candidateId: 'meal-candidate' },
      { stepId: 'cafe', candidateId: 'cafe-candidate' },
    ] }),
    now: () => '2026-07-26T00:00:00.000Z',
    ...overrides,
  };
}

const history: RecommendationHistoryContext = {
  recentHardPlaceIds: ['old-place'],
  recentExposure: { 'old-place': { lastSeenAt: '2026-07-20T00:00:00.000Z', sessionDistance: 1 } },
  negativeActions: {}, feedback: {}, qualifiedPairs: [],
};

describe('recommend-date history integration', () => {
  it('keeps the legacy control response unchanged when the Edge selects control', async () => {
    const result = await handleRecommendDate(
      { method: 'POST', authorization: 'Bearer token', body: request },
      dependencies({ historyExperiment: { assignedVariant: 'control', assignmentUnit: 'user' } }),
    );

    expect(result.status).toBe(200);
    expect((result.body as any).metadata.historyExperiment).toBeUndefined();
  });

  it('passes only server-loaded treatment history into ranking and returns aggregate metadata', async () => {
    const searchCandidates = jest.fn(async (_request, passedHistory) => {
      expect(passedHistory).toEqual(history);
      return search;
    });
    const loadHistory = jest.fn(async () => ({
      context: history, status: 'loaded' as const, recentHistoryExcludedCount: 1,
    }));

    const result = await handleRecommendDate(
      { method: 'POST', authorization: 'Bearer token', body: request },
      dependencies({
        searchCandidates,
        loadHistory,
        historyExperiment: { assignedVariant: 'treatment', assignmentUnit: 'user' },
      }),
    );

    expect(result.status).toBe(200);
    expect(loadHistory).toHaveBeenCalledWith(expect.objectContaining({
      authenticatedUserId: 'user-001', request: expect.objectContaining({ requestId: request.requestId }),
    }));
    expect((result.body as any).metadata.historyExperiment).toEqual({
      name: 'history-diversity-v1', assignedVariant: 'treatment', effectiveVariant: 'treatment', assignmentUnit: 'user',
      historyLoad: 'loaded', recentHistoryExcludedCount: 0, recentCooldownRelaxed: false,
    });
    expect(JSON.stringify(result.body)).not.toContain('old-place');
  });

  it('falls back to control and still returns a recommendation when the treatment history loader fails', async () => {
    const searchCandidates = jest.fn(async (_request, passedHistory) => {
      expect(passedHistory.recentHardPlaceIds).toEqual([]);
      return search;
    });

    const result = await handleRecommendDate(
      { method: 'POST', authorization: 'Bearer token', body: request },
      dependencies({
        searchCandidates,
        loadHistory: async () => { throw new Error('private database detail'); },
        historyExperiment: { assignedVariant: 'treatment', assignmentUnit: 'couple' },
      }),
    );

    expect(result.status).toBe(200);
    expect((result.body as any).metadata.historyExperiment).toEqual({
      name: 'history-diversity-v1', assignedVariant: 'treatment', effectiveVariant: 'control', assignmentUnit: 'couple',
      historyLoad: 'failed', fallbackReason: 'history_load_failed', recentHistoryExcludedCount: 0, recentCooldownRelaxed: false,
    });
  });
});
