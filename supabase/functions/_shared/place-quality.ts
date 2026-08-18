import type { NormalizedPlace } from './place-provider.ts';

export type DateQualityContext = 'default' | 'romantic_cafe' | 'study_cafe';
export type PopularityEligibility = 'not_available' | 'weak' | 'sufficient' | 'strong';
export type QualityRejectionReason = 'generic_venue_without_minimum_quality_evidence';

export type QualityAssessment = {
  passed: boolean;
  confidence: 'insufficient' | 'minimum' | 'strong';
  rejectionReasons: QualityRejectionReason[];
  popularityEligibility: PopularityEligibility;
};

export type HardEligibilityAssessment = {
  passed: boolean;
  rejectionReasons: Array<'missing_coordinates' | 'unknown_category' | 'excluded_place' | 'excluded_category' | 'unsuitable_venue'>;
};

const UNSUITABLE_VENUE_KEYWORDS = ['병원', '의원', '약국', '모텔', '무인텔', '주차장', '은행', '부동산', '편의점'];

export function evaluateHardEligibility(place: NormalizedPlace, input: {
  excludedPlaceIds?: readonly string[];
  excludedCategories?: readonly string[];
}): HardEligibilityAssessment {
  const rejected: HardEligibilityAssessment['rejectionReasons'] = [];
  const excludedPlaceIds = new Set(input.excludedPlaceIds ?? []);
  const excludedCategories = input.excludedCategories ?? [];
  if (!place.coordinates) rejected.push('missing_coordinates');
  if (place.category.normalized === 'unknown') rejected.push('unknown_category');
  if (excludedPlaceIds.has(place.identity.providerPlaceId) || (place.legacy?.kakaoPlaceId && excludedPlaceIds.has(place.legacy.kakaoPlaceId))) {
    rejected.push('excluded_place');
  }
  const categoryText = `${place.category.normalized} ${place.category.providerRaw ?? ''}`.normalize('NFKC').toLocaleLowerCase();
  if (excludedCategories.some((category) => categoryText.includes(category.normalize('NFKC').toLocaleLowerCase()))) {
    rejected.push('excluded_category');
  }
  const venueText = `${place.name} ${place.category.providerRaw ?? ''}`.normalize('NFKC');
  if (UNSUITABLE_VENUE_KEYWORDS.some((keyword) => venueText.includes(keyword))) rejected.push('unsuitable_venue');
  return { passed: rejected.length === 0, rejectionReasons: rejected };
}

const GENERIC_CAFE_CHAIN_NAMES = ['스타벅스', '컴포즈커피', '메가커피', '공차'];

function isGenericCafeChain(place: NormalizedPlace): boolean {
  return place.category.normalized === 'cafe'
    && GENERIC_CAFE_CHAIN_NAMES.some((brand) => place.name.normalize('NFKC').includes(brand));
}

export function evaluateQualityGate(
  place: NormalizedPlace,
  input: { dateContext: DateQualityContext; popularityEligibility: PopularityEligibility },
): QualityAssessment {
  if (input.dateContext === 'romantic_cafe'
    && isGenericCafeChain(place)
    && (input.popularityEligibility === 'not_available' || input.popularityEligibility === 'weak')) {
    return {
      passed: false,
      confidence: 'insufficient',
      rejectionReasons: ['generic_venue_without_minimum_quality_evidence'],
      popularityEligibility: input.popularityEligibility,
    };
  }
  return {
    passed: true,
    confidence: input.popularityEligibility === 'strong' ? 'strong' : 'minimum',
    rejectionReasons: [],
    popularityEligibility: input.popularityEligibility,
  };
}
