import { discoverQualifiedPlaces } from '../supabase/functions/_shared/recommendation-discovery';
import type { NormalizedPlace } from '../supabase/functions/_shared/place-provider';

const place = (id: string): NormalizedPlace => ({
  identity: { provider: 'naver', providerPlaceId: id }, name: id,
  category: { normalized: 'cafe' }, evidence: { provider: 'naver', searchTerms: ['카페'] },
});

describe('discoverQualifiedPlaces', () => {
  it('runs fallback only after primary qualified candidates are insufficient and qualifies every attempt', async () => {
    const primary = jest.fn(async () => [place('primary-rejected')]);
    const fallbackPlace = { ...place('fallback-pass'), identity: { provider: 'kakao' as const, providerPlaceId: 'fallback-pass' }, evidence: { provider: 'kakao' as const, searchTerms: ['CE7'] } };
    const fallback = jest.fn(async () => [fallbackPlace]);
    const qualify = jest.fn((candidate: NormalizedPlace) => candidate.identity.providerPlaceId === 'fallback-pass');

    const result = await discoverQualifiedPlaces({
      primaryAttempts: [primary],
      fallbackAttempts: [fallback],
      qualify,
      minQualifiedCandidates: 1,
    });

    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
    // Primary candidates are evaluated again with the fallback pool so every
    // attempt flows through the same full request-scoped gate.
    expect(qualify).toHaveBeenCalledTimes(3);
    expect(result.places.map((candidate) => candidate.identity.providerPlaceId)).toEqual(['fallback-pass']);
    expect(result.fewerResults).toBe(false);
  });

  it('re-runs request-scoped dedupe and qualification over the full discovery pool after every expansion', async () => {
    const naver = jest.fn(async () => [place('shared')]);
    const kakaoDuplicate = {
      ...place('kakao-shared'),
      identity: { provider: 'kakao' as const, providerPlaceId: 'kakao-shared' },
      name: 'shared',
      address: { display: '서울 성동구 연무장길 1', road: '서울 성동구 연무장길 1' },
      coordinates: { latitude: 37.5444, longitude: 127.0557 },
      evidence: { provider: 'kakao' as const, searchTerms: ['카페'] },
    };
    const naverShared = {
      ...place('shared'),
      address: { display: '서울 성동구 연무장길 1', road: '서울 성동구 연무장길 1' },
      coordinates: { latitude: 37.5444, longitude: 127.0557 },
    };
    naver.mockResolvedValueOnce([naverShared]);
    const kakao = jest.fn(async () => [kakaoDuplicate, place('fallback-pass')]);
    const qualify = jest.fn(() => true);

    const result = await discoverQualifiedPlaces({
      primaryAttempts: [naver],
      fallbackAttempts: [kakao],
      qualify,
      minQualifiedCandidates: 2,
    });

    expect(kakao).toHaveBeenCalledTimes(1);
    expect(qualify).toHaveBeenCalledTimes(3);
    expect(result.places.map((candidate) => candidate.identity.providerPlaceId)).toEqual(['shared', 'fallback-pass']);
  });

  it('does not call Kakao when the initial Naver attempt already has enough qualified places', async () => {
    const naver = jest.fn(async () => [place('naver-1'), place('naver-2')]);
    const kakao = jest.fn(async () => [place('kakao-should-not-run')]);

    const result = await discoverQualifiedPlaces({
      primaryAttempts: [naver],
      fallbackAttempts: [kakao],
      qualify: () => true,
      minQualifiedCandidates: 2,
    });

    expect(naver).toHaveBeenCalledTimes(1);
    expect(kakao).not.toHaveBeenCalled();
    expect(result.fallbackUsed).toBe(false);
    expect(result.places.map((candidate) => candidate.identity.providerPlaceId)).toEqual(['naver-1', 'naver-2']);
  });

  it('runs all Naver query and radius expansions before the Kakao fallback', async () => {
    const calls: string[] = [];
    const attempt = (name: string) => async () => {
      calls.push(name);
      return [place(name)];
    };

    await discoverQualifiedPlaces({
      primaryAttempts: [attempt('naver-base'), attempt('naver-query-expanded'), attempt('naver-radius-expanded')],
      fallbackAttempts: [attempt('kakao-fallback')],
      qualify: () => false,
      minQualifiedCandidates: 1,
    });

    expect(calls).toEqual(['naver-base', 'naver-query-expanded', 'naver-radius-expanded', 'kakao-fallback']);
  });
});
