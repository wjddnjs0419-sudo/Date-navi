import type { NormalizedPlace } from './place-provider.ts';

export type NaverSearchCache = {
  get: (query: string) => NormalizedPlace[] | undefined;
  put: (query: string, places: NormalizedPlace[]) => void;
};

/**
 * Edge-isolate-local cache only. It is intentionally not a database cache:
 * Naver Search responses are neither permanently retained nor shared as an
 * entity store. An isolate recycle simply produces a cache miss.
 */
export function createNaverSearchCache(input: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}): NaverSearchCache {
  const ttlMs = input.ttlMs ?? 5 * 60 * 1000;
  const maxEntries = input.maxEntries ?? 40;
  const now = input.now ?? Date.now;
  const entries = new Map<string, { expiresAt: number; places: NormalizedPlace[] }>();
  const key = (query: string) => query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return {
    get(query) {
      const cacheKey = key(query);
      const entry = entries.get(cacheKey);
      if (!entry || entry.expiresAt <= now()) {
        entries.delete(cacheKey);
        return undefined;
      }
      entries.delete(cacheKey);
      entries.set(cacheKey, entry);
      return entry.places;
    },
    put(query, places) {
      const cacheKey = key(query);
      entries.delete(cacheKey);
      entries.set(cacheKey, { expiresAt: now() + ttlMs, places });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    },
  };
}
