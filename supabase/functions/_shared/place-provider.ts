import type { EvidencedKakaoPlace } from './recommendation-search.ts';

export type PlaceProvider = 'kakao' | 'naver';

export type ProviderPlaceIdentity = {
  provider: PlaceProvider;
  providerPlaceId: string;
};

export type NormalizedPlaceCategory = 'meal' | 'cafe' | 'drinks' | 'culture' | 'walk' | 'activity' | 'unknown';

export type NormalizedPlace = {
  identity: ProviderPlaceIdentity;
  name: string;
  category: {
    providerRaw?: string;
    normalized: NormalizedPlaceCategory;
    specificity?: 'broad' | 'specific';
  };
  address?: { display: string; road?: string };
  coordinates?: { latitude: number; longitude: number };
  mapUrl?: string;
  evidence: {
    provider: PlaceProvider;
    searchTerms: string[];
  };
  legacy?: { kakaoPlaceId?: string };
};

function normalizedCategory(place: EvidencedKakaoPlace): NormalizedPlaceCategory {
  switch (place.categoryGroupCode) {
    case 'FD6': return 'meal';
    case 'CE7': return 'cafe';
    case 'CT1': return 'culture';
    case 'AT4': return 'walk';
    default: return 'unknown';
  }
}

export function normalizeKakaoPlace(place: EvidencedKakaoPlace): NormalizedPlace {
  return {
    identity: { provider: 'kakao', providerPlaceId: place.kakaoPlaceId },
    name: place.name,
    category: {
      providerRaw: place.categoryName,
      normalized: normalizedCategory(place),
      specificity: place.categoryName.includes(' > ') ? 'specific' : 'broad',
    },
    address: {
      display: place.address,
      ...(place.roadAddress ? { road: place.roadAddress } : {}),
    },
    coordinates: { latitude: place.latitude, longitude: place.longitude },
    ...(place.mapUrl ? { mapUrl: place.mapUrl } : {}),
    evidence: {
      provider: 'kakao',
      searchTerms: place.matchedSearchEvidence.flatMap((evidence) => (
        evidence.categoryCode ? [evidence.categoryCode] : evidence.queryText ? [evidence.queryText] : []
      )),
    },
    legacy: { kakaoPlaceId: place.kakaoPlaceId },
  };
}
