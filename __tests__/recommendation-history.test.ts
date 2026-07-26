import {
  EMPTY_RECOMMENDATION_HISTORY,
  behaviorScoreFor,
  diversityScoreFor,
  pairBonusForAdjacentPlaces,
  type RecommendationHistoryContext,
} from '../shared/recommendation/recommendation-history';

const NOW = '2026-07-26T00:00:00.000Z';

const history: RecommendationHistoryContext = {
  recentHardPlaceIds: ['recent-1', 'recent-2'],
  recentExposure: {
    'recent-1': { lastSeenAt: '2026-07-25T00:00:00.000Z', sessionDistance: 1 },
    'recent-2': { lastSeenAt: '2026-07-24T00:00:00.000Z', sessionDistance: 2 },
    'third-session': { lastSeenAt: '2026-07-20T00:00:00.000Z', sessionDistance: 3 },
    'fifth-session': { lastSeenAt: '2026-07-10T00:00:00.000Z', sessionDistance: 5 },
    'old-in-90-days': { lastSeenAt: '2026-06-01T00:00:00.000Z', sessionDistance: 6 },
  },
  negativeActions: {
    replaced: { replacedCount: 1, deletedCount: 0, lastNegativeAt: '2026-07-01T00:00:00.000Z' },
  },
  feedback: {
    liked: { revisit: true, quiet: 1, noisy: 0, photos: 1, crowded: 0 },
    loud: { revisit: false, quiet: 0, noisy: 1, photos: 0, crowded: 1 },
  },
  qualifiedPairs: [
    { sourceKakaoPlaceId: 'liked', targetKakaoPlaceId: 'neighbour-a' },
    { sourceKakaoPlaceId: 'neighbour-b', targetKakaoPlaceId: 'liked' },
    { sourceKakaoPlaceId: 'liked', targetKakaoPlaceId: 'neighbour-c' },
  ],
};

describe('recommendation history policy', () => {
  it('scores normalized same-area exposure by recency band', () => {
    expect(diversityScoreFor('third-session', history, { now: NOW })).toBe(-15);
    expect(diversityScoreFor('fifth-session', history, { now: NOW })).toBe(-15);
    expect(diversityScoreFor('old-in-90-days', history, { now: NOW })).toBe(-5);
    expect(diversityScoreFor('unexposed', history, { now: NOW })).toBe(0);
    expect(diversityScoreFor('recent-1', history, { now: NOW, reintroduced: true })).toBe(-30);
  });

  it('scores recent negative actions and preference-aligned feedback within the behavior clamp', () => {
    expect(behaviorScoreFor('replaced', history, { now: NOW })).toBe(-30);
    expect(behaviorScoreFor('liked', history, {
      now: NOW, quietPreferred: true, photoFriendlyPreferred: true,
    })).toBe(10);
    expect(behaviorScoreFor('loud', history, { now: NOW, quietPreferred: true })).toBe(-16);

    const clamped: RecommendationHistoryContext = {
      ...history,
      negativeActions: {
        overloaded: { replacedCount: 1, deletedCount: 1, lastNegativeAt: '2026-07-01T00:00:00.000Z' },
      },
      feedback: {
        overloaded: { revisit: true, quiet: 5, noisy: 5, photos: 5, crowded: 5 },
      },
    };
    expect(behaviorScoreFor('overloaded', clamped, {
      now: NOW, quietPreferred: true, photoFriendlyPreferred: true,
    })).toBe(-31);

    const lowerClamped: RecommendationHistoryContext = {
      ...history,
      negativeActions: {
        lower: { replacedCount: 1, deletedCount: 0, lastNegativeAt: '2026-07-01T00:00:00.000Z' },
      },
      feedback: {
        lower: { revisit: false, quiet: 0, noisy: 1, photos: 0, crowded: 1 },
      },
    };
    expect(behaviorScoreFor('lower', lowerClamped, { now: NOW, quietPreferred: true })).toBe(-40);
  });

  it('applies each feedback signal only when its matching request preference is present', () => {
    const independent: RecommendationHistoryContext = {
      ...history,
      feedback: {
        revisit: { revisit: true, quiet: 0, noisy: 0, photos: 0, crowded: 0 },
        quiet: { revisit: false, quiet: 1, noisy: 0, photos: 0, crowded: 0 },
        photos: { revisit: false, quiet: 0, noisy: 0, photos: 1, crowded: 0 },
        noisy: { revisit: false, quiet: 0, noisy: 1, photos: 0, crowded: 0 },
        crowded: { revisit: false, quiet: 0, noisy: 0, photos: 0, crowded: 1 },
      },
    };
    expect(behaviorScoreFor('revisit', independent, { now: NOW })).toBe(5);
    expect(behaviorScoreFor('quiet', independent, { now: NOW, quietPreferred: true })).toBe(5);
    expect(behaviorScoreFor('photos', independent, { now: NOW, photoFriendlyPreferred: true })).toBe(5);
    expect(behaviorScoreFor('noisy', independent, { now: NOW, quietPreferred: true })).toBe(-8);
    expect(behaviorScoreFor('crowded', independent, { now: NOW, quietPreferred: true })).toBe(-8);
  });

  it('adds at most six qualified-pair points across adjacent places', () => {
    expect(pairBonusForAdjacentPlaces('liked', ['neighbour-a'], history)).toBe(3);
    expect(pairBonusForAdjacentPlaces('liked', ['neighbour-a', 'neighbour-b', 'neighbour-c'], history)).toBe(6);
    expect(pairBonusForAdjacentPlaces('liked', ['unqualified'], history)).toBe(0);
    expect(pairBonusForAdjacentPlaces('liked', ['neighbour-a'], {
      ...history,
      qualifiedPairs: [],
    })).toBe(0);
  });

  it('exports an immutable empty context without historical signals', () => {
    expect(EMPTY_RECOMMENDATION_HISTORY).toEqual({
      recentHardPlaceIds: [], recentExposure: {}, negativeActions: {}, feedback: {}, qualifiedPairs: [],
    });
    expect(Object.isFrozen(EMPTY_RECOMMENDATION_HISTORY)).toBe(true);
  });
});
