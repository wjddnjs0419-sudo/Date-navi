import {
  loadRecommendationHistory,
  loadRecommendationHistoryAssignmentScope,
  type RecommendationHistoryQueryAdapter,
} from '../supabase/functions/_shared/recommendation-history';
import { EMPTY_RECOMMENDATION_HISTORY } from '../shared/recommendation/recommendation-history';

const currentLocation = { latitude: 37.5444, longitude: 127.0374 };

function adapter(overrides: Partial<RecommendationHistoryQueryAdapter> = {}): RecommendationHistoryQueryAdapter {
  return {
    getProfile: jest.fn(async () => ({ coupleId: 'couple-current' })),
    getCouple: jest.fn(async () => ({
      id: 'couple-current', ownerUserId: 'user-001', partnerUserId: 'partner-user', status: 'linked',
    })),
    getSessions: jest.fn(async () => [
      {
        id: 'session-current', ownerUserId: 'owner-user', coupleId: 'couple-current',
        createdAt: '2026-07-25T12:00:00.000Z', originalRequest: { location: currentLocation },
      },
      {
        id: 'session-partner', ownerUserId: 'partner-user', coupleId: 'couple-current',
        createdAt: '2026-07-24T12:00:00.000Z', originalRequest: { location: currentLocation },
      },
      {
        id: 'session-other-area', ownerUserId: 'partner-user', coupleId: 'couple-current',
        createdAt: '2026-07-23T12:00:00.000Z', originalRequest: { location: { latitude: 37.6044, longitude: 127.1374 } },
      },
    ]),
    getCourseSteps: jest.fn(async () => [
      { sessionId: 'session-current', originalKakaoPlaceId: 'current-place' },
      { sessionId: 'session-partner', originalKakaoPlaceId: 'partner-place' },
      { sessionId: 'session-other-area', originalKakaoPlaceId: 'other-area-place' },
    ]),
    getStepEvents: jest.fn(async () => [
      {
        sessionId: 'session-partner', eventType: 'place_replaced', previousKakaoPlaceId: 'replaced-place',
        createdAt: '2026-07-20T12:00:00.000Z',
      },
      {
        sessionId: 'session-other-area', eventType: 'place_deleted', previousKakaoPlaceId: 'far-deleted-place',
        createdAt: '2026-07-20T12:00:00.000Z',
      },
    ]),
    getFeedback: jest.fn(async () => [
      { ownerUserId: 'user-001', kakaoPlaceId: 'partner-place', tags: ['revisit', 'quiet', 'photos'] },
      { ownerUserId: 'user-001', kakaoPlaceId: 'out-of-scope-place', tags: ['quiet'] },
      { ownerUserId: 'other-user', kakaoPlaceId: 'other-feedback', tags: ['quiet'] },
    ]),
    getQualifiedPairs: jest.fn(async () => [
      {
        sourceKakaoPlaceId: 'partner-place', targetKakaoPlaceId: 'candidate-pair',
        uniqueCoupleCount: 10, confirmedSelectionCount: 15,
      },
      {
        sourceKakaoPlaceId: 'below-threshold', targetKakaoPlaceId: 'candidate-pair',
        uniqueCoupleCount: 9, confirmedSelectionCount: 15,
      },
    ]),
    ...overrides,
  };
}

describe('recommendation history loader', () => {
  it('returns a couple assignment key only for the authenticated member of a linked current couple', async () => {
    await expect(loadRecommendationHistoryAssignmentScope({
      authenticatedUserId: 'user-001',
      queries: adapter(),
    })).resolves.toEqual({ coupleId: 'couple-current', status: 'loaded' });

    await expect(loadRecommendationHistoryAssignmentScope({
      authenticatedUserId: 'user-001',
      queries: adapter({
        getCouple: jest.fn(async () => ({
          id: 'couple-current', ownerUserId: 'someone-else', partnerUserId: 'another-user', status: 'linked',
        })),
      }),
    })).resolves.toEqual({ status: 'loaded' });

    await expect(loadRecommendationHistoryAssignmentScope({
      authenticatedUserId: 'user-001',
      queries: adapter({ getProfile: jest.fn(async () => { throw new Error('unavailable'); }) }),
    })).resolves.toEqual({ status: 'failed' });
  });

  it('uses only the current linked couple scope, including partner-owned sessions', async () => {
    const queries = adapter();

    const result = await loadRecommendationHistory({
      authenticatedUserId: 'user-001', currentLocation, activeSessionId: 'session-current', queries,
    });

    expect(queries.getSessions).toHaveBeenCalledWith({ coupleId: 'couple-current' });
    expect(result.status).toBe('loaded');
    expect(result.context.recentHardPlaceIds).toEqual(['partner-place']);
    expect(result.context.recentExposure).toEqual({
      'partner-place': { lastSeenAt: '2026-07-24T12:00:00.000Z', sessionDistance: 1 },
    });
    expect(result.context.negativeActions).toEqual({
      'replaced-place': { replacedCount: 1, deletedCount: 0, lastNegativeAt: '2026-07-20T12:00:00.000Z' },
    });
    expect(result.context.feedback).toEqual({
      'partner-place': { revisit: true, quiet: 1, noisy: 0, photos: 1, crowded: 0 },
    });
  });

  it('falls back to authenticated-owner sessions when profile or couple lookup cannot establish a linked couple', async () => {
    const queries = adapter({ getCouple: jest.fn(async () => { throw new Error('lookup unavailable'); }) });

    await loadRecommendationHistory({ authenticatedUserId: 'user-001', currentLocation, queries });

    expect(queries.getSessions).toHaveBeenCalledWith({ ownerUserId: 'user-001' });
  });

  it('orders same-area sessions by created_at, excludes the active session, and ignores malformed or distant locations', async () => {
    const queries = adapter({
      getSessions: jest.fn(async () => [
        { id: 'older', ownerUserId: 'user-001', coupleId: 'couple-current', createdAt: '2026-07-20T00:00:00.000Z', originalRequest: { location: currentLocation } },
        { id: 'active', ownerUserId: 'user-001', coupleId: 'couple-current', createdAt: '2026-07-25T00:00:00.000Z', originalRequest: { location: currentLocation } },
        { id: 'newer', ownerUserId: 'user-001', coupleId: 'couple-current', createdAt: '2026-07-24T00:00:00.000Z', originalRequest: { location: currentLocation } },
        { id: 'bad-location', ownerUserId: 'user-001', coupleId: 'couple-current', createdAt: '2026-07-23T00:00:00.000Z', originalRequest: { location: '{bad json' } },
        { id: 'far', ownerUserId: 'user-001', coupleId: 'couple-current', createdAt: '2026-07-22T00:00:00.000Z', originalRequest: { location: { latitude: 37.7, longitude: 127.2 } } },
      ]),
      getCourseSteps: jest.fn(async () => [
        { sessionId: 'active', originalKakaoPlaceId: 'active-place' },
        { sessionId: 'newer', originalKakaoPlaceId: 'new-place' },
        { sessionId: 'older', originalKakaoPlaceId: 'old-place' },
        { sessionId: 'bad-location', originalKakaoPlaceId: 'bad-place' },
        { sessionId: 'far', originalKakaoPlaceId: 'far-place' },
      ]),
    });

    const result = await loadRecommendationHistory({
      authenticatedUserId: 'user-001', currentLocation, activeSessionId: 'active', queries,
    });

    expect(result.context.recentHardPlaceIds).toEqual(['new-place', 'old-place']);
    expect(result.context.recentExposure).toEqual({
      'new-place': { lastSeenAt: '2026-07-24T00:00:00.000Z', sessionDistance: 1 },
      'old-place': { lastSeenAt: '2026-07-20T00:00:00.000Z', sessionDistance: 2 },
    });
  });

  it('isolates malformed auxiliary rows and failed auxiliary queries without discarding valid history', async () => {
    const queries = adapter({
      getCourseSteps: jest.fn(async () => [
        { sessionId: 'session-current', originalKakaoPlaceId: 'current-place' },
        { sessionId: 'session-partner', originalKakaoPlaceId: 'partner-place' },
        { sessionId: 'session-partner', originalKakaoPlaceId: '' },
      ]),
      getStepEvents: jest.fn(async () => [
        { sessionId: 'session-partner', eventType: 'place_deleted', previousKakaoPlaceId: 'deleted-place', createdAt: '2026-07-20T00:00:00.000Z' },
        { sessionId: 'session-partner', eventType: 'place_deleted', previousKakaoPlaceId: 123, createdAt: 'not-a-date' },
      ]),
      getFeedback: jest.fn(async () => { throw new Error('feedback unavailable'); }),
      getQualifiedPairs: jest.fn(async () => { throw new Error('pair stats unavailable'); }),
    });

    const result = await loadRecommendationHistory({
      authenticatedUserId: 'user-001', currentLocation, activeSessionId: 'session-current', queries,
    });

    expect(result.status).toBe('loaded');
    expect(result.context.recentHardPlaceIds).toEqual(['partner-place']);
    expect(result.context.negativeActions).toEqual({
      'deleted-place': { replacedCount: 0, deletedCount: 1, lastNegativeAt: '2026-07-20T00:00:00.000Z' },
    });
    expect(result.context.feedback).toEqual({});
    expect(result.context.qualifiedPairs).toEqual([]);
  });

  it('returns the empty context when the scoped session query fails', async () => {
    const queries = adapter({ getSessions: jest.fn(async () => { throw new Error('database unavailable'); }) });

    const result = await loadRecommendationHistory({ authenticatedUserId: 'user-001', currentLocation, queries });

    expect(result).toEqual({
      context: EMPTY_RECOMMENDATION_HISTORY,
      status: 'failed',
      recentHistoryExcludedCount: 0,
    });
  });
});
