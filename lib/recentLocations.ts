import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecommendationLocation } from '../shared/recommendation/contracts';
import { recommendationLocationSchema } from '../shared/recommendation/schemas';

export const RECENT_LOCATIONS_KEY = 'datenavi.recentLocations';
export const RECENT_LOCATIONS_KEY_PREFIX = `${RECENT_LOCATIONS_KEY}:`;
export const RECENT_LOCATIONS_LIMIT = 5;

export function recentLocationsKey(userId: string): string {
  return `${RECENT_LOCATIONS_KEY_PREFIX}${userId.trim()}`;
}

export function isSameRecommendationLocation(
  left: RecommendationLocation | null,
  right: RecommendationLocation | null,
): boolean {
  if (!left || !right || left.source !== right.source) return false;
  if (left.kakaoPlaceId && right.kakaoPlaceId) {
    return left.kakaoPlaceId === right.kakaoPlaceId;
  }
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

export async function loadRecentLocations(userId: string | null): Promise<RecommendationLocation[]> {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return [];
  try {
    const stored = await AsyncStorage.getItem(recentLocationsKey(normalizedUserId));
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => recommendationLocationSchema.safeParse(value))
      .filter((result) => result.success)
      .map((result) => result.data)
      // "내 위치"는 캐시된 좌표 재사용(권한 거부 우회)을 막기 위해 최근 목록에서 제외한다.
      // 현재 위치는 항상 GPS 버튼(권한 확인 경로)으로만 잡는다.
      .filter((location) => location.source !== 'current')
      .slice(0, RECENT_LOCATIONS_LIMIT);
  } catch {
    return [];
  }
}

export async function saveRecentLocation(
  userId: string | null,
  location: RecommendationLocation,
): Promise<RecommendationLocation[]> {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return [];
  const valid = recommendationLocationSchema.parse(location);
  // "내 위치"는 저장하지 않는다(위 loadRecentLocations 주석 참조). 현재 목록만 돌려준다.
  if (valid.source === 'current') {
    return loadRecentLocations(normalizedUserId);
  }
  const recent = await loadRecentLocations(normalizedUserId);
  const key = locationKey(valid);
  const next = [valid, ...recent.filter((item) => locationKey(item) !== key)]
    .slice(0, RECENT_LOCATIONS_LIMIT);
  await AsyncStorage.setItem(recentLocationsKey(normalizedUserId), JSON.stringify(next));
  return next;
}

function locationKey(location: RecommendationLocation): string {
  if (location.source === 'current') return 'current';
  return location.kakaoPlaceId
    ? `kakao:${location.kakaoPlaceId}`
    : `coords:${location.latitude}:${location.longitude}`;
}
