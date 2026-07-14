import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import {
  buildKakaoSearchPlan,
  executeKakaoSearchPlan,
  fetchKakaoSearchPage,
  KAKAO_SEARCH_LIMITS,
  type KakaoFetch,
  type KakaoSearchMetadata,
} from './recommendation-search.ts';
import {
  rankPlaceCandidates,
  type RankedRecommendationSearch,
} from './recommendation-ranking.ts';

export type RecommendationSearchPipelineResult = RankedRecommendationSearch & {
  searchMetadata: KakaoSearchMetadata;
};

export async function searchAndRankRecommendation(
  request: RecommendationRequest,
  dependencies: { kakaoRestApiKey: string; fetcher?: KakaoFetch },
): Promise<RecommendationSearchPipelineResult> {
  const plan = buildKakaoSearchPlan(request);
  const search = await executeKakaoSearchPlan(plan, (query) => fetchKakaoSearchPage(
    query,
    request.location,
    dependencies.kakaoRestApiKey,
    dependencies.fetcher,
  ));
  return {
    ...rankPlaceCandidates(search.places, request, { limit: KAKAO_SEARCH_LIMITS.maxUniqueCandidates }),
    searchMetadata: search.metadata,
  };
}
