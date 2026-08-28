import type { RecommendationRequest } from '../../../shared/recommendation/schemas.ts';
import { discoverQualifiedPlaces, type DiscoveryResult } from './recommendation-discovery.ts';
import { dedupeNormalizedPlaces } from './place-dedup.ts';
import type { NormalizedPlace } from './place-provider.ts';
import { evaluateHardEligibility, evaluateQualityGate, type DateQualityContext, type PopularityEligibility } from './place-quality.ts';
import type { ProviderNeutralCandidate, StepCandidatePool } from './provider-neutral-course-selection.ts';
import { rankQualifiedPlaces } from './provider-neutral-ranking.ts';
import { effectiveStepIntents } from './step-intent.ts';
import { providerNeutralPlaceMatchesStep, providerNeutralPlaceMatchesStepCategory } from './provider-neutral-intent.ts';
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
  /** Always present for step-scoped discovery; omitted by legacy test adapters. */
  pools?: StepCandidatePool[];
  discovery: DiscoveryResult;
  /** Runtime implementations provide this; optional keeps existing handler fixtures focused on candidates. */
  diagnostics?: ProviderNeutralDiscoveryDiagnostics;
};

type CategoryCounts = Record<string, number>;

export type ProviderNeutralDiscoveryDiagnostics = {
  attempts: Array<{
    phase: 'primary' | 'fallback';
    attemptIndex: number;
    returnedCount: number;
    returnedByCategory: CategoryCounts;
    discoveredCount: number;
    dedupedCount: number;
    dedupedByCategory: CategoryCounts;
    qualifiedCount: number;
    qualifiedByCategory: CategoryCounts;
    rejectedByReason: Record<string, number>;
    sufficient: boolean;
  }>;
  steps?: Array<{
    stepId: string;
    primaryAttemptsRun: number;
    fallbackAttemptsRun: number;
    candidateCount: number;
    selectableCount: number;
    sufficient: boolean;
  }>;
};

export type StepDiscoveryAttempt = {
  stepId: string;
  run: () => Promise<NormalizedPlace[]>;
};

function categoryCounts(places: readonly NormalizedPlace[]): CategoryCounts {
  return places.reduce<CategoryCounts>((counts, place) => {
    const category = place.category.normalized;
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});
}

function canAssignEveryStep(
  places: readonly NormalizedPlace[],
  request: RecommendationRequest,
  requiredIntents: readonly ReturnType<typeof effectiveStepIntents>[number][],
): boolean {
  const requiredIntentByStepId = new Map(requiredIntents.map((intent) => [intent.stepId, intent]));
  const assigned = new Set<string>();
  const assign = (stepIndex: number): boolean => {
    if (stepIndex === request.courseSteps.length) return true;
    const step = request.courseSteps[stepIndex];
    if (!step) return false;
    for (const place of places) {
      const identity = recommendationPlaceIdentityKey(place.identity);
      if (assigned.has(identity)
        || !providerNeutralPlaceMatchesStep(place, step, requiredIntentByStepId.get(step.id))) continue;
      assigned.add(identity);
      if (assign(stepIndex + 1)) return true;
      assigned.delete(identity);
    }
    return false;
  };
  return assign(0);
}

export async function discoverProviderNeutralCandidates(input: {
  request: RecommendationRequest;
  primaryAttempts: Array<() => Promise<NormalizedPlace[]>>;
  fallbackAttempts: Array<() => Promise<NormalizedPlace[]>>;
  minQualifiedCandidates: number;
  history?: RecommendationHistoryContext;
  stepAttempts?: {
    primary: StepDiscoveryAttempt[];
    fallback: StepDiscoveryAttempt[];
  };
}): Promise<ProviderNeutralDiscoveryResult> {
  const context = dateQualityContext(input.request);
  const requiredIntents = effectiveStepIntents(input.request)
    .filter((intent) => intent.strength === 'required');
  const recentHardIdentities = new Set([
    ...(input.history?.recentHardPlaceIdentities ?? []),
    // Kakao-only history is retained for v1.0.1 fixtures and becomes useful
    // when this provider-neutral discovery falls back to Kakao.
    ...(input.history?.recentHardPlaceIds ?? []).map((providerPlaceId) => ({ provider: 'kakao' as const, providerPlaceId })),
  ].map(recommendationPlaceIdentityKey));
  const assess = (place: NormalizedPlace) => {
    if (recentHardIdentities.has(recommendationPlaceIdentityKey(place.identity))) return { passed: false, reasons: ['recent_history'] };
    const hard = evaluateHardEligibility(place, {
      excludedPlaceIds: input.request.excludedPlaceIds,
      excludedCategories: input.request.excludedCategories,
    });
    if (!hard.passed) return { passed: false, reasons: hard.rejectionReasons };
    const quality = evaluateQualityGate(place, {
      dateContext: context,
      popularityEligibility: popularityEligibility(place),
    });
    return { passed: quality.passed, reasons: quality.rejectionReasons };
  };
  if (input.stepAttempts) {
    const pools: StepCandidatePool[] = [];
    const stepDiagnostics: NonNullable<ProviderNeutralDiscoveryDiagnostics['steps']> = [];
    let attemptsRun = 0;
    let fallbackUsed = false;
    let fewerResults = false;

    const makePool = (stepId: string, places: readonly NormalizedPlace[]): StepCandidatePool => {
      const step = input.request.courseSteps.find((candidate) => candidate.id === stepId);
      const requiredIntent = requiredIntents.find((intent) => intent.stepId === stepId);
      const qualified = places.filter((place) => assess(place).passed);
      const ranked = rankQualifiedPlaces(qualified.map((place) => ({
        place,
        quality: evaluateQualityGate(place, {
          dateContext: context,
          popularityEligibility: popularityEligibility(place),
        }),
        distanceFromSearchCenterMeters: distanceFromLocation(place, input.request),
        popularityBonus: popularityEligibility(place) === 'sufficient' ? 1 : 0,
      })));
      const candidates = ranked.map((entry, index): ProviderNeutralCandidate => {
        const categoryMatches = Boolean(step && providerNeutralPlaceMatchesStepCategory(entry.place, step.category));
        const intentMatches = Boolean(step && requiredIntent && providerNeutralPlaceMatchesStep(entry.place, step, requiredIntent));
        return {
          candidateId: `provider_candidate_${stepId}_${String(index + 1).padStart(3, '0')}`,
          sourceStepId: stepId,
          place: entry.place,
          distanceFromSearchCenterMeters: distanceFromLocation(entry.place, input.request),
          popularityBonus: entry.scoreBreakdown.popularity,
          qualification: {
            category: categoryMatches
              ? (entry.place.category.normalized === 'unknown' ? 'unknown' : 'compatible')
              : 'incompatible',
            intent: !requiredIntent ? 'not_required' : intentMatches ? 'matched' : 'unmatched',
            intentEvidence: intentMatches && requiredIntent
              ? [{ phase: 'provider_metadata', canonicalTerm: requiredIntent.canonicalTerm, expansionLevel: 0 }]
              : [],
          },
        };
      });
      const selectableCandidates = candidates.filter((candidate) => (
        candidate.qualification?.category !== 'incompatible'
        && candidate.qualification?.intent !== 'unmatched'
      ));
      return { stepId, candidates, selectableCandidates, sufficient: selectableCandidates.length >= 2 };
    };

    for (const step of input.request.courseSteps) {
      const primary = input.stepAttempts.primary.filter((attempt) => attempt.stepId === step.id);
      const fallback = input.stepAttempts.fallback.filter((attempt) => attempt.stepId === step.id);
      const discovered: NormalizedPlace[] = [];
      let pool = makePool(step.id, discovered);
      let primaryAttemptsRun = 0;
      let fallbackAttemptsRun = 0;
      for (const attempt of primary) {
        if (pool.sufficient) break;
        discovered.push(...await attempt.run());
        primaryAttemptsRun += 1;
        attemptsRun += 1;
        pool = makePool(step.id, dedupeNormalizedPlaces(discovered).places);
      }
      if (!pool.sufficient) {
        for (const attempt of fallback) {
          if (pool.sufficient) break;
          discovered.push(...await attempt.run());
          fallbackAttemptsRun += 1;
          attemptsRun += 1;
          fallbackUsed = true;
          pool = makePool(step.id, dedupeNormalizedPlaces(discovered).places);
        }
      }
      if (!pool.sufficient) fewerResults = true;
      pools.push(pool);
      stepDiagnostics.push({
        stepId: step.id,
        primaryAttemptsRun,
        fallbackAttemptsRun,
        candidateCount: pool.candidates.length,
        selectableCount: pool.selectableCandidates.length,
        sufficient: pool.sufficient,
      });
    }
    return {
      pools,
      candidates: pools.flatMap((pool) => pool.selectableCandidates),
      discovery: {
        places: pools.flatMap((pool) => pool.selectableCandidates.map((candidate) => candidate.place)),
        attemptsRun,
        fallbackUsed,
        fewerResults,
      },
      diagnostics: { attempts: [], steps: stepDiagnostics },
    };
  }
  const diagnostics: ProviderNeutralDiscoveryDiagnostics = { attempts: [] };
  const discovery = await discoverQualifiedPlaces({
    primaryAttempts: input.primaryAttempts,
    fallbackAttempts: input.fallbackAttempts,
    minQualifiedCandidates: input.minQualifiedCandidates,
    qualify: (place) => assess(place).passed,
    isSufficient: (places) => canAssignEveryStep(places, input.request, requiredIntents),
    onPoolUpdated: (snapshot) => {
      const rejectedByReason = snapshot.deduped.reduce<Record<string, number>>((counts, place) => {
        for (const reason of assess(place).reasons) counts[reason] = (counts[reason] ?? 0) + 1;
        return counts;
      }, {});
      diagnostics.attempts.push({
        phase: snapshot.phase,
        attemptIndex: snapshot.attemptIndex,
        returnedCount: snapshot.attemptPlaces.length,
        returnedByCategory: categoryCounts(snapshot.attemptPlaces),
        discoveredCount: snapshot.discovered.length,
        dedupedCount: snapshot.deduped.length,
        dedupedByCategory: categoryCounts(snapshot.deduped),
        qualifiedCount: snapshot.qualified.length,
        qualifiedByCategory: categoryCounts(snapshot.qualified),
        rejectedByReason,
        sufficient: snapshot.sufficient,
      });
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
    pools: [],
    diagnostics,
    candidates: ranked.map((entry, index) => ({
      candidateId: `provider_candidate_${String(index + 1).padStart(3, '0')}`,
      place: entry.place,
      distanceFromSearchCenterMeters: distanceFromLocation(entry.place, input.request),
      popularityBonus: entry.scoreBreakdown.popularity,
    })),
  };
}
