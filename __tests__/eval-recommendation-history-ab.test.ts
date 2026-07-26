import {
  analyzeRecommendationHistoryAb,
  type RecommendationHistoryAbInput,
} from '../scripts/eval-recommendation-history-ab';
import { historyExperimentLogKey } from '../shared/recommendation/history-experiment';

const location = { latitude: 37.5444, longitude: 127.0374 };

const session = (
  id: string,
  ownerUserId: string,
  createdAt: string,
  placeId: string,
  overrides: Record<string, unknown> = {},
): RecommendationHistoryAbInput['sessions'][number] => ({
  id,
  ownerUserId,
  coupleId: null,
  createdAt,
  originalRequest: { location },
  metadata: {
    historyExperiment: {
      name: 'history-diversity-v1', assignedVariant: 'treatment', effectiveVariant: 'treatment', assignmentUnit: 'user',
      historyLoad: 'loaded', recentHistoryExcludedCount: 1, recentCooldownRelaxed: false,
    },
  },
  ...overrides,
  steps: [{ originalKakaoPlaceId: placeId }],
});

describe('recommendation history A/B evaluation', () => {
  it('uses original IDs against only the two earlier same-area sessions and averages unit rates before the arm result', () => {
    const report = analyzeRecommendationHistoryAb({
      sessions: [
        session('a-1', 'user-a', '2026-07-01T00:00:00.000Z', 'place-a'),
        session('a-2', 'user-a', '2026-07-02T00:00:00.000Z', 'place-b'),
        session('a-3', 'user-a', '2026-07-03T00:00:00.000Z', 'place-a'),
        session('b-1', 'user-b', '2026-07-01T00:00:00.000Z', 'place-c'),
        session('b-2', 'user-b', '2026-07-02T00:00:00.000Z', 'place-d'),
        session('b-3', 'user-b', '2026-07-03T00:00:00.000Z', 'place-e'),
        session('b-4', 'user-b', '2026-07-04T00:00:00.000Z', 'place-f'),
      ],
      events: [
        { sessionId: 'a-3', eventType: 'place_replaced', candidateRank: 2 },
        { sessionId: 'b-3', eventType: 'place_replaced', candidateRank: 4 },
      ],
      terminalLogs: [
        { event: 'recommend_date_history_outcome', assignedVariant: 'treatment', effectiveVariant: 'treatment', outcome: 'success', sessionKey: historyExperimentLogKey('a-3') },
        { event: 'recommend_date_history_outcome', assignedVariant: 'treatment', effectiveVariant: 'treatment', outcome: 'INSUFFICIENT_CANDIDATES', sessionKey: historyExperimentLogKey('b-3') },
        { event: 'replacement_candidates_served', assignedVariant: 'treatment', effectiveVariant: 'treatment', topThreeRepeatCount: 1, empty: false, sessionKey: historyExperimentLogKey('a-3') },
      ],
    });

    expect(report.assigned.treatment).toMatchObject({
      assignmentUnitCount: 2,
      sameAreaRepeatRate: { numerator: 1, denominator: 2, value: 0.5 },
      recentHistoryExcludedCount: { numerator: 7, denominator: 7, value: 1 },
      replacementTop3RepeatRate: { numerator: 1, denominator: 3, value: 1 / 3 },
      replacementTop3PickRate: { numerator: 1, denominator: 2, value: 0.5 },
      courseGenerationFailureRate: { numerator: 1, denominator: 2, value: 0.5 },
    });
  });

  it('counts sessionless experiment-active failure logs in the arm failure rate', () => {
    const report = analyzeRecommendationHistoryAb({
      sessions: [
        session('a-1', 'user-a', '2026-07-01T00:00:00.000Z', 'place-a'),
      ],
      events: [],
      terminalLogs: [
        { event: 'recommend_date_history_outcome', assignedVariant: 'treatment', effectiveVariant: 'treatment', outcome: 'success', experimentActive: true, sessionKey: historyExperimentLogKey('a-1') },
        // 최초 생성 실패: recommendation_sessions row가 없어 requestId 기반 key만 존재한다.
        { event: 'recommend_date_history_outcome', assignedVariant: 'treatment', effectiveVariant: 'control', outcome: 'PLACE_SEARCH_TIMEOUT', experimentActive: true, sessionKey: historyExperimentLogKey('request-without-session') },
        // 실험 비활성(mode=off) 로그는 어느 arm에도 집계되지 않는다.
        { event: 'recommend_date_history_outcome', assignedVariant: 'control', effectiveVariant: 'control', outcome: 'PLACE_SEARCH_TIMEOUT', sessionKey: historyExperimentLogKey('legacy-request') },
      ],
    });

    expect(report.assigned.treatment.courseGenerationFailureRate).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(report.assigned.control.courseGenerationFailureRate).toEqual({ numerator: 0, denominator: 0, value: null });
    expect(report.effective.control.courseGenerationFailureRate).toEqual({ numerator: 1, denominator: 1, value: 1 });
  });

  it('keeps far-away sessions and the current session itself out of a repeat comparison', () => {
    const report = analyzeRecommendationHistoryAb({
      sessions: [
        session('old-far', 'user-a', '2026-07-01T00:00:00.000Z', 'place-a', {
          originalRequest: { location: { latitude: 37.7, longitude: 127.2 } },
        }),
        session('current', 'user-a', '2026-07-02T00:00:00.000Z', 'place-a'),
      ],
      events: [],
      terminalLogs: [],
    });

    expect(report.assigned.treatment.sameAreaRepeatRate).toEqual({ numerator: 0, denominator: 0, value: null });
  });
});
