import { buildKakaoSearchPlan } from '../supabase/functions/_shared/recommendation-search';
import type { ParsedStepIntent } from '../supabase/functions/_shared/step-intent';

const base = () => ({
  requestId: 'req-thread',
  mode: 'course' as const,
  language: 'ko' as const,
  location: { source: 'kakao' as const, label: 'x', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' as const },
  courseSteps: [
    { id: 'step-0', category: 'meal', label: 'meal' },
    { id: 'step-1', category: 'cafe', label: 'cafe' },
  ],
});

it('resolvedStepIntents가 부착되면 additionalRequest 재파싱 대신 그 값으로 검색 플랜을 만든다', () => {
  const injected: ParsedStepIntent[] = [{
    stepId: 'step-0', stepCategory: 'meal', intentType: 'dish', canonicalTerm: '라멘',
    kakaoSearchTerms: ['라멘', '일식'], strength: 'preferred', displayLabel: { ko: '라멘', en: 'Ramen' },
  }];
  // additionalRequest는 '삼겹살'인데 resolved는 '라멘' → resolved가 이겨야 한다.
  const plan = buildKakaoSearchPlan({ ...base(), additionalRequest: '삼겹살', resolvedStepIntents: injected } as never);
  const intentItems = plan.filter((item) => item.phase === 'step_intent');
  expect(intentItems.map((item) => item.canonicalTerm)).toEqual(['라멘', '라멘']);
  expect(intentItems.map((item) => item.queryText)).toEqual(['라멘', '일식']);
  expect(intentItems.some((item) => item.canonicalTerm === '삼겹살')).toBe(false);
});

it('resolvedStepIntents가 빈 배열이면 step_intent 쿼리를 만들지 않는다(부착 우선, 재파싱 안 함)', () => {
  const plan = buildKakaoSearchPlan({ ...base(), additionalRequest: '삼겹살', resolvedStepIntents: [] } as never);
  expect(plan.some((item) => item.phase === 'step_intent')).toBe(false);
});
