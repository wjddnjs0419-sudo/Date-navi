import * as WebBrowser from 'expo-web-browser';
import { C } from '../constants/colors';
import { buildKakaoMapUrl } from './replacement-candidates';
import { buildNaverMapSearchUrl, isNaverMapUrl } from '../shared/recommendation/naver-map-link';

type PlaceRef = {
  kakaoPlaceId?: string | null;
  mapUrl?: string | null;
  name?: string | null;
  address?: string | null;
};

const KAKAO_MAP_HOSTS = new Set(['place.map.kakao.com', 'map.kakao.com']);

function isKakaoMapUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl?.trim()) return false;
  try {
    const url = new URL(rawUrl.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && KAKAO_MAP_HOSTS.has(url.hostname.toLocaleLowerCase());
  } catch {
    return false;
  }
}

// 장소 링크는 카카오 또는 네이버 지도 도메인만 열고, 외부 상세 URL은 네이버 지도 검색으로 대체한다.
// 인앱 브라우저의 상·하단 바와 컨트롤을 완료 화면과 동일한 Date Navi 톤으로 고정한다.
// iOS에서는 toolbarColor가 SFSafariViewController의 상·하단 바에 함께 적용된다.
const PLACE_BROWSER_OPTIONS: WebBrowser.WebBrowserOpenOptions = {
  toolbarColor: C.bg,
  secondaryToolbarColor: C.bg,
  controlsColor: C.pink,
  dismissButtonStyle: 'close',
  enableBarCollapsing: false,
  showTitle: true,
};

export function buildPlaceBrowserArgs(place: PlaceRef): {
  url: string;
  options: WebBrowser.WebBrowserOpenOptions;
} {
  const storedUrl = place.mapUrl?.trim();
  const trustedMapUrl = isNaverMapUrl(storedUrl) || isKakaoMapUrl(storedUrl) ? storedUrl : undefined;
  const url = trustedMapUrl || (place.kakaoPlaceId
    ? buildKakaoMapUrl({ kakaoPlaceId: place.kakaoPlaceId, mapUrl: '' })
    : buildNaverMapSearchUrl(place.name ?? undefined, place.address ?? undefined));
  if (!url) throw new Error('A place map URL or Kakao place ID is required.');
  return {
    url,
    options: PLACE_BROWSER_OPTIONS,
  };
}

export async function openPlaceInBrowser(place: PlaceRef): Promise<void> {
  const { url, options } = buildPlaceBrowserArgs(place);
  await WebBrowser.openBrowserAsync(url, options);
}
