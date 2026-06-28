import { buildLightInput, buildPickInput, buildFeelingInput } from '../lib/modeForm';

describe('mode별 FeelingInput 빌더', () => {
  it('light: 저예산·근거리 고정', () => {
    const input = buildLightInput({ duration: '1h' });
    expect(input.budget).toBe('low');
    expect(input.distance).toBe('near');
    expect(input.duration).toBe('1h');
    expect(input.freeText).toBeUndefined();
  });
  it('pick: 조건 그대로, freeText 없음', () => {
    const input = buildPickInput({ energy: 'low', budget: 'medium', distance: 'near', duration: '2-3h' });
    expect(input.budget).toBe('medium');
    expect(input.freeText).toBeUndefined();
  });
  it('feeling: 분위기 mood + freeText 반영', () => {
    const input = buildFeelingInput({ mood: 'quiet', freeText: '조용한 데이트', budget: 'low', duration: '1h' });
    expect(input.mood).toBe('quiet');
    expect(input.freeText).toBe('조용한 데이트');
  });
});
