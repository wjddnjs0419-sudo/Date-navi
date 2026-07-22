import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENT_PLACE_SEARCHES_KEY = 'datenavi.recentPlaceSearches';
export const RECENT_PLACE_SEARCHES_LIMIT = 5;

export async function loadRecentPlaceSearches(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(RECENT_PLACE_SEARCHES_KEY);
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

export async function saveRecentPlaceSearch(term: string): Promise<string[]> {
  const trimmed = term.trim();
  if (!trimmed) return loadRecentPlaceSearches();
  const recent = await loadRecentPlaceSearches();
  const next = [trimmed, ...recent.filter((item) => item !== trimmed)]
    .slice(0, RECENT_PLACE_SEARCHES_LIMIT);
  await AsyncStorage.setItem(RECENT_PLACE_SEARCHES_KEY, JSON.stringify(next));
  return next;
}
