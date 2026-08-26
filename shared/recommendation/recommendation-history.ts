export type RecommendationHistoryContext = {
  recentHardPlaceIds: string[];
  recentExposure: Record<string, { lastSeenAt: string; sessionDistance: number }>;
  /** Provider-scoped identities for provider-neutral discovery. Optional for v1.0.1 fixtures/clients. */
  recentHardPlaceIdentities?: RecommendationPlaceIdentity[];
  recentProviderExposure?: Record<string, { lastSeenAt: string; sessionDistance: number }>;
  negativeActions: Record<string, { replacedCount: number; deletedCount: number; lastNegativeAt: string }>;
  feedback: Record<string, { revisit: boolean; quiet: number; noisy: number; photos: number; crowded: number }>;
  qualifiedPairs: Array<{ sourceKakaoPlaceId: string; targetKakaoPlaceId: string }>;
};

export type RecommendationPlaceIdentity = {
  provider: 'kakao' | 'naver';
  providerPlaceId: string;
};

export function recommendationPlaceIdentityKey(identity: RecommendationPlaceIdentity): string {
  return `${identity.provider}:${identity.providerPlaceId}`;
}

export const EMPTY_RECOMMENDATION_HISTORY: RecommendationHistoryContext = Object.freeze({
  recentHardPlaceIds: Object.freeze([]) as unknown as string[],
  recentExposure: Object.freeze({}) as Record<string, { lastSeenAt: string; sessionDistance: number }>,
  negativeActions: Object.freeze({}) as Record<string, { replacedCount: number; deletedCount: number; lastNegativeAt: string }>,
  feedback: Object.freeze({}) as Record<string, { revisit: boolean; quiet: number; noisy: number; photos: number; crowded: number }>,
  qualifiedPairs: Object.freeze([]) as unknown as Array<{ sourceKakaoPlaceId: string; targetKakaoPlaceId: string }>,
});

export type HistoryPolicyResult<TCandidate = unknown> = {
  candidates: TCandidate[];
  recentHistoryExcludedCount: number;
  reintroducedPlaceIds: string[];
};

type ScoreTimeOptions = { now?: string };

export type DiversityScoreOptions = ScoreTimeOptions & { reintroduced?: boolean };

export type BehaviorScoreOptions = ScoreTimeOptions & {
  quietPreferred?: boolean;
  photoFriendlyPreferred?: boolean;
};

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function isWithinNinetyDays(timestamp: string, now: string | undefined): boolean {
  const seenAt = Date.parse(timestamp);
  const current = Date.parse(now ?? new Date().toISOString());
  return Number.isFinite(seenAt)
    && Number.isFinite(current)
    && current >= seenAt
    && current - seenAt <= NINETY_DAYS_MS;
}

export function diversityScoreFor(
  kakaoPlaceId: string,
  history: RecommendationHistoryContext,
  options: DiversityScoreOptions = {},
): number {
  if (history.recentHardPlaceIds.includes(kakaoPlaceId)) return options.reintroduced ? -30 : 0;
  const exposure = history.recentExposure[kakaoPlaceId];
  if (!exposure) return 0;
  if (exposure.sessionDistance >= 3 && exposure.sessionDistance <= 5) return -15;
  if (exposure.sessionDistance >= 6 || isWithinNinetyDays(exposure.lastSeenAt, options.now)) return -5;
  return 0;
}

export function behaviorScoreFor(
  kakaoPlaceId: string,
  history: RecommendationHistoryContext,
  options: BehaviorScoreOptions = {},
): number {
  const negative = history.negativeActions[kakaoPlaceId];
  const feedback = history.feedback[kakaoPlaceId];
  let score = negative
    && (negative.replacedCount > 0 || negative.deletedCount > 0)
    && isWithinNinetyDays(negative.lastNegativeAt, options.now)
    ? -30
    : 0;
  if (feedback) {
    if (feedback.revisit) score += 5;
    if (options.quietPreferred && feedback.quiet > 0) score += 5;
    if (options.quietPreferred && feedback.noisy > 0) score -= 8;
    if (options.quietPreferred && feedback.crowded > 0) score -= 8;
    if (options.photoFriendlyPreferred && feedback.photos > 0) score += 5;
  }
  return Math.max(-40, Math.min(10, score));
}

export function pairBonusForAdjacentPlaces(
  kakaoPlaceId: string,
  adjacentKakaoPlaceIds: readonly string[],
  history: RecommendationHistoryContext,
): number {
  let matches = 0;
  for (const adjacentKakaoPlaceId of adjacentKakaoPlaceIds) {
    if (history.qualifiedPairs.some((pair) => (
      (pair.sourceKakaoPlaceId === kakaoPlaceId && pair.targetKakaoPlaceId === adjacentKakaoPlaceId)
      || (pair.targetKakaoPlaceId === kakaoPlaceId && pair.sourceKakaoPlaceId === adjacentKakaoPlaceId)
    ))) {
      matches += 1;
    }
  }
  return Math.min(6, matches * 3);
}

export function compareCandidatesStably(
  a: { score: number; kakaoPlaceId: string },
  b: { score: number; kakaoPlaceId: string },
): number {
  return b.score - a.score || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId);
}
