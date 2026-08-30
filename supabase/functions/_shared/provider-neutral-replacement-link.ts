import type { NormalizedPlace } from './place-provider.ts';
import {
  resolveKakaoPlaceLinkDetailed,
  type KakaoPlaceLinkSearchResult,
} from './kakao-place-link.ts';

export type ProviderNeutralReplacementKakaoLink = {
  kakaoPlaceId: string;
  mapUrl: string;
};

/**
 * Replacement-only adapter for the same Naver-to-Kakao matcher used by the
 * initial recommendation flow. The search callback stays injectable so the
 * Edge Function can share one bounded query cache for the whole list request.
 */
export async function resolveProviderNeutralReplacementKakaoLink(
  place: NormalizedPlace,
  searchKakao: (query: string) => Promise<NormalizedPlace[] | KakaoPlaceLinkSearchResult>,
): Promise<ProviderNeutralReplacementKakaoLink | undefined> {
  return (await resolveKakaoPlaceLinkDetailed(place, searchKakao)).link;
}
