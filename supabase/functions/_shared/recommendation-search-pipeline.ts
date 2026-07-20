import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import {
  buildKakaoSearchPlan,
  executeKakaoSearchPlan,
  fetchKakaoSearchPage,
  KAKAO_SEARCH_LIMITS,
  mergeKakaoSearchEvidence,
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
  let places = search.places;
  // 수동 지정 장소: 일반 검색 풀에 없으면 pickedName으로 키워드 재검색해 매칭 doc을 병합.
  if (request.replacement?.pickedName
      && !places.some((p) => p.kakaoPlaceId === request.replacement!.kakaoPlaceId)) {
    const extra = await searchPage({
      queryId: 'picked-place',
      source: 'keyword',
      queryText: request.replacement.pickedName,
      page: 1,
    });
    const matched = mergeKakaoSearchEvidence([extra])
      .filter((p) => p.kakaoPlaceId === request.replacement!.kakaoPlaceId);
    if (matched.length > 0) places = [...places, ...matched];
  }
  return {
    ...rankPlaceCandidates(places, request, { limit: KAKAO_SEARCH_LIMITS.maxUniqueCandidates }),
    searchMetadata: search.metadata,
  };
}
