import { mergePersonalStepTagCatalog, normalizeStepIntentTag } from '../lib/personal-step-tag-catalog';

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
});
