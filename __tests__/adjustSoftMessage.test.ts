import { buildAdjustSoftMessagePrompt } from '../lib/prompt';

describe('buildAdjustSoftMessagePrompt', () => {
  it('warmer(ko): 원문과 더 다정하게 다듬으라는 지침 포함', () => {
    const p = buildAdjustSoftMessagePrompt('오늘은 좀 쉬고 싶어.', 'warmer', 'ko');
    expect(p).toContain('오늘은 좀 쉬고 싶어.');
    expect(p).toContain('더 다정하게');
  });

  it('shorter(ko): 원문과 짧게 줄이라는 지침 포함', () => {
    const p = buildAdjustSoftMessagePrompt('오늘은 좀 쉬고 싶어.', 'shorter', 'ko');
    expect(p).toContain('오늘은 좀 쉬고 싶어.');
    expect(p).toContain('짧게');
  });

  it('warmer(en): 원문과 warmer 지침 포함', () => {
    const p = buildAdjustSoftMessagePrompt('I want to rest today.', 'warmer', 'en');
    expect(p).toContain('I want to rest today.');
    expect(p).toContain('warmer');
  });

  it('shorter(en): 원문과 shorter 지침 포함', () => {
    const p = buildAdjustSoftMessagePrompt('I want to rest today.', 'shorter', 'en');
    expect(p).toContain('I want to rest today.');
    expect(p).toContain('shorter');
  });
});
