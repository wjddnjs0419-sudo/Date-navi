import { handleReplacementCandidates } from '../supabase/functions/_shared/replacement-candidates-handler';
import type { PlaceCandidate } from '../supabase/functions/_shared/recommendation-ranking';

const treatmentMetadata = {
  historyExperiment: {
    name: 'history-diversity-v1', assignedVariant: 'treatment', effectiveVariant: 'treatment', assignmentUnit: 'user',
    historyLoad: 'loaded', recentHistoryExcludedCount: 1, recentCooldownRelaxed: false,
  },
};

const candidate = (id: string, categoryGroupCode: string): PlaceCandidate => ({
  candidateId: `candidate-${id}`,
  kakaoPlaceId: `place-${id}`,
  name: `Place ${id}`,
  categoryGroupCode,
  categoryGroupName: categoryGroupCode === 'CE7' ? 'Cafe' : 'Restaurant',
  categoryName: categoryGroupCode === 'CE7' ? 'Cafe' : 'Restaurant',
  address: 'Seoul', roadAddress: 'Seoul road', latitude: 37.55, longitude: 127.011,
  mapUrl: `https://place.map.kakao.com/place-${id}`,
  matchedSearchEvidence: [], distanceFromSearchCenterMeters: 100, score: 50,
  scoreBreakdown: { intent: 40, distance: 10, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
});

const rows = [
  {
    step_id: 'meal', step_order: 1, category: 'meal', label: 'Meal', current_kakao_place_id: 'current-meal', current_candidate_id: 'current-meal-candidate',
    place_name: 'Current meal', address: 'Seoul', road_address: 'Seoul road', map_url: '', latitude: 37.55, longitude: 127.010, reason: 'ok', locked: false,
  },
  {
    step_id: 'cafe', step_order: 2, category: 'cafe', label: 'Cafe', current_kakao_place_id: 'current-cafe', current_candidate_id: 'current-cafe-candidate',
    place_name: 'Current cafe', address: 'Seoul', road_address: 'Seoul road', map_url: '', latitude: 37.55, longitude: 127.012, reason: 'ok', locked: false,
  },
];

const session = (metadata: unknown = treatmentMetadata) => ({
  originalRequest: {
    requestId: 'request-1', mode: 'course', language: 'en',
    location: { source: 'kakao', label: 'Seoul', latitude: 37.55, longitude: 127.011, kind: 'landmark' },
    courseSteps: [{ id: 'meal', category: 'meal', label: 'Meal' }, { id: 'cafe', category: 'cafe', label: 'Cafe' }],
  },
  metadata,
});

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    experimentMode: 'treatment' as const,
    authenticate: jest.fn(async () => ({ id: 'user-1' })),
    loadSession: jest.fn(async () => session()),
    loadSteps: jest.fn(async () => rows),
    loadHistory: jest.fn(async () => ({
      status: 'loaded' as const,
      context: {
        recentHardPlaceIds: ['place-old'], recentExposure: {}, negativeActions: {}, feedback: {}, qualifiedPairs: [],
      },
      recentHistoryExcludedCount: 1,
    })),
    searchCandidates: jest.fn(async () => ({ candidates: [candidate('cafe', 'CE7')] })),
    now: () => 100,
    ...overrides,
  };
}

describe('replacement candidates handler', () => {
  it('forces stored Treatment to effective Control without loading history when the experiment is disabled', async () => {
    const deps = dependencies({ experimentMode: 'off' });

    const result = await handleReplacementCandidates({
      method: 'POST', authorization: 'Bearer token', body: { sessionId: 'session-1', targetStepId: 'cafe' },
    }, deps);

    expect(deps.loadHistory).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 200,
      metrics: { assignedVariant: 'control', effectiveVariant: 'control', loaderStatus: 'not_attempted' },
    });
  });

  it('keeps a Control response available when a stored Treatment history load fails and excludes the active session from that load', async () => {
    const deps = dependencies({ loadHistory: jest.fn(async () => { throw new Error('database unavailable'); }) });

    const result = await handleReplacementCandidates({
      method: 'POST', authorization: 'Bearer token', body: { sessionId: 'session-1', targetStepId: 'cafe' },
    }, deps);

    expect(deps.loadHistory).toHaveBeenCalledWith(expect.objectContaining({ activeSessionId: 'session-1' }));
    expect(result).toMatchObject({
      status: 200,
      metrics: { assignedVariant: 'treatment', effectiveVariant: 'control', loaderStatus: 'failed' },
      body: { targetStepId: 'cafe' },
    });
  });

  it('does not return category-mismatched candidates from the executable handler response', async () => {
    const deps = dependencies({
      experimentMode: 'off',
      searchCandidates: jest.fn(async () => ({ candidates: [candidate('restaurant', 'FD6'), candidate('cafe', 'CE7')] })),
    });

    const result = await handleReplacementCandidates({
      method: 'POST', authorization: 'Bearer token', body: { sessionId: 'session-1', targetStepId: 'cafe' },
    }, deps);
    const body = result.body as { top: Array<{ kakaoPlaceId: string; scoreBreakdown?: unknown }>; additional: Array<{ kakaoPlaceId: string }> };

    expect([...body.top, ...body.additional].map((entry) => entry.kakaoPlaceId)).toEqual(['place-cafe']);
    expect(body.top[0].scoreBreakdown).toBeUndefined();
  });

  it('rejects expansion-only candidates for a required replacement intent', async () => {
    const expansionOnly = {
      ...candidate('expanded-pork', 'FD6'),
      matchedSearchEvidence: [{ queryId: 'q1', source: 'keyword' as const, page: 1, queryText: '돼지고기구이', phase: 'step_intent', canonicalTerm: '삼겹살', expansionLevel: 1 as const }],
    };
    const exact = {
      ...candidate('exact-pork', 'FD6'),
      matchedSearchEvidence: [{ queryId: 'q2', source: 'keyword' as const, page: 1, queryText: '삼겹살', phase: 'step_intent', canonicalTerm: '삼겹살', expansionLevel: 0 as const }],
    };
    const result = await handleReplacementCandidates({
      method: 'POST', authorization: 'Bearer token', body: { sessionId: 'session-1', targetStepId: 'meal' },
    }, dependencies({
      experimentMode: 'off',
      loadSession: jest.fn(async () => ({ ...session(), originalRequest: { ...session().originalRequest, additionalRequest: '삼겹살은 반드시 먹어야 해' } })),
      searchCandidates: jest.fn(async () => ({ candidates: [expansionOnly, exact] })),
    }));
    const body = result.body as { top: Array<{ kakaoPlaceId: string }>; additional: Array<{ kakaoPlaceId: string }> };

    expect([...body.top, ...body.additional].map((entry) => entry.kakaoPlaceId)).toEqual(['place-exact-pork']);
  });

  it('stores the exact displayed ranks behind an opaque server attestation', async () => {
    const stageCandidateList = jest.fn(async () => 'replacement-list-001');
    const result = await handleReplacementCandidates({
      method: 'POST', authorization: 'Bearer token', body: { sessionId: 'session-1', targetStepId: 'cafe' },
    }, dependencies({ experimentMode: 'off', stageCandidateList }));

    expect(stageCandidateList).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: 'user-1', sessionId: 'session-1', baseRequestId: 'request-1', targetStepId: 'cafe',
      candidates: [{ kakaoPlaceId: 'place-cafe', displayRank: 1 }],
    }));
    expect(result).toMatchObject({ status: 200, body: { candidateListAttestationId: 'replacement-list-001' } });
  });
});

describe('교체 후보 예산 앵커', () => {
  // 교체 요청은 courseSteps를 대상 1개로 좁힌다. 코스 전체 예산을 그대로 실어 보내면
  // 앵커(예산÷장소수)가 전체 예산이 되어 거의 모든 후보가 예산 이내로 판정된다.
  it('코스 전체 예산을 스텝 수로 나눈 몫만 검색에 넘긴다', async () => {
    const searchedRequests: { totalBudgetKRW?: number }[] = [];
    const searchCandidates = jest.fn(async (currentRequest: { totalBudgetKRW?: number }) => {
      searchedRequests.push(currentRequest);
      return { candidates: [candidate('cafe', 'CE7')] };
    });
    const deps = dependencies({
      searchCandidates,
      loadSession: jest.fn(async () => ({
        ...session(),
        originalRequest: { ...session().originalRequest, totalBudgetKRW: 70000 },
      })),
    });

    await handleReplacementCandidates({
      method: 'POST', authorization: 'Bearer token', body: { sessionId: 'session-1', targetStepId: 'cafe' },
    }, deps);

    expect(searchedRequests[0]).toMatchObject({ totalBudgetKRW: 35000 });
  });

  it('예산이 없으면 그대로 없다', async () => {
    const searchedRequests: { totalBudgetKRW?: number }[] = [];
    const searchCandidates = jest.fn(async (currentRequest: { totalBudgetKRW?: number }) => {
      searchedRequests.push(currentRequest);
      return { candidates: [candidate('cafe', 'CE7')] };
    });
    const deps = dependencies({ searchCandidates });

    await handleReplacementCandidates({
      method: 'POST', authorization: 'Bearer token', body: { sessionId: 'session-1', targetStepId: 'cafe' },
    }, deps);

    expect(searchedRequests[0].totalBudgetKRW).toBeUndefined();
  });
});
