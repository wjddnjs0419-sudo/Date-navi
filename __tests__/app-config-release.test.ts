import appConfig from '../app.json';

test('iOS ships iPhone-only for first release (supportsTablet is false)', () => {
  expect(appConfig.expo.ios.supportsTablet).toBe(false);
});
