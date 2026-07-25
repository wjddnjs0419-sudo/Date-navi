import { buildPlaceBrowserArgs } from '../lib/placeBrowser';
import { C } from '../constants/colors';

describe('placeBrowser', () => {
  it('opens the Kakao place page with the Date Navi branded toolbar', () => {
    const { url, options } = buildPlaceBrowserArgs({ kakaoPlaceId: '8109714' });

    expect(url).toBe('https://place.map.kakao.com/8109714');
    expect(options).toMatchObject({
      toolbarColor: C.bg,
      controlsColor: C.pink,
      dismissButtonStyle: 'close',
    });
  });

  it('prefers the stored mapUrl when the place has one', () => {
    const { url } = buildPlaceBrowserArgs({
      kakaoPlaceId: '1',
      mapUrl: 'https://place.map.kakao.com/999',
    });

    expect(url).toBe('https://place.map.kakao.com/999');
  });
});
