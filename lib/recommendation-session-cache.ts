import type { RecommendationSessionSnapshot } from './recommendation-session-repository';
import {
  recommendationRequestSchema,
  type RecommendationRequest,
} from '../shared/recommendation/schemas';

export type RecommendationSessionCacheErrorCode =
  | 'identity_mismatch'
  | 'stale_overwrite'
  | 'missing_prepared_request';

export class RecommendationSessionCacheError extends Error {
  constructor(public readonly code: RecommendationSessionCacheErrorCode, message: string) {
    super(message);
    this.name = 'RecommendationSessionCacheError';
  }
}

export class RecommendationSessionCache {
  private readonly sessions = new Map<string, RecommendationSessionSnapshot>();
  private readonly pending = new Map<string, {
    requestId: string;
    promise: Promise<RecommendationSessionSnapshot>;
  }>();
  private readonly preparedRequests = new Map<string, RecommendationRequest>();

  prepareRequest(input: RecommendationRequest): RecommendationRequest {
    const request = recommendationRequestSchema.parse(input);
    const existing = this.preparedRequests.get(request.requestId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(request)) {
      throw new RecommendationSessionCacheError(
        'identity_mismatch',
        'A request ID cannot be reused for different structured input.',
      );
    }
    this.preparedRequests.set(request.requestId, request);
    return request;
  }

  getPreparedRequest(requestId: string, required = false): RecommendationRequest | undefined {
    const request = this.preparedRequests.get(requestId);
    if (!request && required) {
      throw new RecommendationSessionCacheError(
        'missing_prepared_request',
        'The prepared recommendation request is no longer in memory.',
      );
    }
    return request;
  }

  deletePreparedRequest(requestId: string): void {
    this.preparedRequests.delete(requestId);
  }

  get(sessionId: string, expectedRequestId?: string): RecommendationSessionSnapshot | undefined {
    const value = this.sessions.get(sessionId);
    if (value && expectedRequestId && value.requestId !== expectedRequestId) {
      throw new RecommendationSessionCacheError('identity_mismatch', 'Cached request identity does not match the route.');
    }
    return value;
  }

  set(
    snapshot: RecommendationSessionSnapshot,
    expectedSessionId: string = snapshot.sessionId,
    expectedRequestId: string = snapshot.requestId,
  ): RecommendationSessionSnapshot {
    if (snapshot.sessionId !== expectedSessionId || snapshot.requestId !== expectedRequestId) {
      throw new RecommendationSessionCacheError('identity_mismatch', 'Recommendation session identity mismatch.');
    }
    const existing = this.sessions.get(snapshot.sessionId);
    if (existing && Date.parse(snapshot.updatedAt) < Date.parse(existing.updatedAt)) {
      throw new RecommendationSessionCacheError('stale_overwrite', 'A stale recommendation session cannot replace the cache.');
    }
    this.sessions.set(snapshot.sessionId, snapshot);
    return snapshot;
  }

  async getOrHydrate(
    sessionId: string,
    requestId: string,
    loader: (sessionId: string) => Promise<RecommendationSessionSnapshot>,
  ): Promise<RecommendationSessionSnapshot> {
    const cached = this.get(sessionId, requestId);
    if (cached) return cached;
    const existingLoad = this.pending.get(sessionId);
    if (existingLoad) {
      if (existingLoad.requestId !== requestId) {
        throw new RecommendationSessionCacheError(
          'identity_mismatch',
          'A concurrent session load requested a different request identity.',
        );
      }
      return existingLoad.promise;
    }

    const load = loader(sessionId)
      .then((snapshot) => this.set(snapshot, sessionId, requestId))
      .finally(() => {
        if (this.pending.get(sessionId)?.promise === load) this.pending.delete(sessionId);
      });
    this.pending.set(sessionId, { requestId, promise: load });
    return load;
  }

  clear(): void {
    this.sessions.clear();
    this.pending.clear();
    this.preparedRequests.clear();
  }
}
