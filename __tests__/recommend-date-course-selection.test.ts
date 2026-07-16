import type { RecommendationRequest } from '../shared/recommendation/schemas';
import type { LockedCourseStepInput } from '../shared/recommendation/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCandidateOnlyCourse,
  buildDeterministicCandidateCourse,
  candidateMatchesCategory,
  candidateOnlySelectionSchema,
  CourseSelectionError,
  MAX_CANDIDATE_POOL_SIZE,
} from '../supabase/functions/_shared/recommendation-course-selection';
import type { PlaceCandidate } from '../supabase/functions/_shared/recommendation-ranking';

const lockedStep = (
  stepId: string,
  candidateId: string,
  kakaoPlaceId: string,
  overrides: Partial<LockedCourseStepInput> = {},
): LockedCourseStepInput => ({
  stepId,
  candidateId,
  kakaoPlaceId,
  name: `Locked ${kakaoPlaceId}`,
  address: `Addr ${kakaoPlaceId}`,
  roadAddress: `Road ${kakaoPlaceId}`,
  mapUrl: `https://place.map.kakao.com/${kakaoPlaceId}`,
  latitude: 37.001,
  longitude: 127.001,
  locked: true,
  ...overrides,
});

const request = (overrides: Partial<RecommendationRequest> = {}): RecommendationRequest => ({
  requestId: 'phase7-request',
  mode: 'course',
  language: 'en',
  location: {
    source: 'kakao',
    label: 'Seoul Forest',
    latitude: 37,
    longitude: 127,
    kind: 'landmark',
  },
  courseSteps: [
    { id: 'meal-step', category: 'meal', label: 'Meal' },
    { id: 'cafe-step', category: 'cafe', label: 'Cafe' },
  ],
  maxWalkingMinutes: 5,
  ...overrides,
});

const candidate = (
  candidateId: string,
  kakaoPlaceId: string,
  categoryGroupCode: string,
  longitude: number,
  score = 60,
): PlaceCandidate => ({
  candidateId,
  kakaoPlaceId,
  name: `Place ${kakaoPlaceId}`,
  categoryGroupCode,
  categoryGroupName: categoryGroupCode === 'FD6' ? 'Restaurant' : 'Cafe',
  categoryName: categoryGroupCode === 'FD6' ? 'Restaurant > Korean' : 'Cafe',
  address: `Address ${kakaoPlaceId}`,
  roadAddress: `Road ${kakaoPlaceId}`,
  latitude: 37,
  longitude,
  mapUrl: `https://place.map.kakao.com/${kakaoPlaceId}`,
  matchedSearchEvidence: [{
    queryId: `query-${candidateId}`,
    source: 'category',
    page: 1,
    categoryCode: categoryGroupCode,
  }],
  distanceFromSearchCenterMeters: 100,
  score,
  scoreBreakdown: {
    intent: 40,
    distance: 20,
    budget: 0,
    preference: 0,
    routeFit: 0,
    diversity: 0,
    behavior: 0,
    penalty: 0,
  },
});

const candidates = [
  candidate('meal-near', 'meal-near-id', 'FD6', 127.0000, 70),
  candidate('meal-far', 'meal-far-id', 'FD6', 127.0300, 90),
  candidate('cafe-near', 'cafe-near-id', 'CE7', 127.0010, 65),
  candidate('cafe-far', 'cafe-far-id', 'CE7', 127.0500, 95),
];

const selection = {
  steps: [
    { stepId: 'meal-step', candidateId: 'meal-near' },
    { stepId: 'cafe-step', candidateId: 'cafe-near' },
  ],
};

describe('candidate-only selection schema', () => {
  it('accepts only ordered stepId and candidateId fields', () => {
    expect(candidateOnlySelectionSchema.safeParse(selection).success).toBe(true);
    expect(candidateOnlySelectionSchema.safeParse({
      steps: [{ ...selection.steps[0], placeName: 'Invented fact' }, selection.steps[1]],
    }).success).toBe(false);
  });

  it.each([
    ['missing candidate ID', { steps: [{ stepId: 'meal-step' }, selection.steps[1]] }],
    ['duplicate candidate ID', { steps: [selection.steps[0], { stepId: 'cafe-step', candidateId: 'meal-near' }] }],
  ])('rejects %s', (_case, value) => {
    expect(candidateOnlySelectionSchema.safeParse(value).success).toBe(false);
  });
});

describe('verified Kakao category matching', () => {
  it('does not treat keyword query evidence as proof of drinks or activity category', () => {
    const restaurantFromDrinksQuery = {
      ...candidate('restaurant', 'restaurant-id', 'FD6', 127),
      matchedSearchEvidence: [{ queryId: 'drinks-query', source: 'keyword' as const, page: 1, queryText: '술집' }],
    };
    const genericFromActivityQuery = {
      ...candidate('generic', 'generic-id', 'PK6', 127),
      name: '데이트 플레이스',
      categoryGroupName: '서비스업',
      categoryName: '서비스업 > 대여',
      matchedSearchEvidence: [{ queryId: 'activity-query', source: 'keyword' as const, page: 1, queryText: '액티비티' }],
    };

    expect(candidateMatchesCategory(restaurantFromDrinksQuery, 'drinks')).toBe(false);
    expect(candidateMatchesCategory(genericFromActivityQuery, 'activity')).toBe(false);
  });

  it.each([
    ['동네 술집', '음식점 > 술집', 'drinks'],
    ['밤마실 주점', '음식점 > 주점', 'drinks'],
    ['성수 이자카야', '음식점 > 일식 > 이자카야', 'drinks'],
    ['서울숲 와인바', '음식점 > 와인바', 'drinks'],
    ['문라이트 펍', '음식점 > 펍', 'drinks'],
    ['골목 포차', '음식점 > 포장마차', 'drinks'],
    ['성수 방탈출', '놀이시설 > 방탈출', 'activity'],
    ['도자기 공방 체험', '문화 > 체험', 'activity'],
  ])('accepts verified %s category/name as %s', (name, categoryName, expectedCategory) => {
    const verified = {
      ...candidate('verified', 'verified-id', 'PK6', 127),
      name,
      categoryGroupName: '',
      categoryName,
      matchedSearchEvidence: [],
    };

    expect(candidateMatchesCategory(verified, expectedCategory)).toBe(true);
  });
});

describe('candidate-only course validation and assembly', () => {
  it.each([
    ['unknown ID', { steps: [selection.steps[0], { stepId: 'cafe-step', candidateId: 'unknown' }] }],
    ['wrong step order', { steps: [...selection.steps].reverse() }],
    ['wrong category', { steps: [selection.steps[0], { stepId: 'cafe-step', candidateId: 'meal-far' }] }],
  ])('rejects %s without trusting AI facts', (_case, invalidSelection) => {
    expect(() => buildCandidateOnlyCourse({
      request: request(),
      candidates,
      selection: invalidSelection,
      generatedAt: '2026-07-14T00:00:00.000Z',
    })).toThrow(CourseSelectionError);
  });

  it('preserves a locked step tuple and rejects replacing any part of it', () => {
    const lockedRequest = request({
      lockedSteps: [lockedStep('meal-step', 'meal-near', 'meal-near-id')],
    });
    const result = buildCandidateOnlyCourse({
      request: lockedRequest,
      candidates,
      selection,
      generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(result.course.steps[0]).toMatchObject({
      stepId: 'meal-step', candidateId: 'meal-near', kakaoPlaceId: 'meal-near-id', locked: true,
    });
    expect(() => buildCandidateOnlyCourse({
      request: lockedRequest,
      candidates,
      selection: { steps: [{ stepId: 'meal-step', candidateId: 'meal-far' }, selection.steps[1]] },
      generatedAt: '2026-07-14T00:00:00.000Z',
    })).toThrow(CourseSelectionError);
  });

  it('resolves a locked step from its own carried facts even when a fresh search no longer returns that candidateId', () => {
    const staleLock = lockedStep('meal-step', 'candidate_stale_007', 'meal-near-id');
    const freshCandidatesWithRenumberedIds = [
      { ...candidates[0], candidateId: 'candidate_001' },
      { ...candidates[2], candidateId: 'candidate_002' },
    ];
    const lockedRequest = request({ lockedSteps: [staleLock] });

    const result = buildCandidateOnlyCourse({
      request: lockedRequest,
      candidates: freshCandidatesWithRenumberedIds,
      selection: { steps: [{ stepId: 'meal-step', candidateId: 'candidate_stale_007' }, { stepId: 'cafe-step', candidateId: 'candidate_002' }] },
      generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(result.course.steps[0]).toMatchObject({
      stepId: 'meal-step',
      candidateId: 'candidate_stale_007',
      kakaoPlaceId: 'meal-near-id',
      name: 'Locked meal-near-id',
      locked: true,
    });
  });

  it('echoes a pinned-but-unlocked step with locked=false so the mutation RPC lock-flag check passes', () => {
    const pinnedUnlocked = lockedStep('meal-step', 'meal-near', 'meal-near-id', { locked: false });
    const result = buildCandidateOnlyCourse({
      request: request({ lockedSteps: [pinnedUnlocked] }),
      candidates,
      selection,
      generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(result.course.steps[0]).toMatchObject({
      stepId: 'meal-step', candidateId: 'meal-near', kakaoPlaceId: 'meal-near-id', locked: false,
    });
  });

  it('keeps locked=true for a pin without an explicit locked flag (legacy membership semantics)', () => {
    const legacyPin = lockedStep('meal-step', 'meal-near', 'meal-near-id');
    delete (legacyPin as Partial<LockedCourseStepInput>).locked;
    const result = buildCandidateOnlyCourse({
      request: request({ lockedSteps: [legacyPin] }),
      candidates,
      selection,
      generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(result.course.steps[0].locked).toBe(true);
  });

  it('rejects hard-excluded candidates and duplicate stable Kakao IDs', () => {
    expect(() => buildCandidateOnlyCourse({
      request: request({ excludedPlaceIds: ['meal-far-id'] }),
      candidates,
      selection,
      generatedAt: '2026-07-14T00:00:00.000Z',
    })).toThrow(CourseSelectionError);

    expect(() => buildCandidateOnlyCourse({
      request: request(),
      candidates: [candidates[0], { ...candidates[2], kakaoPlaceId: candidates[0].kakaoPlaceId }],
      selection,
      generatedAt: '2026-07-14T00:00:00.000Z',
    })).toThrow(CourseSelectionError);
  });

  it('copies only verified candidate facts and preserves request/session identity', () => {
    const result = buildCandidateOnlyCourse({
      request: request(),
      candidates,
      selection,
      generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(result.course).toMatchObject({
      requestId: 'phase7-request',
      sessionId: 'phase7-request',
      generatedAt: '2026-07-14T00:00:00.000Z',
      steps: [
        expect.objectContaining({
          label: 'Meal',
          address: 'Address meal-near-id',
          roadAddress: 'Road meal-near-id',
          mapUrl: 'https://place.map.kakao.com/meal-near-id',
        }),
        expect.objectContaining({
          label: 'Cafe',
          address: 'Address cafe-near-id',
          roadAddress: 'Road cafe-near-id',
          mapUrl: 'https://place.map.kakao.com/cafe-near-id',
        }),
      ],
    });
    expect(result.cards[0].steps).toEqual([
      expect.objectContaining({
        candidateId: 'meal-near', kakaoPlaceId: 'meal-near-id', place_name: 'Place meal-near-id',
      }),
      expect.objectContaining({
        candidateId: 'cafe-near', kakaoPlaceId: 'cafe-near-id', place_name: 'Place cafe-near-id',
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/estimated_budget|price|quiet|opening/i);
  });

  it('omits blank optional Kakao address and map URL instead of failing strict card assembly', () => {
    const sparseCandidates = [
      { ...candidates[0], address: '', roadAddress: '', mapUrl: '' },
      { ...candidates[2], address: '', roadAddress: '', mapUrl: '' },
    ];

    const result = buildCandidateOnlyCourse({
      request: request(),
      candidates: sparseCandidates,
      selection,
      generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(result.cards[0].steps?.[0]).not.toHaveProperty('place_address');
    expect(result.cards[0].steps?.[0]).not.toHaveProperty('map_url');
    expect(result.course.steps[0]).toMatchObject({ address: '', roadAddress: '', mapUrl: '' });
  });
});

describe('deterministic candidate-only fallback', () => {
  it('publishes the handler candidate bound and uses constant-memory full-pool traversal', () => {
    const source = readFileSync(join(
      process.cwd(), 'supabase/functions/_shared/recommendation-course-selection.ts',
    ), 'utf8');

    expect(MAX_CANDIDATE_POOL_SIZE).toBe(40);
    expect(source).not.toContain('.slice(0, 8)');
    expect(source).not.toContain('const routes:');
  });

  it('returns the same ordered route for the same candidates in reverse order', () => {
    const forward = buildDeterministicCandidateCourse({
      request: request(), candidates, generatedAt: '2026-07-14T00:00:00.000Z',
    });
    const reversed = buildDeterministicCandidateCourse({
      request: request(), candidates: [...candidates].reverse(), generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(reversed).toEqual(forward);
    expect(forward.course.steps.map((step) => step.category)).toEqual(['meal', 'cafe']);
  });

  it('prefers a route within the walking heuristic before higher-scored far candidates', () => {
    const result = buildDeterministicCandidateCourse({
      request: request(), candidates, generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(result.course.steps.map((step) => step.candidateId)).toEqual(['meal-near', 'cafe-near']);
    expect(result.route.walkingLimitAssessment).toBe('provisional_within');
    expect(result.course.relaxedConstraints).toEqual([]);
  });

  it('finds the only walking-compliant candidate even when score ranks it ninth', () => {
    const meal = candidate('meal', 'meal-id', 'FD6', 127, 100);
    const farCafes = Array.from({ length: 8 }, (_, index) => (
      candidate(`cafe-far-${index}`, `cafe-far-id-${index}`, 'CE7', 127.02 + index / 1000, 100 - index)
    ));
    const ninthNearCafe = candidate('cafe-near-ninth', 'cafe-near-ninth-id', 'CE7', 127.001, 1);

    const result = buildDeterministicCandidateCourse({
      request: request(),
      candidates: [meal, ...farCafes, ninthNearCafe],
      generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(result.course.steps.map((step) => step.candidateId)).toEqual(['meal', 'cafe-near-ninth']);
    expect(result.route.walkingLimitAssessment).toBe('provisional_within');
  });

  it('rejects a candidate pool larger than the explicit handler bound', () => {
    const oversized = [
      candidate('meal', 'meal-id', 'FD6', 127),
      ...Array.from({ length: 40 }, (_, index) => (
        candidate(`cafe-${index}`, `cafe-id-${index}`, 'CE7', 127.001 + index / 10000)
      )),
    ];

    expect(() => buildDeterministicCandidateCourse({
      request: request(), candidates: oversized, generatedAt: '2026-07-14T00:00:00.000Z',
    })).toThrow(CourseSelectionError);
  });

  it.each(['ko', 'en'] as const)('returns an explicit localized walking relaxation in %s', (language) => {
    const farOnly = [
      candidate('meal', 'meal-id', 'FD6', 127.0000),
      candidate('cafe', 'cafe-id', 'CE7', 127.0300),
    ];
    const result = buildDeterministicCandidateCourse({
      request: request({ language, maxWalkingMinutes: 5 }),
      candidates: farOnly,
      generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(result.route.walkingLimitAssessment).toBe('provisional_exceeded');
    expect(result.course.relaxedConstraints).toEqual([{
      constraint: 'maxWalkingMinutes',
      reason: expect.stringMatching(language === 'ko' ? /직선거리|분/ : /straight-line|minutes/i),
    }]);
  });

  it('pins a locked step using its carried facts during deterministic fallback, even without a matching fresh candidate', () => {
    const staleLock = lockedStep('meal-step', 'candidate_stale_099', 'ghost-place-id');
    const lockedRequest = request({ lockedSteps: [staleLock] });

    const result = buildDeterministicCandidateCourse({
      request: lockedRequest,
      candidates: [candidates[2], candidates[3]],
      generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(result.course.steps[0]).toMatchObject({
      stepId: 'meal-step', kakaoPlaceId: 'ghost-place-id', locked: true,
    });
    expect(result.course.steps[1].category).toBe('cafe');
  });

  it('echoes a pinned-but-unlocked step with locked=false during deterministic fallback', () => {
    const pinnedUnlocked = lockedStep('meal-step', 'candidate_stale_099', 'ghost-place-id', { locked: false });

    const result = buildDeterministicCandidateCourse({
      request: request({ lockedSteps: [pinnedUnlocked] }),
      candidates: [candidates[2], candidates[3]],
      generatedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(result.course.steps[0]).toMatchObject({
      stepId: 'meal-step', kakaoPlaceId: 'ghost-place-id', locked: false,
    });
  });

  it('returns a typed failure when no unique category-preserving route exists', () => {
    const impossible = [
      candidate('meal', 'same-place', 'FD6', 127),
      candidate('cafe', 'same-place', 'CE7', 127.001),
    ];

    expect(() => buildDeterministicCandidateCourse({
      request: request(), candidates: impossible, generatedAt: '2026-07-14T00:00:00.000Z',
    })).toThrow(CourseSelectionError);
  });
});
