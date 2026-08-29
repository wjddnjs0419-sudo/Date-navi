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

const NAVER_CATEGORY_SEARCH_TERMS: Record<string, string> = {
  meal: '음식점',
  restaurant: '음식점',
  cafe: '카페',
  drinks: '술집',
  bar: '술집',
  culture: '문화시설',
  walk: '산책',
  attraction: '산책',
  activity: '체험',
  ai_decide: '데이트 장소',
};

/** No user free-text enters telemetry; queries use fixed Korean category terms. */
export function naverShadowQueries(input: {
  locationLabel: string;
  locationSource?: 'current' | 'kakao';
  stepCategories: readonly string[];
  stepIds?: readonly string[];
  stepIntents?: readonly {
    stepId: string;
    canonicalTerm: string;
    kakaoSearchTerms?: readonly string[];
  }[];
}): string[] {
  return naverStepQueries(input).map((query) => query.query);
}

export type NaverStepQuery = {
  stepId: string;
  query: string;
  querySource: 'intent' | 'category';
};

function naverIntentKeyword(
  category: string,
  intent: { canonicalTerm: string; kakaoSearchTerms?: readonly string[] } | undefined,
): string {
  const terms = (intent?.kakaoSearchTerms ?? [intent?.canonicalTerm ?? ''])
    .map((term) => term.trim())
    .filter(Boolean);
  if (category === 'cafe') {
    // Cafe attributes such as "조용한 카페" are meaningful search phrases.
    // Preserve the category word for Naver instead of reducing the query to
    // the canonical adjective ("조용한").
    return terms.find((term) => /카페|cafe/i.test(term)) ?? terms[0] ?? '';
  }
  return terms[0] ?? '';
}

export function naverStepQueries(input: {
  locationLabel: string;
  locationSource?: 'current' | 'kakao';
  stepCategories: readonly string[];
  stepIds?: readonly string[];
  stepIntents?: readonly {
    stepId: string;
    canonicalTerm: string;
    kakaoSearchTerms?: readonly string[];
  }[];
}): NaverStepQuery[] {
  if (input.locationSource === 'current') return [];
  const location = input.locationLabel.trim();
  if (!location) return [];
  return input.stepCategories
    .slice(0, 4)
    .map((category, index) => {
      const stepId = input.stepIds?.[index] ?? `step-${index + 1}`;
      const intent = stepId === undefined
        ? undefined
        : input.stepIntents?.find((candidate) => candidate.stepId === stepId);
      const keyword = naverIntentKeyword(category, intent);
      const searchTerm = NAVER_CATEGORY_SEARCH_TERMS[category] ?? NAVER_CATEGORY_SEARCH_TERMS.ai_decide;
      return {
        stepId,
        query: keyword ? `${location} ${keyword}` : `${location} ${searchTerm}`,
        querySource: keyword ? 'intent' : 'category',
      };
    });
}
