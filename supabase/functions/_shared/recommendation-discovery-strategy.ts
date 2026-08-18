export type RecommendationDiscoveryStrategy =
  | 'kakao_only'
  | 'naver_shadow'
  | 'naver_primary_with_kakao_fallback';

export function resolveRecommendationDiscoveryStrategy(
  value: string | undefined,
): RecommendationDiscoveryStrategy {
  switch (value) {
    case 'naver_shadow':
    case 'naver_primary_with_kakao_fallback':
      return value;
    default:
      return 'kakao_only';
  }
}

/**
 * The primary-discovery flag is independent from the DB/RPC rollout. A Naver
 * course may only be emitted after the additive session-persistence migration
 * is applied, otherwise the legacy Kakao-only mutation RPC rejects it.
 */
export function providerNeutralSessionPersistenceEnabled(value: string | undefined): boolean {
  return value === 'enabled';
}

/** No user free-text enters telemetry; these are bounded semantic search labels. */
export function naverShadowQueries(input: {
  locationLabel: string;
  locationSource?: 'current' | 'kakao';
  stepLabels: readonly string[];
}): string[] {
  if (input.locationSource === 'current') return [];
  const location = input.locationLabel.trim();
  if (!location) return [];
  return [...new Set(input.stepLabels
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((label) => `${location} ${label}`))];
}
