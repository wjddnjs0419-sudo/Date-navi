// __tests__/ratingFeedback.test.ts
import { RATING_FEEDBACK_KEY, RATING_FEEDBACK_ICON, RATING_FEEDBACK_TONE, deriveWantAgain } from '../lib/ratingFeedback';

describe('lib/ratingFeedback', () => {
  it('maps each rating (1~5) to a distinct feedback key', () => {
    expect(RATING_FEEDBACK_KEY).toEqual({
      1: 'bad', 2: 'meh', 3: 'okay', 4: 'good', 5: 'amazing',
    });
  });

  it('provides an icon and tone for every rating', () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      expect(RATING_FEEDBACK_ICON[n]).toBeDefined();
      expect(RATING_FEEDBACK_TONE[n].fg).toEqual(expect.any(String));
      expect(RATING_FEEDBACK_TONE[n].bg).toEqual(expect.any(String));
    }
  });

  it('derives want_again as true only for rating >= 4', () => {
    expect(deriveWantAgain(1)).toBe(false);
    expect(deriveWantAgain(2)).toBe(false);
    expect(deriveWantAgain(3)).toBe(false);
    expect(deriveWantAgain(4)).toBe(true);
    expect(deriveWantAgain(5)).toBe(true);
  });
});
