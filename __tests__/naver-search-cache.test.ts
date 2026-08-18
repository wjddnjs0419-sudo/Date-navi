import { createNaverSearchCache } from '../supabase/functions/_shared/naver-search-cache';
import type { NormalizedPlace } from '../supabase/functions/_shared/place-provider';

const places: NormalizedPlace[] = [{
  identity: { provider: 'naver', providerPlaceId: 'n1' }, name: '장소', category: { normalized: 'cafe' },
  evidence: { provider: 'naver', searchTerms: ['성수 카페'] },
}];

describe('Naver edge-local search cache', () => {
  it('normalizes query keys and expires entries without persistence', () => {
    let current = 100;
    const cache = createNaverSearchCache({ ttlMs: 10, now: () => current });
    cache.put(' 성수  카페 ', places);
    expect(cache.get('성수  카페')).toEqual(places);
    current = 111;
    expect(cache.get('성수 카페')).toBeUndefined();
  });
});
