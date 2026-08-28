import { z } from 'zod';

import type { RecommendationRequest } from '../../../shared/recommendation/schemas.ts';
import { recommendationCourseSchema, recommendDateCardSchema } from '../../../shared/recommendation/schemas.ts';
import type { NormalizedPlace } from './place-provider.ts';
import { isSamePhysicalPlace } from './place-dedup.ts';
import { providerNeutralPlaceMatchesStep, providerNeutralPlaceMatchesStepCategory } from './provider-neutral-intent.ts';
import { effectiveStepIntents } from './step-intent.ts';

const selectionSchema = z.object({
  steps: z.array(z.object({ stepId: z.string().trim().min(1), candidateId: z.string().trim().min(1) }).strict()).min(2).max(4),
}).strict();

export type ProviderNeutralCandidate = {
  candidateId: string;
  /** Required for newly discovered candidates; omitted only by legacy fixtures/snapshots. */
  sourceStepId?: string;
  place: NormalizedPlace;
  distanceFromSearchCenterMeters: number;
  popularityBonus: number;
  qualification?: {
    category: 'compatible' | 'unknown' | 'incompatible';
    intent: 'not_required' | 'matched' | 'unmatched';
    intentEvidence: readonly { phase?: string; canonicalTerm?: string; expansionLevel?: 0 | 1 | 2 }[];
  };
};

export type StepCandidatePool = {
  stepId: string;
  candidates: readonly ProviderNeutralCandidate[];
  selectableCandidates: readonly ProviderNeutralCandidate[];
  sufficient: boolean;
};

export class ProviderNeutralCourseSelectionError extends Error {
  constructor() { super('COURSE_VALIDATION_FAILED'); }
}

function matchesCategory(candidate: ProviderNeutralCandidate, requested: string): boolean {
  return providerNeutralPlaceMatchesStepCategory(candidate.place, requested);
}

function distanceMeters(a: NormalizedPlace, b: NormalizedPlace): number {
  if (!a.coordinates || !b.coordinates) return 0;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(b.coordinates.latitude - a.coordinates.latitude);
  const longitudeDelta = radians(b.coordinates.longitude - a.coordinates.longitude);
  const h = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a.coordinates.latitude)) * Math.cos(radians(b.coordinates.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function buildProviderNeutralCourse(input: {
  request: RecommendationRequest;
  candidates?: readonly ProviderNeutralCandidate[];
  pools?: readonly StepCandidatePool[];
  selection: unknown;
  generatedAt: string;
}) {
  const parsed = selectionSchema.safeParse(input.selection);
  if (!parsed.success || parsed.data.steps.length !== input.request.courseSteps.length) {
    throw new ProviderNeutralCourseSelectionError();
  }
  const candidates = input.pools
    ? input.pools.flatMap((pool) => pool.selectableCandidates)
    : (input.candidates ?? []);
  const ids = new Set(candidates.map((candidate) => candidate.candidateId));
  const identities = new Set(candidates.map((candidate) => (
    `${candidate.place.identity.provider}:${candidate.place.identity.providerPlaceId}`
  )));
  if (ids.size !== candidates.length || identities.size !== candidates.length) {
    throw new ProviderNeutralCourseSelectionError();
  }
  const excluded = new Set(input.request.excludedPlaceIds ?? []);
  const requiredIntents = new Map(
    effectiveStepIntents(input.request)
      .filter((intent) => intent.strength === 'required')
      .map((intent) => [intent.stepId, intent]),
  );
  const selected = parsed.data.steps.map((selection, index) => {
    const requested = input.request.courseSteps[index];
    if (!requested || selection.stepId !== requested.id) throw new ProviderNeutralCourseSelectionError();
    const owningPool = input.pools?.find((pool) => pool.stepId === requested.id);
    const candidate = candidates.find((entry) => entry.candidateId === selection.candidateId);
    if (!candidate || !matchesCategory(candidate, requested.category)
      || !providerNeutralPlaceMatchesStep(candidate.place, requested, requiredIntents.get(requested.id))
      || (owningPool && candidate.sourceStepId !== requested.id)
      || (candidate.qualification?.intent === 'unmatched')
      || excluded.has(candidate.place.identity.providerPlaceId)) {
      throw new ProviderNeutralCourseSelectionError();
    }
    return candidate;
  });
  if (new Set(selected.map((candidate) => `${candidate.place.identity.provider}:${candidate.place.identity.providerPlaceId}`)).size !== selected.length) {
    throw new ProviderNeutralCourseSelectionError();
  }
  for (let index = 1; index < selected.length; index++) {
    if (selected.slice(0, index).some((candidate) => isSamePhysicalPlace(candidate.place, selected[index].place))) {
      throw new ProviderNeutralCourseSelectionError();
    }
  }

  const adjacentDistanceMeters = selected.slice(1).map((candidate, index) => distanceMeters(selected[index].place, candidate.place));
  const totalDistanceMeters = adjacentDistanceMeters.reduce((total, distance) => total + distance, 0);
  const walkingLimitAssessment = input.request.maxWalkingMinutes === undefined
    ? 'not_requested' as const
    : adjacentDistanceMeters.some((distance) => distance > input.request.maxWalkingMinutes! * 80)
      ? 'provisional_exceeded' as const
      : 'provisional_within' as const;
  const course = recommendationCourseSchema.parse({
    requestId: input.request.requestId,
    sessionId: input.request.sessionId ?? input.request.requestId,
    steps: selected.map((candidate, index) => ({
      stepId: input.request.courseSteps[index].id,
      order: index + 1,
      category: input.request.courseSteps[index].category,
      label: input.request.courseSteps[index].label,
      candidateId: candidate.candidateId,
      ...(candidate.place.legacy?.kakaoPlaceId ? { kakaoPlaceId: candidate.place.legacy.kakaoPlaceId } : {}),
      placeIdentity: candidate.place.identity,
      name: candidate.place.name,
      address: candidate.place.address?.display ?? '',
      roadAddress: candidate.place.address?.road ?? '',
      mapUrl: candidate.place.mapUrl ?? '',
      latitude: candidate.place.coordinates?.latitude ?? input.request.location.latitude,
      longitude: candidate.place.coordinates?.longitude ?? input.request.location.longitude,
      reason: input.request.language === 'ko' ? '품질 기준을 통과한 검색 후보예요.' : 'A search candidate that passed the quality gate.',
      locked: false,
    })),
    relaxedConstraints: walkingLimitAssessment === 'provisional_exceeded'
      ? [{
        constraint: 'maxWalkingMinutes',
        reason: input.request.language === 'ko'
          ? `${input.request.maxWalkingMinutes}분 기준 직선거리 휴리스틱을 넘는 구간이 있어 이 조건을 완화했어요.`
          : `One segment exceeds the ${input.request.maxWalkingMinutes}-minute straight-line heuristic, so this constraint was relaxed.`,
      }]
      : [],
    generatedAt: input.generatedAt,
  });
  const texts = input.request.language === 'ko'
    ? { title: `${input.request.location.label} 데이트 코스`, summary: '품질 기준을 통과한 장소로 구성했어요.', why_recommended: '모든 장소는 검색과 품질 기준을 통과했어요.' }
    : { title: `${input.request.location.label} date course`, summary: 'Built from quality-qualified places.', why_recommended: 'Every place passed search and quality checks.' };
  const cards = [recommendDateCardSchema.parse({
    requestId: input.request.requestId,
    sessionId: input.request.sessionId ?? input.request.requestId,
    ...texts,
    tags: input.request.courseSteps.map((step) => step.label),
    steps: course.steps.map((step) => ({
      label: step.label, candidateId: step.candidateId,
      ...(step.kakaoPlaceId ? { kakaoPlaceId: step.kakaoPlaceId } : {}),
      ...(step.placeIdentity ? { placeIdentity: step.placeIdentity } : {}),
      place_name: step.name,
      ...(step.roadAddress || step.address ? { place_address: step.roadAddress || step.address } : {}),
      ...(step.mapUrl ? { map_url: step.mapUrl } : {}),
    })),
  })];
  return {
    course,
    cards,
    route: {
      distanceMethod: 'haversine_straight_line' as const,
      adjacentDistanceMeters,
      totalDistanceMeters,
      walkingHeuristicMetersPerMinute: 80 as const,
      walkingLimitAssessment,
      hardConstraintValidated: false as const,
    },
  };
}
