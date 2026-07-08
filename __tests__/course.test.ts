import { parseStepsFromSummary } from '../lib/course';

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
