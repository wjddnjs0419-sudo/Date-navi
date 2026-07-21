import { formatDistance, haversineMeters } from '../app/mode-flow/place-search';

describe('formatDistance', () => {
  it('shows metres under 1km', () => {
    expect(formatDistance(250)).toBe('250m');
  });
  it('rounds metres to the nearest 10', () => {
    expect(formatDistance(253)).toBe('250m');
  });
  it('shows one-decimal km at or above 1km', () => {
    expect(formatDistance(1200)).toBe('1.2km');
  });
  it('returns empty string for a non-finite distance', () => {
    expect(formatDistance(Number.NaN)).toBe('');
  });
});

describe('haversineMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineMeters(37.5445, 127.0565, 37.5445, 127.0565)).toBe(0);
  });
  it('approximates a known short distance (~250m)', () => {
    // ~0.00225 deg latitude ≈ 250m
    const d = haversineMeters(37.5445, 127.0565, 37.5445 + 0.00225, 127.0565);
    expect(d).toBeGreaterThan(230);
    expect(d).toBeLessThan(270);
  });
});
