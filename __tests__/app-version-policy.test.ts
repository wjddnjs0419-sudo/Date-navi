import { resolveAppVersionPolicy } from '../lib/app-version-policy';

describe('app version policy resolution', () => {
  it('blocks an older iOS build and preserves the configured store destination', async () => {
    await expect(resolveAppVersionPolicy('1.0.9', async () => ({
      enforced: true,
      minimumIosVersion: '1.1',
      storeUrl: 'https://apps.apple.com/kr/app/date-navi/id6794355525',
    }))).resolves.toEqual({ blocked: true, storeUrl: 'https://apps.apple.com/kr/app/date-navi/id6794355525' });
  });

  it('fails open when the remote policy cannot be loaded', async () => {
    await expect(resolveAppVersionPolicy('1.0.1', async () => {
      throw new Error('offline');
    })).resolves.toEqual({ blocked: false });
  });

  it('does not block while enforcement is disabled', async () => {
    await expect(resolveAppVersionPolicy('1.0.1', async () => ({
      enforced: false,
      minimumIosVersion: '1.1',
      storeUrl: 'https://apps.apple.com/kr/app/date-navi/id6794355525',
    }))).resolves.toEqual({ blocked: false });
  });
});
