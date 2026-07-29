import { mergePersonalStepTagCatalog, normalizeStepIntentTag } from '../lib/personal-step-tag-catalog';
import { canonicalizeStepIntentTag, getStepIntentTagSuggestions } from '../shared/recommendation/step-intent-tag-catalog';

describe('personal step tag catalog', () => {
  it('hides a shipped tag and retains a personal tag in the same category', () => {
    expect(mergePersonalStepTagCatalog(
      'meal',
      ['라멘', '파스타'],
      [{ id: 'p1', category: 'meal', tag: '뇨끼', normalizedTag: '뇨끼' }],
      [{ category: 'meal', tag: '라멘', normalizedTag: '라멘' }],
    )).toEqual(['파스타', '뇨끼']);
  });

  it('normalizes whitespace and case for unique catalog keys', () => {
    expect(normalizeStepIntentTag('  Ramen  ')).toBe('ramen');
  });

  it('uses an English label but the same Korean canonical value for a shipped tag', () => {
    expect(getStepIntentTagSuggestions('meal', 'en')[0]).toEqual({
      value: '라멘', label: 'Ramen', shipped: true,
    });
    expect(canonicalizeStepIntentTag('Ramen')).toBe('라멘');
  });
});
