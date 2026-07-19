import type { RecommendationRequest } from '../shared/recommendation/schemas';
import type { EvidencedKakaoPlace } from '../supabase/functions/_shared/recommendation-search';
import {
  RANKING_SCORE_WEIGHTS,
  calculateStraightLineRouteMetadata,
  haversineDistanceMeters,
  rankPlaceCandidates,
} from '../supabase/functions/_shared/recommendation-ranking';

const request = (steps = ['meal', 'cafe']): RecommendationRequest => ({
  requestId: 'request-ranking',
  mode: 'course',
  language: 'ko',
  location: {
    source: 'kakao',
    label: '서울숲',
    latitude: 37,
    longitude: 127,
    kind: 'landmark',
  },
  courseSteps: steps.map((category, index) => ({ id: `step-${index}`, category, label: category })),
  maxWalkingMinutes: 10,
});

const CATEGORY_FACTS: Record<string, { group: string; name: string }> = {
  FD6: { group: '음식점', name: '음식점 > 한식' },
  CE7: { group: '카페', name: '음식점 > 카페' },
  CT1: { group: '문화시설', name: '문화시설 > 전시' },
  AT4: { group: '관광명소', name: '관광명소 > 전망대' },
};

const place = (id: string, categoryCode: string, longitude = 127.001): EvidencedKakaoPlace => ({
  kakaoPlaceId: id,
  name: `Place ${id}`,
  categoryGroupCode: categoryCode,
  categoryGroupName: CATEGORY_FACTS[categoryCode]?.group ?? '',
  categoryName: CATEGORY_FACTS[categoryCode]?.name ?? '',
  address: '서울 성동구',
  roadAddress: '서울 성동구 왕십리로',
  latitude: 37,
  longitude,
  mapUrl: `https://place.map.kakao.com/${id}`,
  matchedSearchEvidence: [{
    queryId: `required-${categoryCode}`,
    source: 'category',
    page: 1,
    categoryCode,
  }],
});

describe('recommend-date deterministic ranking', () => {
  it('publishes fixed scoring weights without unsupported budget or behavior guesses', () => {
    expect(RANKING_SCORE_WEIGHTS).toEqual({
      requiredCategory: 40,
      explicitKeywordEvidence: 20,
      distanceMax: 20,
      routeFitMax: 10,
      diversityRecall: 5,
      exclusionPenalty: -100,
      stepIntentExact: 35,
      stepIntentNameMatch: 20,
      stepIntentExpansion1: 12,
      stepIntentExpansion2: 6,
    });
  });

  it('ranks required category and explicit-query evidence ahead of broad fallback', () => {
    const required = place('required', 'FD6', 127.01);
    const explicit = {
      ...place('explicit', 'AT4', 127.005),
      matchedSearchEvidence: [{ queryId: 'explicit', source: 'keyword' as const, queryText: '루프탑', page: 1 }],
    };
    const fallback = {
      ...place('fallback', 'AT4', 127.001),
      matchedSearchEvidence: [{ queryId: 'fallback', source: 'fallback' as const, queryText: '주변 데이트 장소', page: 1 }],
    };

    const ranked = rankPlaceCandidates([fallback, explicit, required], request());

    expect(ranked.candidates.find((candidate) => candidate.kakaoPlaceId === 'required')!.scoreBreakdown.intent)
      .toBe(RANKING_SCORE_WEIGHTS.requiredCategory);
    expect(ranked.candidates.find((candidate) => candidate.kakaoPlaceId === 'explicit')!.scoreBreakdown.intent)
      .toBe(RANKING_SCORE_WEIGHTS.explicitKeywordEvidence);
    expect(ranked.candidates.find((candidate) => candidate.kakaoPlaceId === 'fallback')!.scoreBreakdown.intent)
      .toBe(0);
  });

  it('uses stable Kakao ID tie-breaking and assigns candidate IDs only after final ordering', () => {
    const first = rankPlaceCandidates([place('b', 'CE7'), place('a', 'CE7')], request(['cafe']));
    const reversed = rankPlaceCandidates([place('a', 'CE7'), place('b', 'CE7')], request(['cafe']));

    expect(first.candidates.map((candidate) => [candidate.candidateId, candidate.kakaoPlaceId]))
      .toEqual([['candidate_001', 'a'], ['candidate_002', 'b']]);
    expect(reversed.candidates).toEqual(first.candidates);
  });

  it('preserves recall for every required category before filling the candidate limit', () => {
    const cafes = Array.from({ length: 5 }, (_, index) => place(`cafe-${index}`, 'CE7', 127.001 + index / 10000));
    const meal = place('meal-only', 'FD6', 127.05);

    const ranked = rankPlaceCandidates([...cafes, meal], request(), { limit: 3 });

    expect(ranked.candidates).toHaveLength(3);
    expect(ranked.candidates.some((candidate) => candidate.kakaoPlaceId === 'meal-only')).toBe(true);
    expect(ranked.recallByCategory).toMatchObject({ meal: 1, cafe: 2 });
  });

  it('removes hard-excluded categories and place IDs before recall without inventing unsupported scores', () => {
    const input = {
      ...request(),
      excludedCategories: ['cafe'],
      excludedPlaceIds: ['meal'],
      totalBudgetKRW: 50000,
      quietPreferred: true,
    };

    const survivor = place('survivor', 'CT1');
    const ranked = rankPlaceCandidates([place('meal', 'FD6'), place('cafe', 'CE7'), survivor], input);

    expect(ranked.candidates.map((candidate) => candidate.kakaoPlaceId)).toEqual(['survivor']);
    for (const candidate of ranked.candidates) {
      expect(candidate.scoreBreakdown.penalty).toBe(0);
      expect(candidate.scoreBreakdown.budget).toBe(0);
      expect(candidate.scoreBreakdown.preference).toBe(0);
      expect(candidate.scoreBreakdown.behavior).toBe(0);
    }
  });

  it('drops unfit places (hospital group, kids cafe name) before recall', () => {
    const survivor = place('survivor', 'FD6');
    const hospital = place('hospital', 'HP8', 127.001);
    const kidsCafe = {
      ...place('kids', 'CE7'),
      categoryName: '음식점 > 카페 > 키즈카페',
    };

    const ranked = rankPlaceCandidates([hospital, kidsCafe, survivor], request(['meal']));

    expect(ranked.candidates.map((candidate) => candidate.kakaoPlaceId)).toEqual(['survivor']);
  });

  it('uses query evidence for intent only, never verified category exclusion or recall', () => {
    const restaurantFromDrinksQuery = {
      ...place('restaurant', 'FD6'),
      matchedSearchEvidence: [{
        queryId: 'drinks-query', source: 'keyword' as const, queryText: '술집', page: 1,
      }],
    };
    const genericFromActivityQuery = {
      ...place('generic', 'AT4'),
      name: '데이트 플레이스',
      categoryGroupName: '관광명소',
      categoryName: '관광명소 > 기타',
      matchedSearchEvidence: [{
        queryId: 'activity-query', source: 'keyword' as const, queryText: '액티비티', page: 1,
      }],
    };

    const mealRanked = rankPlaceCandidates([restaurantFromDrinksQuery], {
      ...request(['meal']),
      excludedCategories: ['drinks'],
    });
    const activityRanked = rankPlaceCandidates([genericFromActivityQuery], request(['activity']));

    expect(mealRanked.candidates.map((candidate) => candidate.kakaoPlaceId)).toEqual(['restaurant']);
    expect(mealRanked.recallByCategory).toEqual({ meal: 1 });
    expect(activityRanked.recallByCategory).toEqual({ activity: 0 });
    expect(activityRanked.candidates[0].scoreBreakdown.intent)
      .toBe(RANKING_SCORE_WEIGHTS.explicitKeywordEvidence);
  });

  it('scores route fit from straight-line proximity to another required category', () => {
    const meal = place('meal', 'FD6', 127.01);
    const nearCafe = place('near-cafe', 'CE7', 127.009);
    const farCafe = place('far-cafe', 'CE7', 126.991);

    const ranked = rankPlaceCandidates([farCafe, meal, nearCafe], request());

    const nearRouteFit = ranked.candidates.find((candidate) => candidate.kakaoPlaceId === 'near-cafe')!
      .scoreBreakdown.routeFit;
    const farRouteFit = ranked.candidates.find((candidate) => candidate.kakaoPlaceId === 'far-cafe')!
      .scoreBreakdown.routeFit;
    expect(nearRouteFit).toBeGreaterThan(farRouteFit);
  });
});

describe('rankPlaceCandidates — step intent boost', () => {
  const intentRequest: RecommendationRequest = {
    requestId: 'request-rank-intent', mode: 'course', language: 'ko',
    location: { source: 'kakao', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
    courseSteps: [
      { id: 'step-0', category: 'meal', label: 'meal' },
      { id: 'step-1', category: 'cafe', label: 'cafe' },
    ],
    additionalRequest: '삼겹살 먹고 싶어',
  };
  const mealPlace = (kakaoPlaceId: string, overrides: Partial<EvidencedKakaoPlace> = {}): EvidencedKakaoPlace => ({
    kakaoPlaceId, name: `식당 ${kakaoPlaceId}`,
    categoryGroupCode: 'FD6', categoryGroupName: '음식점', categoryName: '음식점 > 한식',
    address: '', roadAddress: '', latitude: 37.5444, longitude: 127.0374, mapUrl: '',
    matchedSearchEvidence: [], ...overrides,
  });

  it('exact intent evidence 후보가 동일 카테고리 무관 후보보다 상위 랭크된다', () => {
    const withEvidence = mealPlace('aaa', {
      matchedSearchEvidence: [{
        queryId: 'query_002', source: 'keyword', page: 1, queryText: '삼겹살',
        phase: 'step_intent', stepId: 'step-0', canonicalTerm: '삼겹살', strength: 'preferred', expansionLevel: 0,
      }],
    });
    const unrelated = mealPlace('aab');
    const { candidates } = rankPlaceCandidates([unrelated, withEvidence], intentRequest);
    expect(candidates.findIndex((candidate) => candidate.kakaoPlaceId === 'aaa'))
      .toBeLessThan(candidates.findIndex((candidate) => candidate.kakaoPlaceId === 'aab'));
    const boosted = candidates.find((candidate) => candidate.kakaoPlaceId === 'aaa')!;
    const plain = candidates.find((candidate) => candidate.kakaoPlaceId === 'aab')!;
    expect(boosted.scoreBreakdown.intent - plain.scoreBreakdown.intent).toBe(35);
  });

  it('이름에 canonical이 포함되면 +20 가산한다', () => {
    const named = mealPlace('bbb', { name: '성수 삼겹살집' });
    const plain = mealPlace('bba');
    const { candidates } = rankPlaceCandidates([named, plain], intentRequest);
    const boosted = candidates.find((candidate) => candidate.kakaoPlaceId === 'bbb')!;
    const base = candidates.find((candidate) => candidate.kakaoPlaceId === 'bba')!;
    expect(boosted.scoreBreakdown.intent - base.scoreBreakdown.intent).toBe(20);
  });

  it('expansion evidence는 exact보다 낮게(1차 +12, 2차 +6) 가산한다', () => {
    const evidence = (expansionLevel: 0 | 1 | 2, queryText: string) => mealPlace(`c${expansionLevel}x`, {
      matchedSearchEvidence: [{
        queryId: `query_00${expansionLevel + 2}`, source: 'keyword', page: 1, queryText,
        phase: 'step_intent', stepId: 'step-0', canonicalTerm: '삼겹살', strength: 'preferred', expansionLevel,
      }],
    });
    const { candidates } = rankPlaceCandidates(
      [evidence(0, '삼겹살'), evidence(1, '돼지고기구이'), evidence(2, '고기집')],
      intentRequest,
    );
    const intentOf = (id: string) => candidates.find((candidate) => candidate.kakaoPlaceId === id)!.scoreBreakdown.intent;
    expect(intentOf('c0x') - intentOf('c1x')).toBe(35 - 12);
    expect(intentOf('c1x') - intentOf('c2x')).toBe(12 - 6);
  });
});

describe('recommend-date straight-line route and constraint metadata', () => {
  it('computes Haversine distance from the search center', () => {
    const near = haversineDistanceMeters({ latitude: 37, longitude: 127 }, { latitude: 37, longitude: 127.001 });
    const far = haversineDistanceMeters({ latitude: 37, longitude: 127 }, { latitude: 37, longitude: 127.05 });

    expect(near).toBeLessThan(far);
    expect(near).toBeGreaterThan(80);
  });

  it('labels adjacent and total distance as straight-line and walking limit as provisional', () => {
    const candidates = rankPlaceCandidates([
      place('a', 'FD6', 127.001),
      place('b', 'CE7', 127.002),
    ], request()).candidates;

    const metadata = calculateStraightLineRouteMetadata(candidates, 10);

    expect(metadata.distanceMethod).toBe('haversine_straight_line');
    expect(metadata.adjacentDistanceMeters).toHaveLength(1);
    expect(metadata.totalDistanceMeters).toBe(metadata.adjacentDistanceMeters[0]);
    expect(metadata.walkingHeuristicMetersPerMinute).toBe(80);
    expect(metadata.walkingLimitAssessment).toMatch(/^provisional_/);
    expect(metadata.hardConstraintValidated).toBe(false);
  });
});
