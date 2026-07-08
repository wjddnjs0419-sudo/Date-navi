// 추천 파이프라인 중앙 Config (PLAN_GENERATION_ARCHITECTURE_V2.md §19). 코드 곳곳 하드코딩 금지.
export type RecommendationConfig = {
  // retrieval (Phase 2에서 place-search가 소비)
  minCandidateCount: number;
  maxCandidateCount: number;
  initialPageSize: number;
  maxPagesPerQuery: number;
  maxKakaoRequests: number;
  minIntentQueriesExecuted: number;
  // ranking / claude
  rankedCandidateLimit: number;
  haikuCandidateLimit: number;
  finalRecommendationCount: number;
};

export const RECOMMENDATION_CONFIG: RecommendationConfig = {
  minCandidateCount: 30,
  maxCandidateCount: 80,
  initialPageSize: 15,
  maxPagesPerQuery: 2,
  maxKakaoRequests: 8,
  minIntentQueriesExecuted: 2,
  rankedCandidateLimit: 20,
  haikuCandidateLimit: 15,
  finalRecommendationCount: 3,
};
