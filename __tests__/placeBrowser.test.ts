import { buildPlaceBrowserArgs } from '../lib/placeBrowser';
import { C } from '../constants/colors';

describe('placeBrowser', () => {
  it('opens the Kakao place page with the Date Navi branded toolbar', () => {
    const { url, options } = buildPlaceBrowserArgs({ kakaoPlaceId: '8109714' });

    expect(url).toBe('https://place.map.kakao.com/8109714');
    expect(options).toMatchObject({
      toolbarColor: C.bg,
      secondaryToolbarColor: C.bg,
      controlsColor: C.pink,
      dismissButtonStyle: 'close',
      enableBarCollapsing: false,
      showTitle: true,
    });
  });

  it('prefers the stored mapUrl when the place has one', () => {
    const { url } = buildPlaceBrowserArgs({
      kakaoPlaceId: '1',
      mapUrl: 'https://place.map.kakao.com/999',
    });

    expect(url).toBe('https://place.map.kakao.com/999');
  });

  it('opens a provider map URL when Kakao identity is unavailable', () => {
    const { url } = buildPlaceBrowserArgs({
      mapUrl: 'https://map.naver.com/p/search/%EC%84%B1%EC%88%98%20%EC%B9%B4%ED%8E%98',
    });

    expect(url).toBe('https://map.naver.com/p/search/%EC%84%B1%EC%88%98%20%EC%B9%B4%ED%8E%98');
  });

  it('rejects an external stored URL and falls back to a Naver map search', () => {
    const { url } = buildPlaceBrowserArgs({
      mapUrl: 'https://smartstore.naver.com/layered',
      name: '카페 레이어드 성수',
      address: '서울 성동구 성수이로 1',
    });

    expect(url).toBe(`https://map.naver.com/p/search/${encodeURIComponent('카페 레이어드 성수 서울 성동구 성수이로 1')}`);
  });
});
