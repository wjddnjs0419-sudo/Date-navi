import { buildProviderNeutralCourse } from '../supabase/functions/_shared/provider-neutral-course-selection';
import type { NormalizedPlace } from '../supabase/functions/_shared/place-provider';

const request = {
  requestId: 'req-1', mode: 'course' as const, language: 'ko' as const,
  location: { source: 'current' as const, label: '성수역', latitude: 37.5444, longitude: 127.0557, kind: 'station' as const },
  courseSteps: [{ id: 'meal', category: 'restaurant', label: '저녁' }, { id: 'cafe', category: 'cafe', label: '카페' }],
};

const candidate = (candidateId: string, normalized: NormalizedPlace['category']['normalized'], providerPlaceId: string) => ({
  candidateId,
  distanceFromSearchCenterMeters: 100,
  popularityBonus: 0,
  place: {
    identity: { provider: 'naver' as const, providerPlaceId }, name: candidateId,
    category: { normalized }, address: { display: '서울 성동구', road: '서울 성동구 연무장길 1' },
    coordinates: { latitude: 37.5444, longitude: 127.0557 }, mapUrl: providerPlaceId,
    evidence: { provider: 'naver' as const, searchTerms: ['성수역'] },
  },
});

describe('provider-neutral course assembly', () => {
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
