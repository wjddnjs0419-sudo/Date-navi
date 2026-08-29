import { buildProviderNeutralRecommendationPrompt } from '../supabase/functions/_shared/recommendation-prompt';

describe('provider-neutral recommendation prompt', () => {
  it('groups candidates by their owning step', () => {
    const prompt = buildProviderNeutralRecommendationPrompt({
      requestId: 'req', mode: 'course', language: 'ko',
      location: { source: 'current', label: '성수역', latitude: 37.5, longitude: 127, kind: 'station' },
      courseSteps: [{ id: 'meal', category: 'meal', label: '식사' }, { id: 'cafe', category: 'cafe', label: '카페' }],
    }, [{
      stepId: 'meal', sufficient: true,
      candidates: [{ candidateId: 'meal-1', sourceStepId: 'meal', place: { identity: { provider: 'naver', providerPlaceId: 'meal-place' }, name: '식당', category: { normalized: 'meal' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
      selectableCandidates: [{ candidateId: 'meal-1', sourceStepId: 'meal', place: { identity: { provider: 'naver', providerPlaceId: 'meal-place' }, name: '식당', category: { normalized: 'meal' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
    }, {
      stepId: 'cafe', sufficient: true,
      candidates: [{ candidateId: 'cafe-1', sourceStepId: 'cafe', place: { identity: { provider: 'naver', providerPlaceId: 'cafe-place' }, name: '카페', category: { normalized: 'cafe' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
      selectableCandidates: [{ candidateId: 'cafe-1', sourceStepId: 'cafe', place: { identity: { provider: 'naver', providerPlaceId: 'cafe-place' }, name: '카페', category: { normalized: 'cafe' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
    }] as never);

    expect(prompt).toContain('stepCandidateGroups');
    expect(prompt).toContain('meal-1');
    expect(prompt).toContain('cafe-1');
  });

  it('exposes provider identity without calling a Naver key a Kakao place ID', () => {
    const prompt = buildProviderNeutralRecommendationPrompt({
      requestId: 'req', mode: 'course', language: 'ko',
      location: { source: 'current', label: '성수역', latitude: 37.5, longitude: 127, kind: 'station' },
      courseSteps: [{ id: 'meal', category: 'restaurant', label: '저녁' }, { id: 'cafe', category: 'cafe', label: '카페' }],
    }, [{
      candidateId: 'n1', distanceFromSearchCenterMeters: 100, popularityBonus: 1,
      place: { identity: { provider: 'naver', providerPlaceId: 'https://map.naver.com/p/1' }, name: '식당', category: { normalized: 'meal' }, evidence: { provider: 'naver', searchTerms: ['성수역 저녁'] } },
    }]);

    expect(prompt).toContain('"placeIdentity"');
    expect(prompt).toContain('https://map.naver.com/p/1');
    expect(prompt).not.toContain('kakaoPlaceId');
  });

  it('passes soft step attributes as preferences instead of required matching IDs', () => {
    const prompt = buildProviderNeutralRecommendationPrompt({
      requestId: 'req', mode: 'course', language: 'ko',
      location: { source: 'current', label: '홍대입구', latitude: 37.5, longitude: 126.9, kind: 'station' },
      courseSteps: [{ id: 'cafe', category: 'cafe', label: '카페' }, { id: 'meal', category: 'meal', label: '식사' }],
      resolvedStepIntents: [{
        stepId: 'cafe', stepCategory: 'cafe', intentType: 'venue_subtype', canonicalTerm: '조용한',
        kakaoSearchTerms: ['조용한', '조용한 카페'], strength: 'preferred', displayLabel: { ko: '조용한', en: 'Quiet' },
      }],
    } as never, [{
      stepId: 'cafe', sufficient: true,
      candidates: [{ candidateId: 'quiet-cafe', sourceStepId: 'cafe', place: { identity: { provider: 'naver', providerPlaceId: 'quiet-cafe-place' }, name: '연남 카페', category: { normalized: 'cafe' }, evidence: { provider: 'naver', searchTerms: ['홍대입구 조용한 카페'] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
      selectableCandidates: [{ candidateId: 'quiet-cafe', sourceStepId: 'cafe', place: { identity: { provider: 'naver', providerPlaceId: 'quiet-cafe-place' }, name: '연남 카페', category: { normalized: 'cafe' }, evidence: { provider: 'naver', searchTerms: ['홍대입구 조용한 카페'] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
    }, {
      stepId: 'meal', sufficient: true,
      candidates: [{ candidateId: 'meal', sourceStepId: 'meal', place: { identity: { provider: 'naver', providerPlaceId: 'meal-place' }, name: '식당', category: { normalized: 'meal' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
      selectableCandidates: [{ candidateId: 'meal', sourceStepId: 'meal', place: { identity: { provider: 'naver', providerPlaceId: 'meal-place' }, name: '식당', category: { normalized: 'meal' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
    }] as never);

    expect(prompt).toContain('Preferred step attributes (ranking hints):');
    expect(prompt).toContain('"canonicalTerm": "조용한"');
    const requiredSection = prompt.slice(prompt.indexOf('Required step keywords (authoritative):'), prompt.indexOf('Preferred step attributes (ranking hints):'));
    expect(requiredSection).not.toContain('조용한');
    expect(prompt).toContain('quiet-cafe');
  });

  it('includes explicit provider-search evidence in required matching IDs', () => {
    const prompt = buildProviderNeutralRecommendationPrompt({
      requestId: 'req', mode: 'course', language: 'ko',
      location: { source: 'kakao', label: '성수역', latitude: 37.5, longitude: 127, kind: 'station' },
      courseSteps: [{ id: 'meal', category: 'meal', label: '식사' }, { id: 'cafe', category: 'cafe', label: '카페' }],
      resolvedStepIntents: [{
        stepId: 'meal', stepCategory: 'meal', intentType: 'dish', canonicalTerm: '삼겹살',
        kakaoSearchTerms: ['삼겹살'], strength: 'required', displayLabel: { ko: '삼겹살', en: 'Samgyeopsal' },
      }],
    } as never, [{
      stepId: 'meal', sufficient: true,
      candidates: [{ candidateId: 'search-meal', sourceStepId: 'meal', place: { identity: { provider: 'naver', providerPlaceId: 'search-meal' }, name: '성수 식당', category: { normalized: 'meal' }, evidence: { provider: 'naver', searchTerms: ['성수역 삼겹살'] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
      selectableCandidates: [{ candidateId: 'search-meal', sourceStepId: 'meal', place: { identity: { provider: 'naver', providerPlaceId: 'search-meal' }, name: '성수 식당', category: { normalized: 'meal' }, evidence: { provider: 'naver', searchTerms: ['성수역 삼겹살'] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
    }, {
      stepId: 'cafe', sufficient: true,
      candidates: [{ candidateId: 'cafe', sourceStepId: 'cafe', place: { identity: { provider: 'naver', providerPlaceId: 'cafe' }, name: '성수 카페', category: { normalized: 'cafe' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
      selectableCandidates: [{ candidateId: 'cafe', sourceStepId: 'cafe', place: { identity: { provider: 'naver', providerPlaceId: 'cafe' }, name: '성수 카페', category: { normalized: 'cafe' }, evidence: { provider: 'naver', searchTerms: [] } }, distanceFromSearchCenterMeters: 100, popularityBonus: 0 }],
    }] as never);

    const requiredSection = prompt.slice(prompt.indexOf('Required step keywords (authoritative):'), prompt.indexOf('Preferred step attributes (ranking hints):'));
    expect(requiredSection).toContain('search-meal');
    expect(prompt).toContain('search relevance evidence, not proof');
  });
});
