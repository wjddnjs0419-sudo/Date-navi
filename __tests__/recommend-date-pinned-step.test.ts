import type { RecommendationRequest } from '../shared/recommendation/schemas';
import {
  handleRecommendDate,
  type RecommendDateDependencies,
} from '../supabase/functions/_shared/recommend-date-handler';
import type { PlaceCandidate } from '../supabase/functions/_shared/recommendation-ranking';
import type { KakaoSearchMetadata } from '../supabase/functions/_shared/recommendation-search';

const candidate = (candidateId: string, kakaoPlaceId: string, code: string, longitude: number): PlaceCandidate => ({
  candidateId,
  kakaoPlaceId,
  name: `Verified ${kakaoPlaceId}`,
  categoryGroupCode: code,
  categoryGroupName: code === 'FD6' ? '음식점' : '카페',
  categoryName: code === 'FD6' ? '음식점 > 한식' : '카페',
  address: `Address ${kakaoPlaceId}`,
  roadAddress: `Road ${kakaoPlaceId}`,
  latitude: 37,
  longitude,
  mapUrl: `https://place.map.kakao.com/${kakaoPlaceId}`,
  matchedSearchEvidence: [{ queryId: candidateId, source: 'category', page: 1, categoryCode: code }],
  distanceFromSearchCenterMeters: 100,
  score: 60,
  scoreBreakdown: { intent: 40, distance: 20, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
});

const metadata = (): KakaoSearchMetadata => ({
  requestCount: 2,
  outcomes: [],
  successfulCount: 2,
  failedCount: 0,
  rateLimitedCount: 0,
  timeoutCount: 0,
  allSearchesFailed: false,
});

function dependencies(
  pool: PlaceCandidate[],
  overrides: Partial<RecommendDateDependencies> = {},
): RecommendDateDependencies {
  return {
    authenticate: jest.fn(async () => ({ id: 'user' })),
    searchCandidates: jest.fn(async () => ({
      candidates: pool,
      recallByCategory: { meal: 1, cafe: 1 },
      searchMetadata: metadata(),
    })),
    generateSelection: jest.fn(async () => ({
      steps: [{ stepId: 'meal', candidateId: 'ai-meal' }, { stepId: 'cafe', candidateId: 'cafe-cand' }],
    })),
    now: jest.fn(() => '2026-07-14T00:00:00.000Z'),
    ...overrides,
  };
}

const base = (): Omit<RecommendationRequest, 'courseSteps'> => ({
  requestId: 'pin-test',
  mode: 'course',
  language: 'ko',
  location: { source: 'kakao', label: '서울숲', latitude: 37, longitude: 127, kind: 'landmark' },
  maxWalkingMinutes: 10,
});

function stepsOf(result: { body: unknown }): { stepId: string; kakaoPlaceId: string }[] {
  return (result.body as { course: { steps: { stepId: string; kakaoPlaceId: string }[] } }).course.steps;
}

describe('recommend-date 입력 시점 스텝 핀', () => {
  it('모든 스텝이 핀이면 AI를 호출하지 않고 지정 장소로 코스를 만든다', async () => {
    // 식사 슬롯에 카페(CE7)를 핀 → 지정이 카테고리를 이긴다.
    const pool = [candidate('cand-a', 'pinned-meal', 'CE7', 127), candidate('cand-b', 'pinned-cafe', 'CE7', 127.001)];
    const deps = dependencies(pool);
    const body: RecommendationRequest = {
      ...base(),
      courseSteps: [
        { id: 'meal', category: 'meal', label: '블루보틀', pinnedKakaoPlaceId: 'pinned-meal', pinnedName: '블루보틀' },
        { id: 'cafe', category: 'cafe', label: '센터커피', pinnedKakaoPlaceId: 'pinned-cafe', pinnedName: '센터커피' },
      ],
    };

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body }, deps);

    expect(result.status).toBe(200);
    expect(deps.generateSelection).not.toHaveBeenCalled();
    const steps = stepsOf(result);
    expect(steps.find((s) => s.stepId === 'meal')?.kakaoPlaceId).toBe('pinned-meal');
    expect(steps.find((s) => s.stepId === 'cafe')?.kakaoPlaceId).toBe('pinned-cafe');
  });

  it('부분 핀이면 핀 스텝은 지정, 나머지는 AI가 고른다', async () => {
    const pool = [
      candidate('cand-a', 'pinned-meal', 'CE7', 127),
      candidate('ai-meal', 'other-meal', 'FD6', 127.002),
      candidate('cafe-cand', 'cafe-id', 'CE7', 127.001),
    ];
    const deps = dependencies(pool);
    const body: RecommendationRequest = {
      ...base(),
      courseSteps: [
        { id: 'meal', category: 'meal', label: '블루보틀', pinnedKakaoPlaceId: 'pinned-meal', pinnedName: '블루보틀' },
        { id: 'cafe', category: 'cafe', label: '카페' },
      ],
    };

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body }, deps);

    expect(result.status).toBe(200);
    expect(deps.generateSelection).toHaveBeenCalledTimes(1);
    const steps = stepsOf(result);
    // AI가 meal에 other-meal을 골라도 핀이 이긴다.
    expect(steps.find((s) => s.stepId === 'meal')?.kakaoPlaceId).toBe('pinned-meal');
    expect(steps.find((s) => s.stepId === 'cafe')?.kakaoPlaceId).toBe('cafe-id');
  });

  it('지정 장소가 후보 풀에 없으면 STEP_PIN_UNAVAILABLE(422)을 반환한다', async () => {
    const pool = [candidate('cafe-cand', 'cafe-id', 'CE7', 127.001)];
    const deps = dependencies(pool);
    const body: RecommendationRequest = {
      ...base(),
      courseSteps: [
        { id: 'meal', category: 'meal', label: '블루보틀', pinnedKakaoPlaceId: 'missing-pin', pinnedName: '블루보틀' },
        { id: 'cafe', category: 'cafe', label: '카페' },
      ],
    };

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body }, deps);

    expect(result.status).toBe(422);
    expect((result.body as { error: { code: string } }).error.code).toBe('STEP_PIN_UNAVAILABLE');
    expect(deps.generateSelection).not.toHaveBeenCalled();
  });

  it('부분 핀 + AI 응답 손상이면 결정론 폴백도 핀을 지킨다', async () => {
    const pool = [
      candidate('cand-a', 'pinned-meal', 'CE7', 127),
      candidate('cafe-cand', 'cafe-id', 'CE7', 127.001),
    ];
    const deps = dependencies(pool, { generateSelection: jest.fn(async () => ({ nonsense: true })) });
    const body: RecommendationRequest = {
      ...base(),
      courseSteps: [
        { id: 'meal', category: 'meal', label: '블루보틀', pinnedKakaoPlaceId: 'pinned-meal', pinnedName: '블루보틀' },
        { id: 'cafe', category: 'cafe', label: '카페' },
      ],
    };

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body }, deps);

    expect(result.status).toBe(200);
    expect(stepsOf(result).find((s) => s.stepId === 'meal')?.kakaoPlaceId).toBe('pinned-meal');
  });

  it('핀 스텝 자신을 다른 장소 보기(replace) 대상으로 삼아도 새 후보로 교체된다', async () => {
    const pool = [
      candidate('cand-a', 'pinned-meal', 'FD6', 127),
      candidate('cand-new', 'new-meal', 'FD6', 127.001),
      candidate('cafe-cand', 'cafe-id', 'CE7', 127.002),
    ];
    const deps = dependencies(pool);
    const body: RecommendationRequest = {
      ...base(),
      sessionId: 'session-1',
      courseSteps: [
        { id: 'meal', category: 'meal', label: '블루보틀', pinnedKakaoPlaceId: 'pinned-meal', pinnedName: '블루보틀' },
        { id: 'cafe', category: 'cafe', label: '카페' },
      ],
      replacement: { stepId: 'meal', kakaoPlaceId: 'new-meal' },
      lockedSteps: [
        {
          stepId: 'cafe',
          candidateId: 'cafe-cand',
          kakaoPlaceId: 'cafe-id',
          name: 'Verified cafe-id',
          address: 'Address cafe-id',
          roadAddress: 'Road cafe-id',
          mapUrl: 'https://place.map.kakao.com/cafe-id',
          latitude: 37,
          longitude: 127.002,
        },
      ],
    };

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body }, deps);

    expect(result.status).toBe(200);
    expect(stepsOf(result).find((s) => s.stepId === 'meal')?.kakaoPlaceId).toBe('new-meal');
  });

  it('핀 장소가 excludedPlaceIds에 있으면(재추천으로 교체 지시) 핀 게이트를 건너뛰고 새 장소를 고른다', async () => {
    // 랭킹이 excluded를 걸러낸 상태를 모사: 후보 풀에 핀 장소가 없다.
    const pool = [
      candidate('ai-meal', 'other-meal', 'FD6', 127.002),
      candidate('cafe-cand', 'cafe-id', 'CE7', 127.001),
    ];
    const deps = dependencies(pool);
    const body: RecommendationRequest = {
      ...base(),
      courseSteps: [
        { id: 'meal', category: 'meal', label: '블루보틀', pinnedKakaoPlaceId: 'pinned-meal', pinnedName: '블루보틀' },
        { id: 'cafe', category: 'cafe', label: '카페' },
      ],
      excludedPlaceIds: ['pinned-meal', 'old-cafe-place'],
    };

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body }, deps);

    expect(result.status).toBe(200);
    expect(stepsOf(result).find((s) => s.stepId === 'meal')?.kakaoPlaceId).toBe('other-meal');
  });

  it('요청에서 잠긴 핀 스텝은 강제하지 않아 AI 선택이 폴백 없이 반영된다', async () => {
    // 잠긴 스텝의 candidateId는 과거 검색 호출의 것이라 이번 풀에 없다(락이 자체 사실을 운반).
    const pool = [
      candidate('cand-a', 'pinned-meal', 'FD6', 127),
      candidate('cafe-cand', 'cafe-id', 'CE7', 127.001),
    ];
    const deps = dependencies(pool, {
      generateSelection: jest.fn(async () => ({
        steps: [{ stepId: 'meal', candidateId: 'stale-lock-cand' }, { stepId: 'cafe', candidateId: 'cafe-cand' }],
      })),
    });
    const body: RecommendationRequest = {
      ...base(),
      courseSteps: [
        { id: 'meal', category: 'meal', label: '블루보틀', pinnedKakaoPlaceId: 'pinned-meal', pinnedName: '블루보틀' },
        { id: 'cafe', category: 'cafe', label: '카페' },
      ],
      lockedSteps: [
        {
          stepId: 'meal',
          candidateId: 'stale-lock-cand',
          kakaoPlaceId: 'pinned-meal',
          name: '블루보틀',
          address: 'Address pinned-meal',
          roadAddress: 'Road pinned-meal',
          mapUrl: 'https://place.map.kakao.com/pinned-meal',
          latitude: 37,
          longitude: 127,
        },
      ],
    };

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body }, deps);

    expect(result.status).toBe(200);
    const metadata = (result.body as { metadata: { fallbackUsed: boolean } }).metadata;
    expect(metadata.fallbackUsed).toBe(false);
    expect(stepsOf(result).find((s) => s.stepId === 'meal')?.kakaoPlaceId).toBe('pinned-meal');
  });
});
