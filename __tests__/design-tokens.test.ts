import { C } from '../constants/colors';

describe('design tokens — category pins', () => {
  it('exposes distinct meal/cafe/walk pin colors', () => {
    expect(C.catMeal).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(C.catCafe).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(C.catWalk).toMatch(/^#[0-9a-fA-F]{6}$/);
    const set = new Set([C.catMeal, C.catCafe, C.catWalk]);
    expect(set.size).toBe(3);
  });
});
