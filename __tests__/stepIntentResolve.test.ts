import type { RecommendationRequest } from '../shared/recommendation/schemas';
import { resolveStepIntents, type AiParseResult } from '../supabase/functions/_shared/step-intent-resolve';

const request = (additionalRequest?: string): RecommendationRequest => ({
  requestId: 'req-resolve',
  mode: 'course',
  language: 'ko',
  location: { source: 'kakao', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
  courseSteps: [
    { id: 'step-1', category: 'meal', label: '식사' },
    { id: 'step-2', category: 'cafe', label: '카페' },
  ],
  ...(additionalRequest ? { additionalRequest } : {}),
});

describe('resolveStepIntents — 고재현 AI 게이트', () => {
  it('사전 통문장 히트는 source=rule, AI 미호출', async () => {
    const invokeAi = jest.fn();
    const resolved = await resolveStepIntents(request('삼겹살 먹고 싶어'), { invokeAi });
    expect(resolved.source).toBe('rule');
    expect(resolved.stepIntents.map((i) => i.canonicalTerm)).toEqual(['삼겹살']);
    expect(invokeAi).not.toHaveBeenCalled();
  });

  it('단순 부정문(사전어만)은 규칙이 처리하고 AI 미호출', async () => {
    const invokeAi = jest.fn();
    const resolved = await resolveStepIntents(request('삼겹살 말고 파스타'), { invokeAi });
    expect(resolved.stepIntents.map((i) => i.canonicalTerm)).toEqual(['파스타']);
    expect(resolved.excludedIntents.map((i) => i.canonicalTerm)).toEqual(['삼겹살']);
    expect(invokeAi).not.toHaveBeenCalled();
  });

  it('additionalRequest 없으면 source=none, AI 미호출', async () => {
    const invokeAi = jest.fn();
    const resolved = await resolveStepIntents(request(), { invokeAi });
    expect(resolved.source).toBe('none');
    expect(resolved.stepIntents).toEqual([]);
    expect(invokeAi).not.toHaveBeenCalled();
  });

  it('규칙 미검출 + 유의미 텍스트 → AI 호출', async () => {
    const invokeAi = jest.fn(async () => ({ stepIntents: [], unsupported: [], conflicts: [] }));
    await resolveStepIntents(request('뭔가 이색적인 데이트 하고파'), { invokeAi });
    expect(invokeAi).toHaveBeenCalledTimes(1);
  });

  it('사전 히트가 있어도 유의미 잔여 뉘앙스가 남으면 AI 호출(다중타깃/패러프레이즈)', async () => {
    const invokeAi = jest.fn(async (): Promise<AiParseResult> => ({
      stepIntents: [{
        stepId: 'step-1', stepCategory: 'meal', intentType: 'dish', canonicalTerm: '삼겹살',
        kakaoSearchTerms: ['삼겹살'], strength: 'preferred', displayLabel: { ko: '삼겹살', en: 'Samgyeopsal' },
      }],
      unsupported: [], conflicts: [],
    }));
    await resolveStepIntents(request('삼겹살 먹고 조용하고 분위기 좋은 감성 카페 가고싶어'), { invokeAi });
    expect(invokeAi).toHaveBeenCalledTimes(1);
  });

  it('미등재 라틴 토큰이 남으면 AI 호출', async () => {
    const invokeAi = jest.fn(async () => ({ stepIntents: [], unsupported: [], conflicts: [] }));
    await resolveStepIntents(request('I want brunch and natural wine'), { invokeAi });
    expect(invokeAi).toHaveBeenCalledTimes(1);
  });

  it('AI 성공 시 source=ai, stepIntents는 AI 결과, excluded는 규칙 유지', async () => {
    const invokeAi = jest.fn(async (): Promise<AiParseResult> => ({
      stepIntents: [{
        stepId: 'step-1', stepCategory: 'meal', intentType: 'dish', canonicalTerm: '브런치',
        kakaoSearchTerms: ['브런치'], strength: 'preferred', displayLabel: { ko: '브런치', en: 'Brunch' },
      }],
      unsupported: [{ term: '루프탑', reason: 'no cafe-subtype step' }],
      conflicts: [],
    }));
    const resolved = await resolveStepIntents(request('브런치 먹고싶은 색다른 곳'), { invokeAi });
    expect(resolved.source).toBe('ai');
    expect(resolved.stepIntents.map((i) => i.canonicalTerm)).toEqual(['브런치']);
    expect(resolved.unsupported).toEqual([{ term: '루프탑', reason: 'no cafe-subtype step' }]);
  });

  it('AI 실패 시 규칙 결과로 graceful degrade + aiError=true', async () => {
    const invokeAi = jest.fn(async () => { throw new Error('downstream 500'); });
    const resolved = await resolveStepIntents(request('색다른 무언가 하고파'), { invokeAi });
    expect(resolved.aiError).toBe(true); // AI 시도했으나 실패했음을 구분
    expect(resolved.source).toBe('none'); // 규칙도 빈 결과라 resolved 없음
    expect(resolved.stepIntents).toEqual([]);
  });

  it('invokeAi 미주입(deps 없음)이면 규칙 전용, 잔여가 있어도 AI 시도 안 함', async () => {
    const resolved = await resolveStepIntents(request('색다른 무언가'));
    expect(resolved.source).toBe('none');
    expect(resolved.aiError).toBeUndefined();
  });
});
