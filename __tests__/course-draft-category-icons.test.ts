import { Coffee, Sparkles, Utensils } from 'lucide-react-native';
import { CATEGORY_ICONS, getCourseCategoryIcon } from '../lib/course-draft';

describe('course category icon mapping', () => {
  it('exposes one icon per known course category', () => {
    expect(CATEGORY_ICONS.meal).toBe(Utensils);
    expect(CATEGORY_ICONS.cafe).toBe(Coffee);
    expect(CATEGORY_ICONS.ai_decide).toBe(Sparkles);
  });

  it('looks up the icon for a known category string', () => {
    expect(getCourseCategoryIcon('cafe')).toBe(Coffee);
  });

  it('falls back to the sparkles icon for a category outside the known set', () => {
    expect(getCourseCategoryIcon('some_unmapped_category')).toBe(Sparkles);
  });
});
