import { buildProviderNeutralCourse } from '../supabase/functions/_shared/provider-neutral-course-selection';

const request = {
  requestId: 'req-1', mode: 'course' as const, language: 'ko' as const,
  location: { source: 'current' as const, label: '성수역', latitude: 37.5444, longitude: 127.0557, kind: 'station' as const },
  courseSteps: [{ id: 'meal', category: 'restaurant', label: '저녁' }, { id: 'cafe', category: 'cafe', label: '카페' }],
};

const candidate = (candidateId: string, normalized: 'meal' | 'cafe', providerPlaceId: string) => ({
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
});
