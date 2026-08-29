import { buildProviderNeutralCourse } from '../supabase/functions/_shared/provider-neutral-course-selection';
import type { NormalizedPlace } from '../supabase/functions/_shared/place-provider';
import { providerNeutralPlaceMatchesStepCategory } from '../supabase/functions/_shared/provider-neutral-intent';

const request = {
  requestId: 'req-1', mode: 'course' as const, language: 'ko' as const,
  location: { source: 'current' as const, label: '성수역', latitude: 37.5444, longitude: 127.0557, kind: 'station' as const },
  courseSteps: [{ id: 'meal', category: 'restaurant', label: '저녁' }, { id: 'cafe', category: 'cafe', label: '카페' }],
};

const candidate = (candidateId: string, normalized: NormalizedPlace['category']['normalized'], providerPlaceId: string, provider: 'naver' | 'kakao' = 'naver') => ({
  candidateId,
  distanceFromSearchCenterMeters: 100,
  popularityBonus: 0,
  place: {
    identity: { provider, providerPlaceId }, name: candidateId,
    category: { normalized }, address: { display: '서울 성동구', road: '서울 성동구 연무장길 1' },
    coordinates: { latitude: 37.5444, longitude: 127.0557 }, mapUrl: providerPlaceId,
    evidence: { provider, searchTerms: ['성수역'] },
  },
});

describe('provider-neutral course assembly', () => {
  it('allows meal venues in a drinks step while rejecting unrelated categories', () => {
    expect(providerNeutralPlaceMatchesStepCategory({
      ...candidate('meal-bar', 'meal', 'meal-bar'),
    }.place, 'drinks')).toBe(true);
    expect(providerNeutralPlaceMatchesStepCategory({
      ...candidate('cafe', 'cafe', 'cafe'),
    }.place, 'drinks')).toBe(false);
  });

  it('rejects a candidate owned by another step', () => {
    expect(() => buildProviderNeutralCourse({
      request,
      pools: [{
        stepId: 'meal', sufficient: true,
        candidates: [candidate('n-meal', 'meal', 'meal-place')],
        selectableCandidates: [candidate('n-meal', 'meal', 'meal-place')],
      }, {
        stepId: 'cafe', sufficient: true,
        candidates: [candidate('n-cafe', 'cafe', 'cafe-place')],
        selectableCandidates: [candidate('n-cafe', 'cafe', 'cafe-place')],
      }],
      selection: { steps: [{ stepId: 'meal', candidateId: 'n-cafe' }, { stepId: 'cafe', candidateId: 'n-meal' }] },
      generatedAt: '2026-08-18T00:00:00.000Z',
    } as never)).toThrow('COURSE_VALIDATION_FAILED');
  });

  it('returns a Naver identity without a Kakao compatibility ID', () => {
    const built = buildProviderNeutralCourse({
      request,
      candidates: [candidate('n-meal', 'meal', 'https://map.naver.com/p/meal'), candidate('n-cafe', 'cafe', 'https://map.naver.com/p/cafe')],
      selection: { steps: [{ stepId: 'meal', candidateId: 'n-meal' }, { stepId: 'cafe', candidateId: 'n-cafe' }] },
      generatedAt: '2026-08-18T00:00:00.000Z',
    });

    expect(built.course.steps[0]).toMatchObject({ placeIdentity: { provider: 'naver', providerPlaceId: 'https://map.naver.com/p/meal' } });
    expect(built.course.steps[0]).not.toHaveProperty('kakaoPlaceId');
    expect(built.cards[0].steps?.[0]).toMatchObject({ placeIdentity: { provider: 'naver', providerPlaceId: 'https://map.naver.com/p/meal' } });
  });

  it('accepts explicit provider-search intent evidence at final course validation', () => {
    const intentRequest = {
      ...request,
      resolvedStepIntents: [{
        stepId: 'meal', stepCategory: 'meal', intentType: 'dish' as const,
        canonicalTerm: '삼겹살', kakaoSearchTerms: ['삼겹살'], strength: 'required' as const,
        displayLabel: { ko: '삼겹살', en: 'Samgyeopsal' },
      }],
    };
    const naverMeal = candidate('n-meal-pork', 'meal', 'n-meal-pork');
    naverMeal.place.name = '낙성대우리한우소곱창';
    naverMeal.place.evidence.searchTerms = ['성수역 삼겹살'];

    expect(() => buildProviderNeutralCourse({
      request: intentRequest,
      candidates: [naverMeal, candidate('n-cafe', 'cafe', 'n-cafe')],
      selection: { steps: [{ stepId: 'meal', candidateId: 'n-meal-pork' }, { stepId: 'cafe', candidateId: 'n-cafe' }] },
      generatedAt: '2026-08-18T00:00:00.000Z',
    })).not.toThrow();
  });

  it('allows an unknown-category place to fill a meal step', () => {
    const built = buildProviderNeutralCourse({
      request,
      candidates: [
        candidate('n-unknown', 'unknown', 'https://map.naver.com/p/unknown'),
        candidate('n-cafe', 'cafe', 'https://map.naver.com/p/cafe'),
      ],
      selection: { steps: [
        { stepId: 'meal', candidateId: 'n-unknown' },
        { stepId: 'cafe', candidateId: 'n-cafe' },
      ] },
      generatedAt: '2026-08-18T00:00:00.000Z',
    });

    expect(built.course.steps.map((step) => step.candidateId)).toEqual(['n-unknown', 'n-cafe']);
  });

  it('preserves provider-neutral locks and requires an explicit replacement identity', () => {
    const replacementRequest = {
      ...request,
      requestId: 'req-replacement',
      sessionId: 'session-1',
      replacement: { stepId: 'meal', kakaoPlaceId: 'picked-kakao' },
      lockedSteps: [{
        stepId: 'cafe', candidateId: 'n-cafe',
        placeIdentity: { provider: 'naver' as const, providerPlaceId: 'n-cafe' },
        name: '고정 카페', address: '서울', roadAddress: '서울', mapUrl: '',
        latitude: 37.5444, longitude: 127.0557, locked: true,
      }],
    };
    const picked = {
      ...candidate('picked', 'meal', 'picked-kakao'),
      place: {
        ...candidate('picked', 'meal', 'picked-kakao').place,
        identity: { provider: 'kakao' as const, providerPlaceId: 'picked-kakao' },
        legacy: { kakaoPlaceId: 'picked-kakao' },
      } as NormalizedPlace,
    };
    const generic = candidate('generic', 'meal', 'generic-meal');
    const locked = candidate('n-cafe', 'unknown', 'n-cafe');
    locked.place = {
      ...locked.place,
      identity: { provider: 'naver' as const, providerPlaceId: 'n-cafe' },
    };
    const pools = [
      { stepId: 'meal', sufficient: true, candidates: [{ ...picked, sourceStepId: 'meal' }, { ...generic, sourceStepId: 'meal' }], selectableCandidates: [{ ...picked, sourceStepId: 'meal' }, { ...generic, sourceStepId: 'meal' }] },
      { stepId: 'cafe', sufficient: true, candidates: [{ ...locked, sourceStepId: 'cafe' }], selectableCandidates: [{ ...locked, sourceStepId: 'cafe' }] },
    ];

    expect(() => buildProviderNeutralCourse({
      request: replacementRequest as never,
      pools,
      selection: { steps: [{ stepId: 'meal', candidateId: 'generic' }, { stepId: 'cafe', candidateId: 'n-cafe' }] },
      generatedAt: '2026-08-18T00:00:00.000Z',
    })).toThrow('COURSE_VALIDATION_FAILED');

    const built = buildProviderNeutralCourse({
      request: replacementRequest as never,
      pools,
      selection: { steps: [{ stepId: 'meal', candidateId: 'picked' }, { stepId: 'cafe', candidateId: 'n-cafe' }] },
      generatedAt: '2026-08-18T00:00:00.000Z',
    });
    expect(built.course.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepId: 'cafe', locked: true, placeIdentity: { provider: 'naver', providerPlaceId: 'n-cafe' } }),
    ]));
  });

  it('rejects the same physical place selected through different provider identities', () => {
    const duplicateRequest = {
      ...request,
      courseSteps: [
        { id: 'meal-1', category: 'meal', label: '식사 1' },
        { id: 'meal-2', category: 'meal', label: '식사 2' },
      ],
    };
    const kakao = {
      ...candidate('kakao-meal', 'meal', 'kakao-meal'),
      place: {
        ...candidate('kakao-meal', 'meal', 'kakao-meal').place,
        identity: { provider: 'kakao' as const, providerPlaceId: 'kakao-meal' },
        name: 'naver-meal',
        legacy: { kakaoPlaceId: 'kakao-meal' },
      },
    };

    expect(() => buildProviderNeutralCourse({
      request: duplicateRequest,
      candidates: [candidate('naver-meal', 'meal', 'naver-meal'), kakao],
      selection: { steps: [
        { stepId: 'meal-1', candidateId: 'naver-meal' },
        { stepId: 'meal-2', candidateId: 'kakao-meal' },
      ] },
      generatedAt: '2026-08-18T00:00:00.000Z',
    })).toThrow('COURSE_VALIDATION_FAILED');
  });
});
