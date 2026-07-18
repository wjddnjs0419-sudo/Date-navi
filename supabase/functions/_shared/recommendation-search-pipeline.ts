import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import {
  buildKakaoSearchPlan,
  executeKakaoSearchPlan,
  fetchKakaoSearchPage,
  KAKAO_SEARCH_LIMITS,
  type KakaoFetch,
  type KakaoSearchMetadata,
  type KakaoSearchQuery,
} from './recommendation-search.ts';
import {
  createCachedKakaoSearchPage,
  type KakaoCacheMetrics,
  type KakaoSearchCacheStore,
} from './kakao-search-cache.ts';
import {
  rankPlaceCandidates,
  type RankedRecommendationSearch,
} from './recommendation-ranking.ts';

export type RecommendationSearchPipelineResult = RankedRecommendationSearch & {
  searchMetadata: KakaoSearchMetadata;
};

export async function searchAndRankRecommendation(
  request: RecommendationRequest,
  dependencies: {
    kakaoRestApiKey: string;
    fetcher?: KakaoFetch;
    cacheStore?: KakaoSearchCacheStore;
    cacheMetrics?: KakaoCacheMetrics;
  },
): Promise<RecommendationSearchPipelineResult> {
  const plan = buildKakaoSearchPlan(request);
  const searchPage = dependencies.cacheStore
    ? createCachedKakaoSearchPage({
      plan,
      center: request.location,
      store: dependencies.cacheStore,
      kakaoRestApiKey: dependencies.kakaoRestApiKey,
      fetcher: dependencies.fetcher,
      metrics: dependencies.cacheMetrics,
    })
    : (query: KakaoSearchQuery) => fetchKakaoSearchPage(
      query,
      request.location,
      dependencies.kakaoRestApiKey,
      dependencies.fetcher,
    );
  const search = await executeKakaoSearchPlan(plan, searchPage);
  return {
    ...rankPlaceCandidates(search.places, request, { limit: KAKAO_SEARCH_LIMITS.maxUniqueCandidates }),
    searchMetadata: search.metadata,
  };
}
