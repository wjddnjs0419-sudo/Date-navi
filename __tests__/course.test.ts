import { parseStepsFromSummary, resolveDisplaySteps } from '../lib/course';

describe('parseStepsFromSummary', () => {
  it('"N단계: … → …" 문자열을 steps로 분해', () => {
    const out = parseStepsFromSummary('1단계: 한강 피크닉 → 2단계: 카페 → 3단계: 야경 산책');
    expect(out).toHaveLength(3);
    expect(out[0].label).toBe('한강 피크닉');
    expect(out[2].label).toBe('야경 산책');
  });
  it('단계 표기가 없으면 빈 배열', () => {
    expect(parseStepsFromSummary('그냥 한 줄 요약')).toEqual([]);
  });
  it('빈 입력은 빈 배열', () => {
    expect(parseStepsFromSummary('')).toEqual([]);
    expect(parseStepsFromSummary(undefined)).toEqual([]);
  });
});

describe('resolveDisplaySteps', () => {
  it('steps가 있으면 그대로 반환', () => {
    const steps = [{ label: '카페' }, { label: '산책' }];
    expect(resolveDisplaySteps({ steps, summary: '아무 요약' })).toEqual(steps);
  });
  it('steps가 없으면 summary를 파싱해서 반환', () => {
    const out = resolveDisplaySteps({ summary: '1단계: 카페 → 2단계: 산책' });
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe('카페');
  });
  it('steps가 빈 배열이면 summary를 파싱해서 반환', () => {
    const out = resolveDisplaySteps({ steps: [], summary: '1단계: 브런치' });
    expect(out).toHaveLength(1);
  });
  it('steps도 없고 summary도 파싱 불가면 빈 배열', () => {
    expect(resolveDisplaySteps({ summary: '그냥 한 줄 요약' })).toEqual([]);
  });
  it('steps도 summary도 없으면 빈 배열', () => {
    expect(resolveDisplaySteps({})).toEqual([]);
  });
});
