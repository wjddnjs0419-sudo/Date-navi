import * as WebBrowser from 'expo-web-browser';
import { C } from '../constants/colors';
import { buildKakaoMapUrl } from './replacement-candidates';

type PlaceRef = { kakaoPlaceId: string; mapUrl?: string | null };

// 장소 리뷰·사진·정보·지도는 카카오 place 상세 페이지로 통일한다(네이버 검색 대신).
// 인앱 브라우저 툴바를 Date Navi 톤으로 맞춘다(도메인 표시는 iOS SFSafariViewController 강제라 유지).
const PLACE_BROWSER_OPTIONS: WebBrowser.WebBrowserOpenOptions = {
  toolbarColor: C.bg,
  controlsColor: C.pink,
  dismissButtonStyle: 'close',
};

export function buildPlaceBrowserArgs(place: PlaceRef): {
  url: string;
  options: WebBrowser.WebBrowserOpenOptions;
} {
  return {
    url: buildKakaoMapUrl({ kakaoPlaceId: place.kakaoPlaceId, mapUrl: place.mapUrl ?? '' }),
    options: PLACE_BROWSER_OPTIONS,
  };
}

export async function openPlaceInBrowser(place: PlaceRef): Promise<void> {
  const { url, options } = buildPlaceBrowserArgs(place);
  await WebBrowser.openBrowserAsync(url, options);
}
