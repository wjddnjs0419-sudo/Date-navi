import type { RecommendationRequest } from '../../../shared/recommendation/schemas.ts';
import type { PlaceCandidate } from './recommendation-ranking.ts';
import { mergeServerPreferences } from './recommendation-intent.ts';
import { effectiveStepIntents, placeMatchesStepIntent } from './step-intent.ts';
import { STEP_INTENT_DICTIONARY } from './step-intent-dictionary.ts';

export const RECOMMEND_DATE_PROMPT_VERSION = 'recommend-date-v5-pinned-steps';
export const PARSE_STEP_INTENTS_PROMPT_VERSION = 'parse-step-intents-v1';

export function buildRecommendationPrompt(
  request: RecommendationRequest,
  candidates: readonly PlaceCandidate[] = [],
): string {
  const serverPreferences = mergeServerPreferences(request);
  const stepIntents = effectiveStepIntents(request);
  const resolvedStepIntents = stepIntents.map((intent) => ({
    stepId: intent.stepId,
    canonicalTerm: intent.canonicalTerm,
    strength: intent.strength,
    matchingCandidateIds: candidates
      .filter((candidate) => placeMatchesStepIntent(candidate, intent))
      .map((candidate) => candidate.candidateId),
  }));
  const structuredConstraints = {
    language: request.language,
    location: {
      label: request.location.label,
      latitude: request.location.latitude,
      longitude: request.location.longitude,
      kind: request.location.kind,
      ...(request.location.address ? { address: request.location.address } : {}),
    },
    orderedCourseSteps: request.courseSteps.map((step, index) => {
      const pinnedCandidateId = step.pinnedKakaoPlaceId
        ? candidates.find((candidate) => candidate.kakaoPlaceId === step.pinnedKakaoPlaceId)?.candidateId
        : undefined;
      return {
        order: index + 1,
        stepId: step.id,
        category: step.category,
        label: step.label,
        // 입력 시점 지정 장소: AI는 이 스텝을 고르지 않고 pinnedCandidateId를 그대로 유지한다.
        ...(pinnedCandidateId ? { pinned: true, pinnedCandidateId } : {}),
      };
    }),
    maxWalkingMinutes: request.maxWalkingMinutes ?? null,
    twoPersonTotalBudgetKRW: request.totalBudgetKRW ?? null,
    moods: request.moods ?? request.selectedMoodTags ?? [],
    durationCompatibilityMetadata: request.duration ?? null,
    additionalRequest: request.additionalRequest ?? null,
    excludedCategories: request.excludedCategories ?? [],
    excludedPlaceIds: request.excludedPlaceIds ?? [],
    lockedSteps: request.lockedSteps ?? [],
    parsedPreferences: Object.keys(serverPreferences).length > 0 ? serverPreferences : null,
    ...(resolvedStepIntents.length > 0 ? { resolvedStepIntents } : {}),
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
    'resolvedStepIntents is authoritative: for a required intent select only from its matchingCandidateIds; for a preferred intent strongly prefer them.',
    'Never claim a place satisfies an attribute without verified evidence.',
    `Return exactly ${request.courseSteps.length} steps in exactly the requested stepId order.`,
    'Return only stepId and candidateId for each step. Do not return place names, coordinates, prices, opening hours, quietness, crowding, or any other factual field.',
    'Return this strict JSON shape: {"steps":[{"stepId":"<requested-step-id>","candidateId":"<verified-candidate-id>"}]}.',
    'Choose candidateId values only from the verified Kakao candidates below.',
    'Every candidateId and stable Kakao place ID must be unique in the selected course.',
    'Each candidate must match its requested category; ai_decide may use any verified candidate.',
    'Preserve every locked stepId/candidateId/Kakao place ID tuple exactly.',
    'pinned steps are fixed: return their pinnedCandidateId unchanged and never reuse that candidate for another step.',
    'Never select excluded categories or excluded Kakao place IDs.',
    'Prefer adjacent candidates within maxWalkingMinutes using the provisional 80 meters/minute straight-line heuristic when requested.',
    'The budget is application-condition metadata only and is not verified candidate evidence.',
    JSON.stringify(structuredConstraints, null, 2),
    'Verified Kakao candidates:',
    JSON.stringify(verifiedCandidates, null, 2),
  ].join('\n');
}

/**
 * parse_step_intents(AI fallback) 프롬프트. 규칙 파서가 못 잡은 자유텍스트를 course step별
 * canonical 검색 의도로 변환한다. 등재 canonical 우선, 미매핑은 unsupported로.
 */
export function buildParseStepIntentsPrompt(request: RecommendationRequest): string {
  const registeredCanonicals = STEP_INTENT_DICTIONARY.map((entry) => ({
    canonicalTerm: entry.canonicalTerm,
    targetCategory: entry.targetCategory,
    intentType: entry.intentType,
    expansions: entry.expansions,
  }));
  const orderedCourseSteps = request.courseSteps.map((step, index) => ({
    order: index + 1,
    stepId: step.id,
    category: step.category,
    label: step.label,
  }));

  return [
    'Extract structured step intents from a Korean/English free-text date request.',
    'Map each concrete desire (a specific dish, cuisine, venue subtype, activity, culture subtype, or drink type) to a targetCategory that matches one of the course steps.',
    'Prefer a registered canonicalTerm when the desire matches one; otherwise use a concise Korean canonical noun suitable for a Kakao keyword search.',
    'targetCategory must be one of: meal, cafe, culture, walk, drinks, activity.',
    'strength is "required" only for unconditional demands (무조건/반드시/꼭/only/must); otherwise "preferred".',
    'negated is true when the user excludes it (말고/빼고/제외/not/except).',
    'kakaoSearchTerms: 1-3 short Korean keywords, canonical first, then optional broader terms.',
    'If a desire has no matching course-step category, put it in unsupported with a short reason instead of stepIntents.',
    'Report contradictory demands (e.g. two required dishes for one meal step) in conflicts.',
    'Return only the strict JSON schema shape. Do not invent places or facts.',
    'Registered canonical terms (prefer these):',
    JSON.stringify(registeredCanonicals, null, 2),
    'Ordered course steps:',
    JSON.stringify(orderedCourseSteps, null, 2),
    `Free-text request: ${JSON.stringify(request.additionalRequest ?? '')}`,
  ].join('\n');
}
