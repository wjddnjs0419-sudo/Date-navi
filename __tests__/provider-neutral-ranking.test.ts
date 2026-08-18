import { rankQualifiedPlaces } from '../supabase/functions/_shared/provider-neutral-ranking';
import type { NormalizedPlace } from '../supabase/functions/_shared/place-provider';
import type { QualityAssessment } from '../supabase/functions/_shared/place-quality';

const qualityPass: QualityAssessment = {
  passed: true,
  confidence: 'minimum',
  rejectionReasons: [],
  popularityEligibility: 'sufficient',
};

const place = (providerPlaceId: string, distanceFromSearchCenterMeters: number): NormalizedPlace => ({
  identity: { provider: 'naver', providerPlaceId },
  name: `개인 카페 ${providerPlaceId}`,
  category: { normalized: 'cafe', specificity: 'specific' },
  coordinates: { latitude: 37.544, longitude: 127.055 },
  evidence: { provider: 'naver', searchTerms: ['성수 카페'] },
});

describe('rankQualifiedPlaces', () => {
  it('ranks only Quality Gate passes and uses distance only as a relative preference', () => {
    const result = rankQualifiedPlaces([
      { place: place('far', 800), quality: qualityPass, distanceFromSearchCenterMeters: 800, popularityBonus: 0 },
      { place: place('rejected', 100), quality: { ...qualityPass, passed: false, confidence: 'insufficient', rejectionReasons: ['generic_venue_without_minimum_quality_evidence'] }, distanceFromSearchCenterMeters: 100, popularityBonus: 20 },
      { place: place('near', 400), quality: qualityPass, distanceFromSearchCenterMeters: 400, popularityBonus: 0 },
    ]);

    expect(result.map((candidate) => candidate.place.identity.providerPlaceId)).toEqual(['near', 'far']);
    expect(result[0].scoreBreakdown).toEqual({ distance: 19, popularity: 0 });
  });
});
