import type { RecommendationRequest } from '../../../shared/recommendation/schemas.ts';
import { discoverQualifiedPlaces, type DiscoveryResult } from './recommendation-discovery.ts';
import type { NormalizedPlace } from './place-provider.ts';
import { evaluateHardEligibility, evaluateQualityGate, type DateQualityContext, type PopularityEligibility } from './place-quality.ts';
import type { ProviderNeutralCandidate } from './provider-neutral-course-selection.ts';
import { rankQualifiedPlaces } from './provider-neutral-ranking.ts';
import {
  recommendationPlaceIdentityKey,
  type RecommendationHistoryContext,
} from '../../../shared/recommendation/recommendation-history.ts';

function dateQualityContext(request: RecommendationRequest): DateQualityContext {
  if (request.courseSteps.some((step) => step.category === 'cafe')
    && (request.specialOccasion || request.moods?.some((mood) => /romantic|로맨틱|분위기/.test(mood)))) {
    return 'romantic_cafe';
  }
  return 'default';
}

function popularityEligibility(place: NormalizedPlace): PopularityEligibility {
  // Local Search does not return review counts. This is deliberately a
  // minimum-confidence signal only; ranking can later use provider-specific
  // popularity evidence without altering this gate's threshold.
  return place.identity.provider === 'naver' ? 'weak' : 'sufficient';
}

function distanceFromLocation(place: NormalizedPlace, request: RecommendationRequest): number {
  if (!place.coordinates) return Number.MAX_SAFE_INTEGER;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(place.coordinates.latitude - request.location.latitude);
  const longitudeDelta = radians(place.coordinates.longitude - request.location.longitude);
  const h = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(request.location.latitude)) * Math.cos(radians(place.coordinates.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export type ProviderNeutralDiscoveryResult = {
  candidates: ProviderNeutralCandidate[];
  discovery: DiscoveryResult;
};

function requiredCategoryCounts(request: RecommendationRequest): Map<NormalizedPlace['category']['normalized'], number> {
  const counts = new Map<NormalizedPlace['category']['normalized'], number>();
  for (const step of request.courseSteps) {
    const category: NormalizedPlace['category']['normalized'] | undefined = step.category === 'restaurant' ? 'meal'
      : step.category === 'bar' ? 'drinks'
        : step.category === 'cafe' || step.category === 'culture' || step.category === 'walk' || step.category === 'activity'
          ? step.category
          : undefined;
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

export async function discoverProviderNeutralCandidates(input: {
  request: RecommendationRequest;
  primaryAttempts: Array<() => Promise<NormalizedPlace[]>>;
  fallbackAttempts: Array<() => Promise<NormalizedPlace[]>>;
  minQualifiedCandidates: number;
  history?: RecommendationHistoryContext;
}): Promise<ProviderNeutralDiscoveryResult> {
  const context = dateQualityContext(input.request);
  const requiredCategories = requiredCategoryCounts(input.request);
  const recentHardIdentities = new Set([
    ...(input.history?.recentHardPlaceIdentities ?? []),
    // Kakao-only history is retained for v1.0.1 fixtures and becomes useful
    // when this provider-neutral discovery falls back to Kakao.
    ...(input.history?.recentHardPlaceIds ?? []).map((providerPlaceId) => ({ provider: 'kakao' as const, providerPlaceId })),
  ].map(recommendationPlaceIdentityKey));
  const discovery = await discoverQualifiedPlaces({
    primaryAttempts: input.primaryAttempts,
    fallbackAttempts: input.fallbackAttempts,
    minQualifiedCandidates: input.minQualifiedCandidates,
    qualify: (place) => {
      if (recentHardIdentities.has(recommendationPlaceIdentityKey(place.identity))) return false;
      if (!evaluateHardEligibility(place, {
        excludedPlaceIds: input.request.excludedPlaceIds,
        excludedCategories: input.request.excludedCategories,
      }).passed) return false;
      return evaluateQualityGate(place, {
        dateContext: context,
        popularityEligibility: popularityEligibility(place),
      }).passed;
    },
    isSufficient: (places) => {
      for (const [category, requiredCount] of requiredCategories) {
        if (places.filter((place) => place.category.normalized === category).length < requiredCount) return false;
      }
      return true;
    },
  });
  const ranked = rankQualifiedPlaces(discovery.places.map((place) => ({
    place,
    quality: evaluateQualityGate(place, {
      dateContext: context,
      popularityEligibility: popularityEligibility(place),
    }),
    distanceFromSearchCenterMeters: distanceFromLocation(place, input.request),
    popularityBonus: popularityEligibility(place) === 'sufficient' ? 1 : 0,
  })));
  return {
    discovery,
    candidates: ranked.map((entry, index) => ({
      candidateId: `provider_candidate_${String(index + 1).padStart(3, '0')}`,
      place: entry.place,
      distanceFromSearchCenterMeters: distanceFromLocation(entry.place, input.request),
      popularityBonus: entry.scoreBreakdown.popularity,
    })),
  };
}
