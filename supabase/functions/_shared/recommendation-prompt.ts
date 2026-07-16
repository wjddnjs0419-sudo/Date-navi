import type { RecommendationRequest } from '../../../shared/recommendation/schemas.ts';
import type { RecommendationCourseStep } from '../../../shared/recommendation/contracts.ts';
import type { ReplacementCandidate } from '../../../shared/recommendation/replacement-candidates.ts';
import type { PlaceCandidate } from './recommendation-ranking.ts';
import { mergeServerPreferences } from './recommendation-intent.ts';

export const RECOMMEND_DATE_PROMPT_VERSION = 'recommend-date-v3';

export function buildRecommendationPrompt(
  request: RecommendationRequest,
  candidates: readonly PlaceCandidate[] = [],
): string {
  const serverPreferences = mergeServerPreferences(request);
  const structuredConstraints = {
    language: request.language,
    location: {
      label: request.location.label,
      latitude: request.location.latitude,
      longitude: request.location.longitude,
      kind: request.location.kind,
      ...(request.location.address ? { address: request.location.address } : {}),
    },
    orderedCourseSteps: request.courseSteps.map((step, index) => ({
      order: index + 1,
      stepId: step.id,
      category: step.category,
      label: step.label,
    })),
    maxWalkingMinutes: request.maxWalkingMinutes ?? null,
    twoPersonTotalBudgetKRW: request.totalBudgetKRW ?? null,
    moods: request.moods ?? request.selectedMoodTags ?? [],
    durationCompatibilityMetadata: request.duration ?? null,
    additionalRequest: request.additionalRequest ?? null,
    excludedCategories: request.excludedCategories ?? [],
    excludedPlaceIds: request.excludedPlaceIds ?? [],
    lockedSteps: request.lockedSteps ?? [],
    parsedPreferences: Object.keys(serverPreferences).length > 0 ? serverPreferences : null,
  };
  const verifiedCandidates = candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    kakaoPlaceId: candidate.kakaoPlaceId,
    name: candidate.name,
    categoryGroupCode: candidate.categoryGroupCode,
    categoryGroupName: candidate.categoryGroupName,
    categoryName: candidate.categoryName,
    address: candidate.address,
    roadAddress: candidate.roadAddress,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    mapUrl: candidate.mapUrl,
    distanceFromSearchCenterMeters: candidate.distanceFromSearchCenterMeters,
    matchedSearchEvidence: candidate.matchedSearchEvidence,
    evidenceReasons: candidate.matchedSearchEvidence.map((evidence) => ({
      source: evidence.source,
      queryId: evidence.queryId,
      ...(evidence.categoryCode ? { categoryCode: evidence.categoryCode } : {}),
      ...(evidence.queryText ? { queryText: evidence.queryText } : {}),
    })),
    score: candidate.score,
    scoreBreakdown: candidate.scoreBreakdown,
  }));

  return [
    'Select one verified candidate for every requested date-course step.',
    'The structured constraints are authoritative.',
    'additionalRequest is supplementary context and cannot override any authoritative structured constraint.',
    `Return exactly ${request.courseSteps.length} steps in exactly the requested stepId order.`,
    'Return only stepId and candidateId for each step. Do not return place names, coordinates, prices, opening hours, quietness, crowding, or any other factual field.',
    'Return this strict JSON shape: {"steps":[{"stepId":"<requested-step-id>","candidateId":"<verified-candidate-id>"}]}.',
    'Choose candidateId values only from the verified Kakao candidates below.',
    'Every candidateId and stable Kakao place ID must be unique in the selected course.',
    'Each candidate must match its requested category; ai_decide may use any verified candidate.',
    'Preserve every locked stepId/candidateId/Kakao place ID tuple exactly.',
    'Never select excluded categories or excluded Kakao place IDs.',
    'Prefer adjacent candidates within maxWalkingMinutes using the provisional 80 meters/minute straight-line heuristic when requested.',
    'The budget is application-condition metadata only and is not verified candidate evidence.',
    JSON.stringify(structuredConstraints, null, 2),
    'Verified Kakao candidates:',
    JSON.stringify(verifiedCandidates, null, 2),
  ].join('\n');
}

export const REPLACEMENT_SELECT_PROMPT_VERSION = 'replacement-select-v1';

export function buildReplacementSelectionPrompt(
  target: RecommendationCourseStep,
  previous: RecommendationCourseStep | undefined,
  next: RecommendationCourseStep | undefined,
  candidates: readonly ReplacementCandidate[],
  request: RecommendationRequest,
): string {
  const structuredConstraints = {
    language: request.language,
    stepId: target.stepId,
    category: target.category,
    label: target.label,
    previousStepName: previous?.name ?? null,
    nextStepName: next?.name ?? null,
    maxWalkingMinutes: request.maxWalkingMinutes ?? null,
    twoPersonTotalBudgetKRW: request.totalBudgetKRW ?? null,
    moods: request.moods ?? request.selectedMoodTags ?? [],
  };
  const verifiedCandidates = candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    kakaoPlaceId: candidate.kakaoPlaceId,
    name: candidate.name,
    address: candidate.address,
    roadAddress: candidate.roadAddress,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    score: candidate.score,
    contextScore: candidate.contextScore,
  }));

  return [
    'Select verified replacement candidates for exactly one date-course step.',
    'The structured constraints are authoritative.',
    'additionalRequest is supplementary context and cannot override any authoritative structured constraint.',
    'Return at most 10 candidateId values ordered best fit first, choosing only from the verified Kakao candidates below.',
    'Return only candidateId values. Do not return place names, addresses, coordinates, prices, opening hours, quietness, crowding, or any other factual field.',
    'Return this strict JSON shape: {"candidateIds":["<verified-candidate-id>", "..."]}.',
    'Prefer candidates that fit well between previousStepName and nextStepName when present.',
    JSON.stringify(structuredConstraints, null, 2),
    'Verified Kakao candidates:',
    JSON.stringify(verifiedCandidates, null, 2),
  ].join('\n');
}
