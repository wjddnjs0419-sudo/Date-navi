import {
  PERSONAL_STEP_TAG_LIMIT,
  canAddPersonalStepTag,
  countPersonalStepTags,
  mergePersonalStepTagCatalog,
  normalizeStepIntentTag,
} from '../lib/personal-step-tag-catalog';
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

  it('limits unique personal tags per category while allowing an existing tag to be re-added', () => {
    const personal = Array.from({ length: PERSONAL_STEP_TAG_LIMIT }, (_, index) => ({
      id: `p-${index}`,
      category: 'meal' as const,
      tag: `메뉴 ${index}`,
      normalizedTag: `메뉴 ${index}`,
    }));

    expect(countPersonalStepTags(personal, 'meal')).toBe(PERSONAL_STEP_TAG_LIMIT);
    expect(canAddPersonalStepTag(personal, 'meal', '새 메뉴')).toBe(false);
    expect(canAddPersonalStepTag(personal, 'meal', '메뉴 0')).toBe(true);
    expect(canAddPersonalStepTag(personal, 'cafe', '새 카페')).toBe(true);
  });

  it('uses an English label but the same Korean canonical value for a shipped tag', () => {
    expect(getStepIntentTagSuggestions('meal', 'en')[0]).toEqual({
      value: '라멘', label: 'Ramen', shipped: true,
    });
    expect(canonicalizeStepIntentTag('Ramen')).toBe('라멘');
  });
});
