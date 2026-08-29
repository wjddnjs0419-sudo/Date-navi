import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENT_PLACE_SEARCHES_KEY = 'datenavi.recentPlaceSearches';
export const RECENT_PLACE_SEARCHES_KEY_PREFIX = `${RECENT_PLACE_SEARCHES_KEY}:`;
export const RECENT_PLACE_SEARCHES_LIMIT = 5;

export function recentPlaceSearchesKey(userId: string): string {
  return `${RECENT_PLACE_SEARCHES_KEY_PREFIX}${userId.trim()}`;
}

export async function loadRecentPlaceSearches(userId: string | null): Promise<string[]> {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return [];
  try {
    const stored = await AsyncStorage.getItem(recentPlaceSearchesKey(normalizedUserId));
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .slice(0, RECENT_PLACE_SEARCHES_LIMIT);
  } catch {
    return [];
  }
}

export async function saveRecentPlaceSearch(userId: string | null, term: string): Promise<string[]> {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return [];
  const trimmed = term.trim();
  if (!trimmed) return loadRecentPlaceSearches(normalizedUserId);
  const recent = await loadRecentPlaceSearches(normalizedUserId);
  const next = [trimmed, ...recent.filter((item) => item !== trimmed)]
    .slice(0, RECENT_PLACE_SEARCHES_LIMIT);
  await AsyncStorage.setItem(recentPlaceSearchesKey(normalizedUserId), JSON.stringify(next));
  return next;
}
