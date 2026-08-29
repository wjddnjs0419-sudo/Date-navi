import { evaluateHardEligibility, evaluateQualityGate } from '../supabase/functions/_shared/place-quality';
import type { NormalizedPlace } from '../supabase/functions/_shared/place-provider';

const cafe = (overrides: Partial<NormalizedPlace> = {}): NormalizedPlace => ({
  identity: { provider: 'naver', providerPlaceId: 'naver-cafe' },
  name: '컴포즈커피 성수점',
  category: { normalized: 'cafe', providerRaw: '카페', specificity: 'specific' },
  address: { display: '서울 성동구 성수이로 1', road: '서울 성동구 성수이로 1' },
  coordinates: { latitude: 37.544, longitude: 127.055 },
  evidence: { provider: 'naver', searchTerms: ['성수 카페'] },
  ...overrides,
});

describe('evaluateQualityGate', () => {
  it('rejects a generic chain for a romantic cafe request without minimum popularity evidence', () => {
    expect(evaluateQualityGate(cafe(), {
      dateContext: 'romantic_cafe',
      popularityEligibility: 'not_available',
    })).toEqual({
      passed: false,
      confidence: 'insufficient',
      rejectionReasons: ['generic_venue_without_minimum_quality_evidence'],
      popularityEligibility: 'not_available',
    });
  });

  it('allows the same chain when the explicit study-cafe context permits it', () => {
    expect(evaluateQualityGate(cafe(), {
      dateContext: 'study_cafe',
      popularityEligibility: 'not_available',
    }).passed).toBe(true);
  });
});

describe('evaluateHardEligibility', () => {
  it('keeps an unknown provider category eligible when no other hard exclusion applies', () => {
    const unknown = cafe({ category: { normalized: 'unknown' } });

    expect(evaluateHardEligibility(unknown, {}).passed).toBe(true);
  });

  it('rejects unsuitable venue types and explicit exclusions before quality ranking', () => {
    const hospital = { ...cafe({ name: '병원 카페' }), category: { normalized: 'cafe' as const, providerRaw: '병원' } };
    expect(evaluateHardEligibility(hospital, {}).rejectionReasons).toContain('unsuitable_venue');
    expect(evaluateHardEligibility(cafe({ identity: { provider: 'naver', providerPlaceId: 'cafe-1' } }), { excludedPlaceIds: ['cafe-1'] }).passed).toBe(false);
    expect(evaluateHardEligibility(cafe({ name: '일반 카페' }), { excludedCategories: ['cafe'] }).passed).toBe(false);
  });
});
