import { compareAppVersions, isMinimumAppVersionMet } from '../lib/minimum-app-version';

describe('minimum app version policy', () => {
  it('treats omitted patch digits as zero, so 1.0.9 is older than 1.1', () => {
    expect(compareAppVersions('1.0.9', '1.1')).toBeLessThan(0);
    expect(isMinimumAppVersionMet('1.0.9', '1.1')).toBe(false);
  });

  it('allows the exact minimum and newer versions', () => {
    expect(isMinimumAppVersionMet('1.1', '1.1')).toBe(true);
    expect(isMinimumAppVersionMet('1.2', '1.1')).toBe(true);
  });

  it('rejects versions outside the single-digit release policy', () => {
    expect(() => compareAppVersions('1.0.10', '1.1')).toThrow('Invalid app version');
  });
});
