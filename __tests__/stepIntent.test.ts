import type { RecommendationRequest } from '../shared/recommendation/schemas';
import type { LockedCourseStepInput } from '../shared/recommendation/contracts';
import { parseStepIntents, placeMatchesStepIntent, STEP_INTENT_PARSER_VERSION } from '../supabase/functions/_shared/step-intent';

const request = (additionalRequest?: string, steps: Array<{ id: string; category: string }> = [
  { id: 'step-1', category: 'meal' },
  { id: 'step-2', category: 'cafe' },
]): RecommendationRequest => ({
  requestId: 'request-intent',
  mode: 'course',
  language: 'ko',
  location: { source: 'kakao', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
  courseSteps: steps.map((step) => ({ ...step, label: step.category })),
  ...(additionalRequest ? { additionalRequest } : {}),
});

const lockedStep = (stepId: string): LockedCourseStepInput => ({
  stepId,
  candidateId: `candidate-${stepId}`,
  kakaoPlaceId: `place-${stepId}`,
  name: `Locked ${stepId}`,
  address: '', roadAddress: '', mapUrl: '',
  latitude: 37.5444, longitude: 127.0374,
  locked: true,
});

describe('parseStepIntents', () => {
  it('한국어 dish 요청을 meal step에 preferred로 바인딩한다', () => {
    const parsed = parseStepIntents(request('삼겹살 먹고 싶어'));
    expect(parsed.stepIntents).toEqual([{
      stepId: 'step-1',
      stepCategory: 'meal',
      intentType: 'dish',
      canonicalTerm: '삼겹살',
      kakaoSearchTerms: ['삼겹살', '돼지고기구이', '고기집'],
      strength: 'preferred',
      displayLabel: { ko: '삼겹살', en: 'Samgyeopsal' },
    }]);
    expect(parsed.parserVersion).toBe(STEP_INTENT_PARSER_VERSION);
  });

  it('영어 번역 표현을 canonical 한국어로 매핑한다', () => {
    const parsed = parseStepIntents(request('I want Korean pork belly.'));
    expect(parsed.stepIntents[0]?.canonicalTerm).toBe('삼겹살');
  });

  it('로마자 표기 변형(samgyupsal 등)을 alias로 흡수한다', () => {
    for (const text of ['samgyeopsal please', 'I want samgyupsal', 'samgyopsal!']) {
      expect(parseStepIntents(request(text)).stepIntents[0]?.canonicalTerm).toBe('삼겹살');
    }
  });

  it('무조건/only 마커는 required로 승격한다', () => {
    expect(parseStepIntents(request('무조건 삼겹살이어야 해')).stepIntents[0]?.strength).toBe('required');
    expect(parseStepIntents(request('Only sushi for dinner.')).stepIntents[0]?.strength).toBe('required');
    expect(parseStepIntents(request('파스타가 좋을 것 같아')).stepIntents[0]?.strength).toBe('preferred');
  });

  it('required 마커는 대상어 앞쪽만 본다(뒤 매칭어로 번지지 않음)', () => {
    // 삼겹살은 '말고'로 부정되어 excludedIntents로 빠지고, 파스타가 무조건(required)으로 남는다.
    const parsed = parseStepIntents(request('삼겹살 말고 무조건 파스타'));
    expect(parsed.stepIntents.map((i) => [i.canonicalTerm, i.strength])).toEqual([['파스타', 'required']]);
    expect(parsed.excludedIntents.map((i) => i.canonicalTerm)).toEqual(['삼겹살']);
  });

  it('부정 마커(말고/빼고)는 intent를 negated로 표시하고 positive에서 제외한다', () => {
    const parsed = parseStepIntents(request('삼겹살 말고 파스타 먹고 싶어'));
    const pasta = parsed.stepIntents.find((i) => i.canonicalTerm === '파스타');
    expect(pasta?.negated ?? false).toBe(false);
    expect(parsed.stepIntents.some((i) => i.canonicalTerm === '삼겹살')).toBe(false);
    expect(parsed.excludedIntents.map((i) => i.canonicalTerm)).toEqual(['삼겹살']);
    expect(parsed.excludedIntents[0]?.negated).toBe(true);
  });

  it('영어 부정(not/except)도 감지한다', () => {
    const parsed = parseStepIntents(request('pasta but not sushi'));
    expect(parsed.excludedIntents.map((i) => i.canonicalTerm)).toEqual(['초밥']);
  });

  it('부정 마커 없으면 excludedIntents는 빈 배열', () => {
    expect(parseStepIntents(request('삼겹살 먹고 싶어')).excludedIntents).toEqual([]);
  });

  it('locked 스텝에는 intent를 배정하지 않는다', () => {
    const req: RecommendationRequest = { ...request('삼겹살'), lockedSteps: [lockedStep('step-1')] };
    expect(parseStepIntents(req).stepIntents).toEqual([]);
  });

  it('meal 스텝이 둘일 때 locked가 아닌 스텝에 배정한다', () => {
    const req: RecommendationRequest = {
      ...request('삼겹살', [{ id: 'step-1', category: 'meal' }, { id: 'step-2', category: 'meal' }]),
      lockedSteps: [lockedStep('step-1')],
    };
    expect(parseStepIntents(req).stepIntents.map((intent) => intent.stepId)).toEqual(['step-2']);
  });

  it('venue_subtype은 cafe step에, 여러 intent는 각자 category step에 바인딩한다', () => {
    const parsed = parseStepIntents(request('삼겹살 먹고 카페는 루프탑이면 좋겠어'));
    expect(parsed.stepIntents.map((intent) => [intent.stepId, intent.canonicalTerm])).toEqual([
      ['step-1', '삼겹살'],
      ['step-2', '루프탑 카페'],
    ]);
  });

  it('대상 category step이 없으면 intent를 만들지 않는다', () => {
    const parsed = parseStepIntents(request('방탈출 하고 싶어')); // steps엔 activity 없음
    expect(parsed.stepIntents).toEqual([]);
  });

  it('additionalRequest 없으면 빈 결과', () => {
    expect(parseStepIntents(request()).stepIntents).toEqual([]);
  });

  it('같은 category 중복 매칭 시 첫 step 하나에만 바인딩한다', () => {
    const parsed = parseStepIntents(request('삼겹살', [
      { id: 'step-1', category: 'meal' },
      { id: 'step-2', category: 'meal' },
    ]));
    expect(parsed.stepIntents.map((intent) => intent.stepId)).toEqual(['step-1']);
  });
});

describe('placeMatchesStepIntent', () => {
  const intent = parseStepIntents(request('삼겹살 먹고 싶어')).stepIntents[0]!;
  const place = (overrides: Record<string, unknown>) => ({
    kakaoPlaceId: 'p1',
    name: '어느 식당',
    categoryGroupCode: 'FD6',
    categoryGroupName: '음식점',
    categoryName: '음식점 > 한식',
    address: '', roadAddress: '', latitude: 37.5, longitude: 127.0, mapUrl: '',
    matchedSearchEvidence: [],
    ...overrides,
  });

  it('exact step_intent 검색 evidence로 매칭한다', () => {
    expect(placeMatchesStepIntent(place({
      matchedSearchEvidence: [{ queryId: 'query_002', source: 'keyword', page: 1, queryText: '삼겹살', phase: 'step_intent', canonicalTerm: '삼겹살', expansionLevel: 0 }],
    }), intent)).toBe(true);
  });

  it('장소 이름의 canonical 포함으로 매칭한다', () => {
    expect(placeMatchesStepIntent(place({ name: '왕십리 삼겹살집' }), intent)).toBe(true);
  });

  it('호환 categoryName 키워드로 매칭한다', () => {
    expect(placeMatchesStepIntent(place({ categoryName: '음식점 > 한식 > 육류,고기 > 삼겹살' }), intent)).toBe(true);
  });

  it('무관한 장소는 매칭하지 않는다', () => {
    expect(placeMatchesStepIntent(place({}), intent)).toBe(false);
  });
});

describe('placeMatchesStepIntent - venue_subtype(루프탑 카페)', () => {
  const rooftopIntent = parseStepIntents(request('루프탑 카페 가고 싶어')).stepIntents[0]!;
  const cafePlace = (overrides: Record<string, unknown>) => ({
    kakaoPlaceId: 'c1',
    name: '어느 카페',
    categoryGroupCode: 'CE7',
    categoryGroupName: '카페',
    categoryName: '음식점 > 카페',
    address: '', roadAddress: '', latitude: 37.5, longitude: 127.0, mapUrl: '',
    matchedSearchEvidence: [],
    ...overrides,
  });

  it('cafe는 categoryName에 항상 "카페"가 있으므로 categoryName만으로는 매칭하지 않는다', () => {
    expect(placeMatchesStepIntent(cafePlace({ categoryName: '음식점 > 카페 > 북카페' }), rooftopIntent)).toBe(false);
  });

  it('이름에 "루프탑 카페"가 포함되면 매칭한다', () => {
    expect(placeMatchesStepIntent(cafePlace({ name: '옥상 루프탑 카페' }), rooftopIntent)).toBe(true);
  });

  it('step_intent 검색 evidence로 매칭한다', () => {
    expect(placeMatchesStepIntent(cafePlace({
      matchedSearchEvidence: [{ queryId: 'q', source: 'keyword', page: 1, queryText: '루프탑 카페', phase: 'step_intent', canonicalTerm: '루프탑 카페', expansionLevel: 0 }],
    }), rooftopIntent)).toBe(true);
  });
});
