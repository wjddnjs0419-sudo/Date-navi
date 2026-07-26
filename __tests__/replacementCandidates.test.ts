import {
  buildKakaoMapUrl,
  rankReplacementCandidates,
  storedReplacementHistoryVariant,
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

  it('makes a user-facing Kakao map URL without asserting third-party review facts', () => {
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

  it('keeps current-course and walking-infeasible places out before history scores can affect replacement order', () => {
    const result = rankReplacementCandidates({
      target: step('cafe', 127.010),
      previous: step('meal', 127.000),
      next: step('walk', 127.020),
      existingKakaoPlaceIds: ['current-place-meal', 'current-place-cafe', 'current-place-walk'],
      candidates: [
        { ...candidate('current-cafe', 127.011), kakaoPlaceId: 'current-place-cafe' },
        candidate('walk-too-far', 127.100),
        candidate('available', 127.011),
      ],
      maxWalkingMinutes: 20,
      history: {
        recentHardPlaceIds: [],
        recentExposure: {},
        negativeActions: {
          'current-place-cafe': { replacedCount: 1, deletedCount: 0, lastNegativeAt: '2026-07-01T00:00:00.000Z' },
        },
        feedback: {},
        qualifiedPairs: [],
      },
      now: '2026-07-26T00:00:00.000Z',
    });

    expect(result.pool.map((entry) => entry.kakaoPlaceId)).toEqual(['place-available']);
    expect(result.pool[0]).toMatchObject({
      displayRank: 1,
      scoreBreakdown: { behavior: 0, diversity: 0, pair: 0 },
    });
  });

  it('uses recent negative actions as a replacement score penalty without excluding sparse-area candidates', () => {
    const result = rankReplacementCandidates({
      target: step('cafe', 127.010),
      existingKakaoPlaceIds: ['current-place-cafe'],
      candidates: [candidate('recent-negative', 127.011), candidate('neutral', 127.011)],
      history: {
        recentHardPlaceIds: [],
        recentExposure: {},
        negativeActions: {
          'place-recent-negative': { replacedCount: 1, deletedCount: 1, lastNegativeAt: '2026-07-01T00:00:00.000Z' },
        },
        feedback: {},
        qualifiedPairs: [],
      },
      now: '2026-07-26T00:00:00.000Z',
    });

    expect(result.top.map((entry) => entry.kakaoPlaceId)).toEqual(['place-neutral', 'place-recent-negative']);
    expect(result.top[1]).toMatchObject({
      scoreBreakdown: { diversity: 0, behavior: -30, pair: 0 },
    });
  });

  it('lets bounded feedback and adjacent-pair evidence break a route-context tie', () => {
    const result = rankReplacementCandidates({
      target: step('cafe', 127.010),
      previous: step('meal', 127.000),
      existingKakaoPlaceIds: ['current-place-cafe', 'current-place-meal'],
      candidates: [candidate('neutral', 127.011), candidate('supported', 127.011)],
      history: {
        recentHardPlaceIds: [],
        recentExposure: {},
        negativeActions: {},
        feedback: {
          'place-supported': { revisit: true, quiet: 1, noisy: 0, photos: 1, crowded: 0 },
        },
        qualifiedPairs: [{ sourceKakaoPlaceId: 'place-supported', targetKakaoPlaceId: 'current-place-meal' }],
      },
      preferences: { quietPreferred: true, photoFriendlyPreferred: true },
      now: '2026-07-26T00:00:00.000Z',
    });

    expect(result.top.map((entry) => entry.kakaoPlaceId)).toEqual(['place-supported', 'place-neutral']);
    expect(result.top[0]).toMatchObject({
      scoreBreakdown: { diversity: 0, behavior: 10, pair: 3 },
    });
    expect(result.top[0].scoreBreakdown.behavior).toBeLessThanOrEqual(10);
    expect(result.top[0].scoreBreakdown.pair).toBeLessThanOrEqual(6);
  });

  it('uses context score then Kakao ID for stable ties and assigns deterministic display ranks through the 15-item response', () => {
    const candidates = Array.from({ length: 16 }, (_, index) => candidate(`rank-${String(index).padStart(2, '0')}`, 127.011));
    const result = rankReplacementCandidates({
      target: step('cafe', 127.010),
      existingKakaoPlaceIds: ['current-place-cafe'],
      candidates: [{ ...candidate('higher-context', 127.011), score: 51 }, ...candidates],
    });

    expect(result.pool.slice(0, 3).map((entry) => entry.kakaoPlaceId)).toEqual([
      'place-higher-context', 'place-rank-00', 'place-rank-01',
    ]);
    expect([...result.top, ...result.additional].map((entry) => entry.displayRank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it('keeps the empty-history control curation order and 30-item pool unchanged', () => {
    const result = rankReplacementCandidates({
      target: step('cafe', 127.010),
      existingKakaoPlaceIds: ['current-place-cafe'],
      candidates: Array.from({ length: 31 }, (_, index) => candidate(`control-${String(index).padStart(2, '0')}`, 127.011)),
      history: {
        recentHardPlaceIds: [], recentExposure: {}, negativeActions: {}, feedback: {}, qualifiedPairs: [],
      },
    });

    expect(result.pool).toHaveLength(30);
    expect(result.top.map((entry) => entry.kakaoPlaceId)).toEqual([
      'place-control-00', 'place-control-01', 'place-control-02',
    ]);
    expect(result.additional.map((entry) => entry.kakaoPlaceId)).toEqual([
      'place-control-03', 'place-control-04', 'place-control-05', 'place-control-06',
      'place-control-07', 'place-control-08', 'place-control-09', 'place-control-10',
      'place-control-11', 'place-control-12', 'place-control-13', 'place-control-14',
    ]);
  });

  it('inherits only a valid stored initial experiment arm and otherwise stays control', () => {
    const treatment = {
      historyExperiment: {
        name: 'history-diversity-v1', assignedVariant: 'treatment', effectiveVariant: 'treatment', assignmentUnit: 'user',
        historyLoad: 'loaded', recentHistoryExcludedCount: 2, recentCooldownRelaxed: false,
      },
    };

    expect(storedReplacementHistoryVariant(treatment)).toBe('treatment');
    expect(storedReplacementHistoryVariant({ historyExperiment: { assignedVariant: 'treatment' } })).toBe('control');
    expect(storedReplacementHistoryVariant(undefined)).toBe('control');
  });
});
