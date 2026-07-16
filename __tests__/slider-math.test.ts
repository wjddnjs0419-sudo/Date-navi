import { fractionToValue, isHorizontalDrag, snapToStep, valueToFraction } from '../lib/slider-math';

describe('snapToStep', () => {
  it('rounds to the nearest step', () => {
    expect(snapToStep(7, 0, 10, 5)).toBe(5);
    expect(snapToStep(8, 0, 10, 5)).toBe(10);
  });

  it('clamps below min and above max', () => {
    expect(snapToStep(-3, 0, 10, 5)).toBe(0);
    expect(snapToStep(999, 0, 10, 5)).toBe(10);
  });
});

describe('valueToFraction', () => {
  it('maps a value to its 0-1 position in the range', () => {
    expect(valueToFraction(5, 0, 10)).toBe(0.5);
    expect(valueToFraction(0, 0, 10)).toBe(0);
    expect(valueToFraction(10, 0, 10)).toBe(1);
  });
});

describe('fractionToValue', () => {
  it('maps a 0-1 fraction to a snapped value in a continuous range', () => {
    expect(fractionToValue(0.5, 0, 10_000_000, 10_000)).toBe(5_000_000);
  });

  it('maps a fraction to the nearest of a few discrete index stops', () => {
    expect(fractionToValue(0.26, 0, 3, 1)).toBe(1);
    expect(fractionToValue(0.74, 0, 3, 1)).toBe(2);
  });

  it('clamps fractions outside 0-1', () => {
    expect(fractionToValue(-0.5, 0, 10, 5)).toBe(0);
    expect(fractionToValue(1.5, 0, 10, 5)).toBe(10);
  });
});

describe('isHorizontalDrag', () => {
  it('claims a clearly horizontal drag past the threshold', () => {
    expect(isHorizontalDrag(15, 2)).toBe(true);
  });

  it('yields a clearly vertical drag (e.g. scrolling a parent ScrollView)', () => {
    expect(isHorizontalDrag(3, 20)).toBe(false);
  });

  it('yields small movements under the threshold, even if horizontal', () => {
    expect(isHorizontalDrag(6, 0)).toBe(false);
  });

  it('yields a diagonal drag where vertical movement dominates', () => {
    expect(isHorizontalDrag(12, 15)).toBe(false);
  });
});
