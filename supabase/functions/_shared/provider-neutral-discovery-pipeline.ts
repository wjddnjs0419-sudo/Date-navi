import type { RecommendationRequest } from '../../../shared/recommendation/schemas.ts';
import { discoverQualifiedPlaces, type DiscoveryResult } from './recommendation-discovery.ts';
import { dedupeNormalizedPlaces } from './place-dedup.ts';
import type { NormalizedPlace } from './place-provider.ts';
import { evaluateHardEligibility, evaluateQualityGate, type DateQualityContext, type PopularityEligibility } from './place-quality.ts';
import type { ProviderNeutralCandidate, StepCandidatePool } from './provider-neutral-course-selection.ts';
import { rankQualifiedPlaces } from './provider-neutral-ranking.ts';
import { effectiveStepIntents } from './step-intent.ts';
import {
  providerNeutralStepIntentEvidenceSource,
  providerNeutralPlaceMatchesStep,
  providerNeutralPlaceMatchesStepCategory,
  providerNeutralStepIntentPreferenceScore,
} from './provider-neutral-intent.ts';
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
    intentKeywords: string[];
    primaryAttemptsRun: number;
    fallbackAttemptsRun: number;
    candidateCount: number;
    selectableCount: number;
    sufficient: boolean;
    attempts: Array<{
      phase: 'primary' | 'fallback';
      attemptIndex: number;
      provider?: 'naver' | 'kakao';
      querySource?: 'intent' | 'category';
      returnedCount: number;
      returnedByCategory: CategoryCounts;
      discoveredCount: number;
      dedupedCount: number;
      dedupedByCategory: CategoryCounts;
      qualifiedCount: number;
      qualifiedByCategory: CategoryCounts;
      rejectedByReason: Record<string, number>;
      categoryMatchedCount: number;
      metadataIntentMatchedCount: number;
      providerSearchIntentMatchedCount: number;
      requiredIntentMatchedCount: number;
      notSelectableByReason: Record<string, number>;
      selectableCount: number;
      sufficient: boolean;
    }>;
  }>;
};

export type StepDiscoveryAttempt = {
  stepId: string;
  provider?: 'naver' | 'kakao';
  querySource?: 'intent' | 'category';
  run: () => Promise<NormalizedPlace[]>;
};

function lockedStepPlace(
  lock: NonNullable<RecommendationRequest['lockedSteps']>[number],
): NormalizedPlace {
  const identity = lock.placeIdentity
    ?? (lock.kakaoPlaceId
      ? { provider: 'kakao' as const, providerPlaceId: lock.kakaoPlaceId }
      : undefined);
  if (!identity) throw new Error('A locked step provider identity is required.');
  return {
    identity,
    name: lock.name,
    category: { normalized: 'unknown', providerRaw: 'locked step fact' },
    address: { display: lock.address, ...(lock.roadAddress ? { road: lock.roadAddress } : {}) },
    coordinates: { latitude: lock.latitude, longitude: lock.longitude },
    ...(lock.mapUrl ? { mapUrl: lock.mapUrl } : {}),
    evidence: { provider: identity.provider, searchTerms: [] },
    ...(identity.provider === 'kakao' ? { legacy: { kakaoPlaceId: identity.providerPlaceId } } : {}),
  };
}

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
        || !providerNeutralPlaceMatchesStep(place, step, requiredIntentByStepId.get(step.id), { allowProviderSearchEvidence: true })) continue;
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
      const preferredIntents = effectiveStepIntents(input.request)
        .filter((intent) => intent.stepId === stepId && intent.strength === 'preferred');
      const isExplicitReplacement = input.request.replacement?.stepId === stepId;
      const qualified = places.filter((place) => assess(place).passed);
      const ranked = rankQualifiedPlaces(qualified.map((place) => ({
        place,
        quality: evaluateQualityGate(place, {
          dateContext: context,
          popularityEligibility: popularityEligibility(place),
        }),
        distanceFromSearchCenterMeters: distanceFromLocation(place, input.request),
        popularityBonus: popularityEligibility(place) === 'sufficient' ? 1 : 0,
        intentEvidence: requiredIntent
          ? providerNeutralStepIntentEvidenceSource(place, requiredIntent, { allowProviderSearchEvidence: true }) === 'provider_metadata'
            ? 8
            : providerNeutralStepIntentEvidenceSource(place, requiredIntent, { allowProviderSearchEvidence: true }) === 'provider_search'
              ? 4
              : undefined
          : undefined,
        intentPreference: providerNeutralStepIntentPreferenceScore(place, preferredIntents),
      })));
      const candidates = ranked.map((entry, index): ProviderNeutralCandidate => {
        const categoryMatches = Boolean(step && providerNeutralPlaceMatchesStepCategory(entry.place, step.category));
        const intentEvidenceSource = step && requiredIntent
          ? providerNeutralStepIntentEvidenceSource(entry.place, requiredIntent, { allowProviderSearchEvidence: true })
          : undefined;
        const intentMatches = Boolean(intentEvidenceSource);
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
            intent: !requiredIntent || isExplicitReplacement ? 'not_required' : intentMatches ? 'matched' : 'unmatched',
            intentEvidence: intentMatches && requiredIntent && intentEvidenceSource
              ? [{ phase: intentEvidenceSource, canonicalTerm: requiredIntent.canonicalTerm, expansionLevel: 0 }]
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
      const stepIntents = effectiveStepIntents(input.request).filter((intent) => intent.stepId === step.id);
      const preserved = input.request.lockedSteps?.find((candidate) => candidate.stepId === step.id);
      if (preserved) {
        const place = lockedStepPlace(preserved);
        const candidate: ProviderNeutralCandidate = {
          candidateId: preserved.candidateId,
          sourceStepId: step.id,
          place,
          distanceFromSearchCenterMeters: distanceFromLocation(place, input.request),
          popularityBonus: 0,
          qualification: { category: 'unknown', intent: 'not_required', intentEvidence: [] },
        };
        pools.push({
          stepId: step.id,
          candidates: [candidate],
          selectableCandidates: [candidate],
          // A preserved lock is already a verified choice; it does not need
          // two replacement alternatives to keep the rest of the course stable.
          sufficient: true,
        });
        stepDiagnostics.push({
          stepId: step.id,
          intentKeywords: stepIntents.map((intent) => intent.canonicalTerm),
          primaryAttemptsRun: 0,
          fallbackAttemptsRun: 0,
          candidateCount: 1,
          selectableCount: 1,
          sufficient: true,
          attempts: [],
        });
        continue;
      }
      const primary = input.stepAttempts.primary.filter((attempt) => attempt.stepId === step.id);
      const fallback = input.stepAttempts.fallback.filter((attempt) => attempt.stepId === step.id);
      const discovered: NormalizedPlace[] = [];
      const requiredIntentForStep = requiredIntents.find((intent) => intent.stepId === step.id);
      const stepAttemptDiagnostics: NonNullable<ProviderNeutralDiscoveryDiagnostics['steps']>[number]['attempts'] = [];
      let pool = makePool(step.id, discovered);
      let primaryAttemptsRun = 0;
      let fallbackAttemptsRun = 0;
      const recordAttempt = (
        phase: 'primary' | 'fallback',
        attempt: StepDiscoveryAttempt,
        attemptIndex: number,
        returned: readonly NormalizedPlace[],
        deduped: readonly NormalizedPlace[],
        currentPool: StepCandidatePool,
      ) => {
        const qualified = deduped.filter((place) => assess(place).passed);
        const categoryMatched = qualified.filter((place) => Boolean(
          step && providerNeutralPlaceMatchesStepCategory(place, step.category),
        ));
        const intentMatched = qualified.filter((place) => Boolean(
          requiredIntentForStep && providerNeutralPlaceMatchesStep(place, step, requiredIntentForStep, { allowProviderSearchEvidence: true }),
        ));
        const metadataIntentMatchedCount = qualified.filter((place) => Boolean(
          requiredIntentForStep
          && providerNeutralStepIntentEvidenceSource(place, requiredIntentForStep) === 'provider_metadata',
        )).length;
        const providerSearchIntentMatchedCount = qualified.filter((place) => Boolean(
          requiredIntentForStep
          && providerNeutralStepIntentEvidenceSource(place, requiredIntentForStep, { allowProviderSearchEvidence: true }) === 'provider_search',
        )).length;
        const notSelectableByReason = currentPool.candidates.reduce<Record<string, number>>((counts, candidate) => {
          if (candidate.qualification?.category === 'incompatible') {
            counts.category_incompatible = (counts.category_incompatible ?? 0) + 1;
          }
          if (candidate.qualification?.intent === 'unmatched') {
            counts.intent_unmatched = (counts.intent_unmatched ?? 0) + 1;
          }
          return counts;
        }, {});
        const rejectedByReason = deduped.reduce<Record<string, number>>((counts, place) => {
          if (!qualified.includes(place)) {
            for (const reason of assess(place).reasons) counts[reason] = (counts[reason] ?? 0) + 1;
          }
          return counts;
        }, {});
        stepAttemptDiagnostics.push({
          phase,
          attemptIndex,
          ...(attempt.provider ? { provider: attempt.provider } : {}),
          ...(attempt.querySource ? { querySource: attempt.querySource } : {}),
          returnedCount: returned.length,
          returnedByCategory: categoryCounts(returned),
          discoveredCount: discovered.length,
          dedupedCount: deduped.length,
          dedupedByCategory: categoryCounts(deduped),
          qualifiedCount: qualified.length,
          qualifiedByCategory: categoryCounts(qualified),
          rejectedByReason,
          categoryMatchedCount: categoryMatched.length,
          metadataIntentMatchedCount,
          providerSearchIntentMatchedCount,
          requiredIntentMatchedCount: requiredIntentForStep ? intentMatched.length : qualified.length,
          notSelectableByReason,
          selectableCount: currentPool.selectableCandidates.length,
          sufficient: currentPool.sufficient,
        });
      };
      for (const [attemptIndex, attempt] of primary.entries()) {
        if (pool.sufficient) break;
        const returned = await attempt.run();
        discovered.push(...returned);
        primaryAttemptsRun += 1;
        attemptsRun += 1;
        const deduped = dedupeNormalizedPlaces(discovered).places;
        pool = makePool(step.id, deduped);
        recordAttempt('primary', attempt, attemptIndex, returned, deduped, pool);
      }
      if (!pool.sufficient) {
        for (const [attemptIndex, attempt] of fallback.entries()) {
          if (pool.sufficient) break;
          const returned = await attempt.run();
          discovered.push(...returned);
          fallbackAttemptsRun += 1;
          attemptsRun += 1;
          fallbackUsed = true;
          const deduped = dedupeNormalizedPlaces(discovered).places;
          pool = makePool(step.id, deduped);
          recordAttempt('fallback', attempt, attemptIndex, returned, deduped, pool);
        }
      }
      if (!pool.sufficient) fewerResults = true;
      pools.push(pool);
      stepDiagnostics.push({
        stepId: step.id,
        intentKeywords: stepIntents.map((intent) => intent.canonicalTerm),
        primaryAttemptsRun,
        fallbackAttemptsRun,
        candidateCount: pool.candidates.length,
        selectableCount: pool.selectableCandidates.length,
        sufficient: pool.sufficient,
        attempts: stepAttemptDiagnostics,
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
