import { partnerHasReviewed } from '../lib/reviewFlow';

describe('partnerHasReviewed', () => {
  it('is true when a memory exists from someone other than me', () => {
    expect(partnerHasReviewed(['me', 'partner'], 'me')).toBe(true);
  });

  it('is false when only my own review exists', () => {
    expect(partnerHasReviewed(['me'], 'me')).toBe(false);
  });

  it('is false when no reviews exist yet', () => {
    expect(partnerHasReviewed([], 'me')).toBe(false);
  });
});
