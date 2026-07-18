import {
  buildKakaoMapUrl,
  buildNaverMapUrl,
  rankReplacementCandidates,
} from '../lib/replacement-candidates';
import type { RecommendationCourseStep } from '../shared/recommendation/contracts';
import type { PlaceCandidate } from '../supabase/functions/_shared/recommendation-ranking';

const candidate = (id: string, longitude: number): PlaceCandidate => ({
  candidateId: id,
  kakaoPlaceId: `place-${id}`,
  name: `Place ${id}`,
  categoryGroupCode: 'CE7',
  categoryGroupName: 'Cafe',
  categoryName: 'Cafe',
  address: 'Seoul',
  roadAddress: 'Seoul road',
  latitude: 37.55,
  longitude,
  mapUrl: `https://place.map.kakao.com/place-${id}`,
  matchedSearchEvidence: [],
  distanceFromSearchCenterMeters: 100,
  score: 50,
  scoreBreakdown: { intent: 40, distance: 10, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
});

const step = (stepId: string, longitude: number): RecommendationCourseStep => ({
  stepId,
  order: stepId === 'meal' ? 1 : stepId === 'cafe' ? 2 : 3,
  category: 'cafe',
  label: 'Cafe',
  candidateId: `current-${stepId}`,
  kakaoPlaceId: `current-place-${stepId}`,
  name: stepId,
  address: 'Seoul',
  roadAddress: 'Seoul road',
  mapUrl: `https://place.map.kakao.com/current-place-${stepId}`,
  latitude: 37.55,
  longitude,
  reason: 'Verified candidate',
  locked: false,
});

describe('replacement candidate ranking and external verification links', () => {
  it('ranks at most 15 category-compatible non-repeating candidates by the full-course neighbours and exposes Top 3', () => {
    const result = rankReplacementCandidates({
      target: step('cafe', 127.010),
      previous: step('meal', 127.000),
      next: step('walk', 127.020),
      existingKakaoPlaceIds: ['current-place-meal', 'current-place-cafe', 'current-place-walk', 'place-repeat'],
      candidates: [candidate('far', 127.100), candidate('near', 127.011), candidate('repeat', 127.012)],
      maxWalkingMinutes: 20,
    });

    expect(result.top).toEqual([expect.objectContaining({ kakaoPlaceId: 'place-near' })]);
    expect(result.additional).toEqual([]);
    expect([...result.top, ...result.additional]).toHaveLength(1);
  });

  it('makes user-facing Naver map and Kakao map URLs without asserting third-party review facts', () => {
    expect(buildNaverMapUrl('Cafe & Bar')).toBe('https://map.naver.com/p/search/Cafe%20%26%20Bar');
    expect(buildKakaoMapUrl({ kakaoPlaceId: '123', mapUrl: '' })).toBe('https://place.map.kakao.com/123');
  });

  it('exposes a curation pool of up to 30 ranked candidates beyond the 15-item top/additional cap', () => {
    const manyCandidates = Array.from({ length: 40 }, (_, index) => candidate(`c${index}`, 127.011 + index * 0.0001));
    const result = rankReplacementCandidates({
      target: step('cafe', 127.010),
      existingKakaoPlaceIds: ['current-place-meal', 'current-place-cafe', 'current-place-walk'],
      candidates: manyCandidates,
    });

    expect(result.pool).toHaveLength(30);
    expect(result.pool.slice(0, 3)).toEqual(result.top);
    expect(result.pool.slice(3, 15)).toEqual(result.additional);
  });
});
