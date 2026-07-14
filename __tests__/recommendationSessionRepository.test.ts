import {
  RecommendationSessionRepositoryError,
  createRecommendationSessionRepository,
  mapRecommendationSessionPayload,
} from '../lib/recommendation-session-repository';
import {
  recommendDateResponseFixture,
  recommendationRequestFixture,
  recommendationSessionRpcFixture,
} from './recommendation-session-fixture';

describe('recommendation session mapper/repository', () => {
  it('round-trips the Phase 7 response with ordered original/current step identity and metadata', () => {
    const snapshot = mapRecommendationSessionPayload(recommendationSessionRpcFixture());

    expect(snapshot.sessionId).toBe(recommendDateResponseFixture.course.sessionId);
    expect(snapshot.requestId).toBe(recommendDateResponseFixture.requestId);
    expect(snapshot.request).toEqual(recommendationRequestFixture);
    expect(snapshot.response).toEqual(recommendDateResponseFixture);
    expect(snapshot.response.metadata.search.candidateCount).toBe(2);
    expect(snapshot.steps.map((step) => step.stepId)).toEqual(['step-meal', 'step-cafe']);
    expect(snapshot.steps[0]).toMatchObject({
      originalCandidateId: 'candidate-meal',
      originalKakaoPlaceId: 'place-meal',
      currentCandidateId: 'candidate-meal',
      currentKakaoPlaceId: 'place-meal',
      locked: false,
    });
  });

  it('accepts PostgreSQL timestamptz JSON values with a numeric UTC offset', () => {
    const payload = recommendationSessionRpcFixture();
    payload.session.created_at = '2026-07-14T10:00:01+00:00';
    payload.session.updated_at = '2026-07-14T10:00:01+00:00';
    for (const step of payload.steps) {
      step.created_at = '2026-07-14T10:00:01+00:00';
      step.updated_at = '2026-07-14T10:00:01+00:00';
    }

    expect(mapRecommendationSessionPayload(payload).updatedAt).toBe('2026-07-14T10:00:01+00:00');
  });

  it.each([
    ['session/request mismatch', () => {
      const payload = recommendationSessionRpcFixture();
      payload.session.request_id = 'req-other';
      return payload;
    }],
    ['unordered rows', () => {
      const payload = recommendationSessionRpcFixture();
      payload.steps.reverse();
      return payload;
    }],
    ['step identity mismatch', () => {
      const payload = recommendationSessionRpcFixture();
      payload.steps[0].current_kakao_place_id = 'place-invented';
      return payload;
    }],
    ['malformed nullable field', () => {
      const payload = recommendationSessionRpcFixture();
      (payload.session as { couple_id: unknown }).couple_id = 42;
      return payload;
    }],
  ])('rejects malformed hydrated payload: %s', (_name, mutate) => {
    expect(() => mapRecommendationSessionPayload(mutate())).toThrow(RecommendationSessionRepositoryError);
  });

  it('persists a server-attested response through one opaque-ID RPC transaction', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: recommendationSessionRpcFixture(), error: null });
    const repository = createRecommendationSessionRepository({ rpc });

    const snapshot = await repository.persist(recommendationRequestFixture.requestId);

    expect(snapshot.sessionId).toBe(recommendDateResponseFixture.course.sessionId);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('persist_recommendation_session', {
      p_request_id: recommendationRequestFixture.requestId,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_owner_user_id');
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_couple_id');
  });

  it('surfaces atomic persistence failure without attempting a client-side step write or cleanup', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } });
    const repository = createRecommendationSessionRepository({ rpc });

    await expect(repository.persist(recommendationRequestFixture.requestId))
      .rejects.toMatchObject({ code: 'persist_failed' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('hydrates with one owner-filtered RPC and maps missing/unauthorized/malformed failures', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: recommendationSessionRpcFixture(), error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'not authenticated' } })
      .mockResolvedValueOnce({ data: { session: {}, steps: [] }, error: null });
    const repository = createRecommendationSessionRepository({ rpc });

    await expect(repository.hydrate('req-phase8-001')).resolves.toMatchObject({ sessionId: 'req-phase8-001' });
    await expect(repository.hydrate('missing')).rejects.toMatchObject({ code: 'not_found' });
    await expect(repository.hydrate('private')).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(repository.hydrate('malformed')).rejects.toMatchObject({ code: 'malformed' });
    expect(rpc).toHaveBeenNthCalledWith(1, 'get_recommendation_session', { p_session_id: 'req-phase8-001' });
  });
});
