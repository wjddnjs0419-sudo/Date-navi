import {
  EMPTY_RECOMMENDATION_HISTORY,
  recommendationPlaceIdentityKey,
  type RecommendationPlaceIdentity,
  type RecommendationHistoryContext,
} from '../../../shared/recommendation/recommendation-history.ts';

export type RecommendationHistoryLoad = {
  context: RecommendationHistoryContext;
  status: 'loaded' | 'failed';
  recentHistoryExcludedCount: number;
};

export type RecommendationHistoryQueryAdapter = {
  getProfile: (userId: string) => Promise<{ coupleId: string | null } | null>;
  getCouple: (coupleId: string) => Promise<{
    id: string;
    ownerUserId: string;
    partnerUserId: string | null;
    status: string;
  } | null>;
  getSessions: (scope: { coupleId: string } | { ownerUserId: string }) => Promise<Array<{
    id: unknown;
    ownerUserId: unknown;
    coupleId: unknown;
    createdAt: unknown;
    originalRequest: unknown;
  }>>;
  getCourseSteps: (sessionIds: readonly string[]) => Promise<Array<{
    sessionId: unknown;
    originalKakaoPlaceId: unknown;
    originalPlaceProvider?: unknown;
    originalProviderPlaceId?: unknown;
  }>>;
  getStepEvents: (sessionIds: readonly string[]) => Promise<Array<{
    sessionId: unknown;
    eventType: unknown;
    previousKakaoPlaceId: unknown;
    createdAt: unknown;
  }>>;
  getFeedback: (ownerUserId: string, placeIds: readonly string[]) => Promise<Array<{
    ownerUserId: unknown;
    kakaoPlaceId: unknown;
    tags: unknown;
  }>>;
  getQualifiedPairs: (placeIds: readonly string[]) => Promise<Array<{
    sourceKakaoPlaceId: unknown;
    targetKakaoPlaceId: unknown;
    uniqueCoupleCount: unknown;
    confirmedSelectionCount: unknown;
  }>>;
};

/**
 * Creates the service-role-only adapter used by Edge entrypoints. The loader still
 * checks every returned row against its resolved scope, so a widened query result
 * cannot cross the history ownership boundary.
 */
export function createSupabaseRecommendationHistoryQueryAdapter(client: any): RecommendationHistoryQueryAdapter {
  const unwrap = async (query: any) => {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  };
  return {
    async getProfile(userId) {
      const data = await unwrap(client.from('date_planner_profiles')
        .select('couple_id').eq('user_id', userId).maybeSingle());
      return data ? { coupleId: typeof data.couple_id === 'string' ? data.couple_id : null } : null;
    },
    async getCouple(coupleId) {
      const data = await unwrap(client.from('date_planner_couples')
        .select('id,owner_user_id,partner_user_id,status').eq('id', coupleId).maybeSingle());
      if (!data || typeof data.id !== 'string' || typeof data.owner_user_id !== 'string' || typeof data.status !== 'string') return null;
      return {
        id: data.id,
        ownerUserId: data.owner_user_id,
        partnerUserId: typeof data.partner_user_id === 'string' ? data.partner_user_id : null,
        status: data.status,
      };
    },
    async getSessions(scope) {
      let query = client.from('recommendation_sessions')
        .select('id,owner_user_id,couple_id,created_at,original_request')
        .order('created_at', { ascending: false })
        .limit(50);
      query = 'coupleId' in scope ? query.eq('couple_id', scope.coupleId) : query.eq('owner_user_id', scope.ownerUserId);
      const data = await unwrap(query);
      return Array.isArray(data) ? data.map((row) => ({
        id: row.id,
        ownerUserId: row.owner_user_id,
        coupleId: row.couple_id,
        createdAt: row.created_at,
        originalRequest: row.original_request,
      })) : [];
    },
    async getCourseSteps(sessionIds) {
      if (sessionIds.length === 0) return [];
      const data = await unwrap(client.from('recommendation_course_steps')
        .select('session_id,original_kakao_place_id,original_place_provider,original_provider_place_id')
        .in('session_id', sessionIds).limit(200));
      return Array.isArray(data) ? data.map((row) => ({
        sessionId: row.session_id,
        originalKakaoPlaceId: row.original_kakao_place_id,
        originalPlaceProvider: row.original_place_provider,
        originalProviderPlaceId: row.original_provider_place_id,
      })) : [];
    },
    async getStepEvents(sessionIds) {
      if (sessionIds.length === 0) return [];
      const data = await unwrap(client.from('recommendation_step_events')
        .select('session_id,event_type,previous_kakao_place_id,created_at')
        .in('session_id', sessionIds).order('created_at', { ascending: false }).limit(500));
      return Array.isArray(data) ? data.map((row) => ({
        sessionId: row.session_id,
        eventType: row.event_type,
        previousKakaoPlaceId: row.previous_kakao_place_id,
        createdAt: row.created_at,
      })) : [];
    },
    async getFeedback(ownerUserId, placeIds) {
      if (placeIds.length === 0) return [];
      const data = await unwrap(client.from('place_feedback')
        .select('owner_user_id,kakao_place_id,tags').eq('owner_user_id', ownerUserId).in('kakao_place_id', placeIds)
        .order('updated_at', { ascending: false }).limit(200));
      return Array.isArray(data) ? data.map((row) => ({
        ownerUserId: row.owner_user_id,
        kakaoPlaceId: row.kakao_place_id,
        tags: row.tags,
      })) : [];
    },
    async getQualifiedPairs(placeIds) {
      if (placeIds.length === 0) return [];
      const selectPairs = (column: 'source_kakao_place_id' | 'target_kakao_place_id') => unwrap(
        client.from('place_pair_stats')
          .select('source_kakao_place_id,target_kakao_place_id,unique_couple_count,confirmed_selection_count')
          .gte('unique_couple_count', 10).gte('confirmed_selection_count', 15)
          .in(column, placeIds).limit(200),
      );
      const [sourcePairs, targetPairs] = await Promise.all([selectPairs('source_kakao_place_id'), selectPairs('target_kakao_place_id')]);
      const data = [...(Array.isArray(sourcePairs) ? sourcePairs : []), ...(Array.isArray(targetPairs) ? targetPairs : [])];
      return Array.isArray(data) ? data.map((row) => ({
        sourceKakaoPlaceId: row.source_kakao_place_id,
        targetKakaoPlaceId: row.target_kakao_place_id,
        uniqueCoupleCount: row.unique_couple_count,
        confirmedSelectionCount: row.confirmed_selection_count,
      })) : [];
    },
  };
}

type Coordinate = { latitude: number; longitude: number };

const emptyLoad = (): RecommendationHistoryLoad => ({
  context: EMPTY_RECOMMENDATION_HISTORY,
  status: 'failed',
  recentHistoryExcludedCount: 0,
});

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function providerIdentityFromStep(step: {
  originalKakaoPlaceId: unknown;
  originalPlaceProvider?: unknown;
  originalProviderPlaceId?: unknown;
}): RecommendationPlaceIdentity | undefined {
  const provider = step.originalPlaceProvider === 'kakao' || step.originalPlaceProvider === 'naver'
    ? step.originalPlaceProvider
    : undefined;
  const providerPlaceId = asNonEmptyString(step.originalProviderPlaceId);
  if (provider && providerPlaceId) return { provider, providerPlaceId };
  const kakaoPlaceId = asNonEmptyString(step.originalKakaoPlaceId);
  return kakaoPlaceId ? { provider: 'kakao', providerPlaceId: kakaoPlaceId } : undefined;
}

function coordinateFrom(value: unknown): Coordinate | undefined {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return undefined;
    }
  }
  const record = asRecord(parsed);
  if (!record || typeof record.latitude !== 'number' || typeof record.longitude !== 'number'
    || !Number.isFinite(record.latitude) || !Number.isFinite(record.longitude)
    || record.latitude < -90 || record.latitude > 90 || record.longitude < -180 || record.longitude > 180) {
    return undefined;
  }
  return { latitude: record.latitude, longitude: record.longitude };
}

function requestLocation(value: unknown): Coordinate | undefined {
  const request = asRecord(value);
  return request ? coordinateFrom(request.location) : undefined;
}

function haversineDistanceMeters(a: Coordinate, b: Coordinate): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

function isCurrentCouple(
  profile: { coupleId: string | null } | null,
  couple: { id: string; ownerUserId: string; partnerUserId: string | null; status: string } | null,
  authenticatedUserId: string,
): profile is { coupleId: string } {
  return Boolean(profile?.coupleId && couple?.id === profile.coupleId && couple.status === 'linked'
    && (couple.ownerUserId === authenticatedUserId || couple.partnerUserId === authenticatedUserId));
}

/**
 * Resolves only the server-owned experiment assignment unit. An unlinked
 * lookup uses the authenticated user; a failed lookup remains distinguishable
 * so callers can fail closed instead of splitting a linked pair by accident.
 */
export async function loadRecommendationHistoryAssignmentScope(input: {
  authenticatedUserId: string;
  queries: Pick<RecommendationHistoryQueryAdapter, 'getProfile' | 'getCouple'>;
}): Promise<{ coupleId?: string; status: 'loaded' | 'failed' }> {
  try {
    const profile = await input.queries.getProfile(input.authenticatedUserId);
    const couple = profile?.coupleId ? await input.queries.getCouple(profile.coupleId) : null;
    return isCurrentCouple(profile, couple, input.authenticatedUserId)
      ? { coupleId: profile.coupleId, status: 'loaded' }
      : { status: 'loaded' };
  } catch {
    return { status: 'failed' };
  }
}

export async function loadRecommendationHistory(input: {
  authenticatedUserId: string;
  currentLocation: Coordinate;
  activeSessionId?: string;
  queries: RecommendationHistoryQueryAdapter;
}): Promise<RecommendationHistoryLoad> {
  let scope: { coupleId: string } | { ownerUserId: string } = { ownerUserId: input.authenticatedUserId };
  try {
    const profile = await input.queries.getProfile(input.authenticatedUserId);
    const couple = profile?.coupleId ? await input.queries.getCouple(profile.coupleId) : null;
    if (isCurrentCouple(profile, couple, input.authenticatedUserId)) scope = { coupleId: profile.coupleId };
  } catch {
    // Missing/unavailable couple data deliberately narrows to the authenticated owner's sessions.
  }

  let sessions: Awaited<ReturnType<RecommendationHistoryQueryAdapter['getSessions']>>;
  let courseSteps: Awaited<ReturnType<RecommendationHistoryQueryAdapter['getCourseSteps']>>;
  try {
    sessions = await input.queries.getSessions(scope);
    const scopedSessions = sessions.filter((session) => (
      typeof session.id === 'string'
      && (('coupleId' in scope && session.coupleId === scope.coupleId)
        || ('ownerUserId' in scope && session.ownerUserId === scope.ownerUserId))
    ));
    sessions = scopedSessions;
    courseSteps = await input.queries.getCourseSteps(sessions
      .map((session) => session.id)
      .filter((id): id is string => typeof id === 'string'));
  } catch {
    return emptyLoad();
  }

  const activeSessionId = input.activeSessionId;
  const sessionById = new Map(sessions
    .filter((session): session is typeof session & { id: string; createdAt: string } => (
      typeof session.id === 'string' && typeof session.createdAt === 'string'
      && Number.isFinite(Date.parse(session.createdAt)) && session.id !== activeSessionId
    ))
    .filter((session) => {
      const location = requestLocation(session.originalRequest);
      return Boolean(location && haversineDistanceMeters(input.currentLocation, location) <= 2_000);
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
    .map((session) => [session.id, session]));

  const stepIdsBySession = new Map<string, string[]>();
  const placeIdentitiesBySession = new Map<string, RecommendationPlaceIdentity[]>();
  for (const step of courseSteps) {
    const sessionId = asNonEmptyString(step.sessionId);
    const identity = providerIdentityFromStep(step);
    if (!sessionId || !identity || !sessionById.has(sessionId)) continue;
    const identities = placeIdentitiesBySession.get(sessionId) ?? [];
    const identityKey = recommendationPlaceIdentityKey(identity);
    if (!identities.some((entry) => recommendationPlaceIdentityKey(entry) === identityKey)) identities.push(identity);
    placeIdentitiesBySession.set(sessionId, identities);
    if (identity.provider === 'kakao') {
      const ids = stepIdsBySession.get(sessionId) ?? [];
      if (!ids.includes(identity.providerPlaceId)) ids.push(identity.providerPlaceId);
      stepIdsBySession.set(sessionId, ids);
    }
  }

  const recentHardPlaceIds: string[] = [];
  const recentExposure: RecommendationHistoryContext['recentExposure'] = {};
  const recentHardPlaceIdentities: RecommendationPlaceIdentity[] = [];
  const recentProviderExposure: NonNullable<RecommendationHistoryContext['recentProviderExposure']> = {};
  [...sessionById.values()].forEach((session, index) => {
    const sessionDistance = index + 1;
    for (const identity of placeIdentitiesBySession.get(session.id) ?? []) {
      const identityKey = recommendationPlaceIdentityKey(identity);
      if (sessionDistance <= 2 && !recentHardPlaceIdentities.some((entry) => recommendationPlaceIdentityKey(entry) === identityKey)) {
        recentHardPlaceIdentities.push(identity);
      }
      const providerPrior = recentProviderExposure[identityKey];
      if (!providerPrior || sessionDistance < providerPrior.sessionDistance) {
        recentProviderExposure[identityKey] = { lastSeenAt: session.createdAt, sessionDistance };
      }
    }
    for (const placeId of stepIdsBySession.get(session.id) ?? []) {
      if (sessionDistance <= 2 && !recentHardPlaceIds.includes(placeId)) recentHardPlaceIds.push(placeId);
      const prior = recentExposure[placeId];
      if (!prior || sessionDistance < prior.sessionDistance) {
        recentExposure[placeId] = { lastSeenAt: session.createdAt, sessionDistance };
      }
    }
  });

  const sessionIds = [...sessionById.keys()];
  const exposedPlaceIds = Object.keys(recentExposure).sort();
  const [eventsResult, feedbackResult, pairsResult] = await Promise.allSettled([
    input.queries.getStepEvents(sessionIds),
    input.queries.getFeedback(input.authenticatedUserId, exposedPlaceIds),
    input.queries.getQualifiedPairs(exposedPlaceIds),
  ]);

  const negativeActions: RecommendationHistoryContext['negativeActions'] = {};
  if (eventsResult.status === 'fulfilled') {
    const allowedSessionIds = new Set(sessionIds);
    for (const event of eventsResult.value) {
      const eventSessionId = asNonEmptyString(event.sessionId);
      const eventType = asNonEmptyString(event.eventType);
      const placeId = asNonEmptyString(event.previousKakaoPlaceId);
      const createdAt = asNonEmptyString(event.createdAt);
      if (!eventSessionId || !allowedSessionIds.has(eventSessionId) || !placeId || !createdAt || !Number.isFinite(Date.parse(createdAt))
        || (eventType !== 'place_replaced' && eventType !== 'place_deleted')) continue;
      const existing = negativeActions[placeId] ?? { replacedCount: 0, deletedCount: 0, lastNegativeAt: createdAt };
      negativeActions[placeId] = {
        replacedCount: existing.replacedCount + (eventType === 'place_replaced' ? 1 : 0),
        deletedCount: existing.deletedCount + (eventType === 'place_deleted' ? 1 : 0),
        lastNegativeAt: Date.parse(createdAt) > Date.parse(existing.lastNegativeAt) ? createdAt : existing.lastNegativeAt,
      };
    }
  }

  const feedback: RecommendationHistoryContext['feedback'] = {};
  if (feedbackResult.status === 'fulfilled') {
    const allowedPlaceIds = new Set(exposedPlaceIds);
    for (const row of feedbackResult.value) {
      const placeId = asNonEmptyString(row.kakaoPlaceId);
      if (row.ownerUserId !== input.authenticatedUserId || !placeId || !allowedPlaceIds.has(placeId) || !Array.isArray(row.tags)
        || !row.tags.every((tag) => typeof tag === 'string')) continue;
      const current = feedback[placeId] ?? { revisit: false, quiet: 0, noisy: 0, photos: 0, crowded: 0 };
      feedback[placeId] = {
        revisit: current.revisit || row.tags.includes('revisit'),
        quiet: current.quiet + (row.tags.includes('quiet') ? 1 : 0),
        noisy: current.noisy + (row.tags.includes('noisy') ? 1 : 0),
        photos: current.photos + (row.tags.includes('photos') ? 1 : 0),
        crowded: current.crowded + (row.tags.includes('crowded') ? 1 : 0),
      };
    }
  }

  const qualifiedPairs: RecommendationHistoryContext['qualifiedPairs'] = [];
  if (pairsResult.status === 'fulfilled') {
    const seenPairs = new Set<string>();
    for (const pair of pairsResult.value) {
      const sourceKakaoPlaceId = asNonEmptyString(pair.sourceKakaoPlaceId);
      const targetKakaoPlaceId = asNonEmptyString(pair.targetKakaoPlaceId);
      if (!sourceKakaoPlaceId || !targetKakaoPlaceId || sourceKakaoPlaceId === targetKakaoPlaceId
        || typeof pair.uniqueCoupleCount !== 'number' || pair.uniqueCoupleCount < 10
        || typeof pair.confirmedSelectionCount !== 'number' || pair.confirmedSelectionCount < 15) continue;
      const key = `${sourceKakaoPlaceId}\u0000${targetKakaoPlaceId}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      qualifiedPairs.push({ sourceKakaoPlaceId, targetKakaoPlaceId });
    }
    qualifiedPairs.sort((a, b) => a.sourceKakaoPlaceId.localeCompare(b.sourceKakaoPlaceId)
      || a.targetKakaoPlaceId.localeCompare(b.targetKakaoPlaceId));
  }

  return {
    context: {
      recentHardPlaceIds,
      recentExposure,
      recentHardPlaceIdentities,
      recentProviderExposure,
      negativeActions,
      feedback,
      qualifiedPairs,
    },
    status: 'loaded',
    recentHistoryExcludedCount: new Set(recentHardPlaceIdentities.map(recommendationPlaceIdentityKey)).size,
  };
}
