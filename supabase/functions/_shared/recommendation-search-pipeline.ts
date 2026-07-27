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
import type { RecommendationHistoryContext } from '../../../shared/recommendation/recommendation-history.ts';
import type { PlacePriceFields } from '../../../shared/recommendation/place-price.ts';

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
    history?: RecommendationHistoryContext;
    /** 장소 원장 가격 조회. 예산이 있을 때만 호출한다 — 쓰지 않을 값을 위해 DB를 때리지 않는다. */
    priceLookup?: (kakaoPlaceIds: string[]) => Promise<ReadonlyMap<string, PlacePriceFields>>;
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
  // 수동 지정 장소(교체 replacement + 입력 시점 per-step 핀): 일반 검색 풀에 없으면
  // 지정 이름으로 키워드 재검색해 매칭 doc을 병합. client 좌표 불신, kakaoPlaceId로만 매칭.
  const picks: { kakaoPlaceId: string; name: string }[] = [];
  if (request.replacement?.pickedName) {
    picks.push({ kakaoPlaceId: request.replacement.kakaoPlaceId, name: request.replacement.pickedName });
  }
  for (const step of request.courseSteps) {
    if (step.pinnedKakaoPlaceId && step.pinnedName) {
      picks.push({ kakaoPlaceId: step.pinnedKakaoPlaceId, name: step.pinnedName });
    }
  }
  for (const pick of picks) {
    if (places.some((p) => p.kakaoPlaceId === pick.kakaoPlaceId)) continue;
    const extra = await searchPage({
      queryId: 'picked-place',
      source: 'keyword',
      queryText: pick.name,
      page: 1,
    });
    const matched = mergeKakaoSearchEvidence([extra])
      .filter((p) => p.kakaoPlaceId === pick.kakaoPlaceId);
    if (matched.length > 0) places = [...places, ...matched];
  }
  let prices: ReadonlyMap<string, PlacePriceFields> | undefined;
  if (dependencies.priceLookup && request.totalBudgetKRW) {
    try {
      prices = await dependencies.priceLookup(places.map((place) => place.kakaoPlaceId));
    } catch {
      prices = undefined; // 가격 조회 실패는 추천을 막지 않는다
    }
  }
  return {
    ...rankPlaceCandidates(places, request, {
      limit: KAKAO_SEARCH_LIMITS.maxUniqueCandidates,
      history: dependencies.history,
      prices,
    }),
    searchMetadata: search.metadata,
  };
}
