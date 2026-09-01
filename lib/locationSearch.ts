import type { RecommendationLocation } from '../shared/recommendation/contracts';
import {
  LOCATION_SUGGESTION_LIMIT,
  MIN_LOCATION_QUERY_LENGTH,
  shouldSearchLocations as shouldSearchProviderLocations,
  toRecommendationLocations,
  type KakaoLocationDocument,
} from '../shared/recommendation/location-autocomplete';
import { supabase } from './supabase';

export const LOCATION_SEARCH_DEBOUNCE_MS = 300;
export { LOCATION_SUGGESTION_LIMIT, MIN_LOCATION_QUERY_LENGTH } from '../shared/recommendation/location-autocomplete';
export type { KakaoLocationDocument } from '../shared/recommendation/location-autocomplete';

export type LocationSearchInvoker = (
  functionName: string,
  options: { body: { query: string } },
) => Promise<{ data?: unknown; error?: unknown }>;

type LocationSearchResponse = { documents?: KakaoLocationDocument[] };

export function shouldSearchLocations(query: string): boolean {
  return shouldSearchProviderLocations(query);
}

export function rankLocationDocuments(
  query: string,
  documents: KakaoLocationDocument[],
): RecommendationLocation[] {
  return toRecommendationLocations(query, documents);
}

export async function searchLocations(
  query: string,
  invoke: LocationSearchInvoker = (functionName, options) => supabase.functions.invoke(functionName, options),
): Promise<RecommendationLocation[]> {
  const normalizedQuery = query.trim();
  if (!shouldSearchLocations(normalizedQuery)) return [];
  const { data, error } = await invoke('location-autocomplete', { body: { query: normalizedQuery } });
  if (error) throw error;
  const documents = (data as LocationSearchResponse | undefined)?.documents;
  return rankLocationDocuments(normalizedQuery, Array.isArray(documents) ? documents : []);
}

export function createLatestLocationSearch(
  searcher: (query: string) => Promise<RecommendationLocation[]>,
) {
  let token = 0;
  return {
    async search(query: string): Promise<RecommendationLocation[] | null> {
      const requestToken = ++token;
      try {
        const result = await searcher(query);
        return requestToken === token ? result : null;
      } catch (error) {
        if (requestToken !== token) return null;
        throw error;
      }
    },
    cancel() { token += 1; },
  };
}
