import { z } from 'zod';
import {
  rankReplacementCandidates,
  storedReplacementHistoryVariant,
  toReplacementCandidateDisplay,
} from '../../../shared/recommendation/replacement-candidates.ts';
import { EMPTY_RECOMMENDATION_HISTORY, type RecommendationHistoryContext } from '../../../shared/recommendation/recommendation-history.ts';
import { recommendationRequestSchema, type RecommendationRequest } from '../../../shared/recommendation/schemas.ts';
import type { RecommendationCourseStep } from '../../../shared/recommendation/contracts.ts';
import type { PlaceCandidate } from './recommendation-ranking.ts';
import type { RecommendationHistoryLoad } from './recommendation-history.ts';
import { candidateMatchesCategory } from './recommendation-course-selection.ts';
import { effectiveStepIntents, placeMatchesStepIntent } from './step-intent.ts';

const bodySchema = z.object({
  sessionId: z.string().trim().min(1).max(120),
  targetStepId: z.string().trim().min(1).max(80),
}).strict();

export type ReplacementCourseStepRow = {
  step_id: string;
  step_order: number;
  category: string;
  label: string;
  current_kakao_place_id: string;
  current_candidate_id: string;
  place_name: string;
  address: string;
  road_address: string;
  map_url: string;
  latitude: number;
  longitude: number;
  reason: string;
  locked: boolean;
};

export type ReplacementCandidatesHandlerDependencies = {
  /** Operational kill switch. A disabled experiment always uses Control/empty history. */
  experimentEnabled: boolean;
  authenticate: (authorization: string) => Promise<{ id: string } | null>;
  loadSession: (sessionId: string) => Promise<{
    originalRequest: unknown;
    latestRequest?: unknown;
    metadata?: unknown;
  } | null>;
  loadSteps: (sessionId: string) => Promise<ReplacementCourseStepRow[]>;
  loadHistory: (input: {
    authenticatedUserId: string;
    currentLocation: { latitude: number; longitude: number };
    activeSessionId: string;
  }) => Promise<RecommendationHistoryLoad>;
  searchCandidates: (request: RecommendationRequest) => Promise<{ candidates: PlaceCandidate[] }>;
  now?: () => number;
};

export type ReplacementCandidatesMetrics = {
  assignedVariant: 'control' | 'treatment';
  effectiveVariant: 'control' | 'treatment';
  poolSize: number;
  topThreeRepeatCount: number;
  empty: boolean;
  latencyMs: number;
  loaderStatus: 'not_attempted' | 'loaded' | 'failed';
};

export type ReplacementCandidatesHandlerResult = {
  status: number;
  body: unknown;
  metrics?: ReplacementCandidatesMetrics;
};

const result = (status: number, body: unknown): ReplacementCandidatesHandlerResult => ({ status, body });

const toStep = (row: ReplacementCourseStepRow): RecommendationCourseStep => ({
  stepId: row.step_id,
  order: row.step_order,
  category: row.category,
  label: row.label,
  candidateId: row.current_candidate_id,
  kakaoPlaceId: row.current_kakao_place_id,
  name: row.place_name,
  address: row.address,
  roadAddress: row.road_address,
  mapUrl: row.map_url,
  latitude: row.latitude,
  longitude: row.longitude,
  reason: row.reason,
  locked: row.locked,
});

export async function handleReplacementCandidates(
  input: { method: string; authorization?: string | null; body: unknown },
  dependencies: ReplacementCandidatesHandlerDependencies,
): Promise<ReplacementCandidatesHandlerResult> {
  if (input.method === 'OPTIONS') return result(204, null);
  if (input.method !== 'POST') return result(405, { error: 'INVALID_INPUT' });
  const authorization = input.authorization?.trim();
  if (!authorization) return result(401, { error: 'AUTH_EXPIRED' });
  const parsed = bodySchema.safeParse(input.body);
  if (!parsed.success) return result(400, { error: 'INVALID_INPUT' });

  let user: { id: string } | null;
  try {
    user = await dependencies.authenticate(authorization);
  } catch {
    user = null;
  }
  if (!user) return result(401, { error: 'AUTH_EXPIRED' });

  const [session, rows] = await Promise.all([
    dependencies.loadSession(parsed.data.sessionId),
    dependencies.loadSteps(parsed.data.sessionId),
  ]);
  const baseRequest = recommendationRequestSchema.safeParse(session?.latestRequest ?? session?.originalRequest);
  const target = rows.find((row) => row.step_id === parsed.data.targetStepId);
  if (!baseRequest.success || !target || rows.length < 2) return result(404, { error: 'NOT_FOUND' });

  const currentRequest: RecommendationRequest = {
    ...baseRequest.data,
    courseSteps: [{ id: target.step_id, category: target.category, label: target.label }],
    excludedPlaceIds: [...new Set([...(baseRequest.data.excludedPlaceIds ?? []), ...rows.map((row) => row.current_kakao_place_id)])],
  };
  const startedAt = (dependencies.now ?? Date.now)();
  // Disabling the experiment intentionally overrides a persisted Treatment arm.
  const assignedVariant = dependencies.experimentEnabled
    ? storedReplacementHistoryVariant(session?.metadata)
    : 'control';
  let effectiveVariant: 'control' | 'treatment' = 'control';
  let loaderStatus: ReplacementCandidatesMetrics['loaderStatus'] = 'not_attempted';
  let history: RecommendationHistoryContext = EMPTY_RECOMMENDATION_HISTORY;
  if (assignedVariant === 'treatment') {
    try {
      const loaded = await dependencies.loadHistory({
        authenticatedUserId: user.id,
        currentLocation: currentRequest.location,
        activeSessionId: parsed.data.sessionId,
      });
      if (loaded.status === 'loaded') {
        history = loaded.context;
        effectiveVariant = 'treatment';
        loaderStatus = 'loaded';
      } else {
        loaderStatus = 'failed';
      }
    } catch {
      loaderStatus = 'failed';
    }
  }

  let search: { candidates: PlaceCandidate[] };
  try {
    search = await dependencies.searchCandidates(currentRequest);
  } catch {
    return result(504, { error: 'PLACE_SEARCH_TIMEOUT' });
  }
  const targetIndex = rows.indexOf(target);
  const previousStep = targetIndex > 0 ? toStep(rows[targetIndex - 1]) : undefined;
  const nextStep = targetIndex < rows.length - 1 ? toStep(rows[targetIndex + 1]) : undefined;
  const requiredTargetIntents = effectiveStepIntents(currentRequest).filter((intent) => (
    intent.stepId === target.step_id && intent.strength === 'required'
  ));
  const hardFilteredCandidates = search.candidates
    .filter((candidate) => candidateMatchesCategory(candidate, target.category))
    .filter((candidate) => requiredTargetIntents.every((intent) => placeMatchesStepIntent(candidate, intent)));
  const ranked = rankReplacementCandidates({
    target: toStep(target),
    previous: previousStep,
    next: nextStep,
    existingKakaoPlaceIds: rows.map((row) => row.current_kakao_place_id),
    candidates: hardFilteredCandidates,
    maxWalkingMinutes: currentRequest.maxWalkingMinutes,
    history,
    preferences: {
      quietPreferred: currentRequest.quietPreferred ?? currentRequest.parsedPreferences?.quietPreferred,
      photoFriendlyPreferred: currentRequest.photoFriendlyPreferred ?? currentRequest.parsedPreferences?.photoFriendlyPreferred,
    },
  });
  const top = ranked.top.map(toReplacementCandidateDisplay);
  const additional = ranked.additional.map(toReplacementCandidateDisplay);
  const topThreeRepeatCount = effectiveVariant === 'treatment'
    ? ranked.top.filter((candidate) => history.recentHardPlaceIds.includes(candidate.kakaoPlaceId)).length
    : 0;
  return {
    status: 200,
    body: { targetStepId: target.step_id, top, additional },
    metrics: {
      assignedVariant,
      effectiveVariant,
      poolSize: ranked.pool.length,
      topThreeRepeatCount,
      empty: ranked.pool.length === 0,
      latencyMs: (dependencies.now ?? Date.now)() - startedAt,
      loaderStatus,
    },
  };
}
