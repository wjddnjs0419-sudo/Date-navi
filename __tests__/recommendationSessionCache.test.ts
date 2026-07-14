import {
  RecommendationSessionCache,
  RecommendationSessionCacheError,
} from '../lib/recommendation-session-cache';
import { mapRecommendationSessionPayload } from '../lib/recommendation-session-repository';
import { recommendationSessionRpcFixture } from './recommendation-session-fixture';
import { recommendationRequestFixture } from './recommendation-session-fixture';

const snapshot = () => mapRecommendationSessionPayload(recommendationSessionRpcFixture());

describe('RecommendationSessionCache', () => {
  it('stores and returns a snapshot by sessionId', () => {
    const cache = new RecommendationSessionCache();
    cache.set(snapshot());
    expect(cache.get('req-phase8-001')?.requestId).toBe('req-phase8-001');
  });

  it('rejects expected identity mismatch and a stale overwrite', () => {
    const cache = new RecommendationSessionCache();
    const current = snapshot();
    cache.set(current);

    expect(() => cache.get('req-phase8-001', 'req-other')).toThrow(RecommendationSessionCacheError);
    expect(() => cache.set({ ...current, sessionId: 'session-other' }, 'req-phase8-001'))
      .toThrow(RecommendationSessionCacheError);
    expect(() => cache.set({ ...current, updatedAt: '2026-07-14T09:59:59.000Z' }))
      .toThrow(expect.objectContaining({ code: 'stale_overwrite' }));
  });

  it('hydrates a memory miss and deduplicates concurrent loads', async () => {
    const cache = new RecommendationSessionCache();
    const load = jest.fn(async () => snapshot());

    const [first, second] = await Promise.all([
      cache.getOrHydrate('req-phase8-001', 'req-phase8-001', load),
      cache.getOrHydrate('req-phase8-001', 'req-phase8-001', load),
    ]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(cache.get('req-phase8-001')).toBe(first);
  });

  it('rejects a concurrent load that asks for a different request identity', async () => {
    const cache = new RecommendationSessionCache();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const load = jest.fn(async () => {
      await gate;
      return snapshot();
    });

    const first = cache.getOrHydrate('req-phase8-001', 'req-phase8-001', load);
    const mismatched = cache.getOrHydrate('req-phase8-001', 'req-other', load);
    release();

    await expect(first).resolves.toMatchObject({ requestId: 'req-phase8-001' });
    await expect(mismatched).rejects.toMatchObject({ code: 'identity_mismatch' });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache a loader response for a different session/request identity', async () => {
    const cache = new RecommendationSessionCache();
    const mismatched = { ...snapshot(), requestId: 'req-other' };

    await expect(cache.getOrHydrate(
      'req-phase8-001',
      'req-phase8-001',
      async () => mismatched,
    )).rejects.toMatchObject({ code: 'identity_mismatch' });
    expect(cache.get('req-phase8-001')).toBeUndefined();
  });

  it('holds a validated structured request by requestId without device persistence', () => {
    const cache = new RecommendationSessionCache();
    cache.prepareRequest(recommendationRequestFixture);

    expect(cache.getPreparedRequest('req-phase8-001')).toEqual(recommendationRequestFixture);
    expect(() => cache.getPreparedRequest('missing', true)).toThrow(
      expect.objectContaining({ code: 'missing_prepared_request' }),
    );
    expect(() => cache.prepareRequest({
      ...recommendationRequestFixture,
      totalBudgetKRW: 999_999,
    })).toThrow(expect.objectContaining({ code: 'identity_mismatch' }));
  });
});
