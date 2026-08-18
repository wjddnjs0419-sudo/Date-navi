import type { NormalizedPlace } from './place-provider.ts';
import type { QualityAssessment } from './place-quality.ts';

export type QualifiedPlaceInput = {
  place: NormalizedPlace;
  quality: QualityAssessment;
  distanceFromSearchCenterMeters: number;
  popularityBonus: number;
};

export type QualifiedPlaceCandidate = {
  place: NormalizedPlace;
  quality: QualityAssessment;
  scoreBreakdown: { distance: number; popularity: number };
  score: number;
};

export function rankQualifiedPlaces(input: readonly QualifiedPlaceInput[]): QualifiedPlaceCandidate[] {
  return input
    .filter((entry) => entry.quality.passed)
    .map((entry) => {
      const scoreBreakdown = {
        distance: Math.max(0, 20 - Math.floor(entry.distanceFromSearchCenterMeters / 250)),
        popularity: entry.popularityBonus,
      };
      return {
        place: entry.place,
        quality: entry.quality,
        scoreBreakdown,
        score: scoreBreakdown.distance + scoreBreakdown.popularity,
      };
    })
    .sort((a, b) => b.score - a.score
      || a.place.identity.provider.localeCompare(b.place.identity.provider)
      || a.place.identity.providerPlaceId.localeCompare(b.place.identity.providerPlaceId));
}
