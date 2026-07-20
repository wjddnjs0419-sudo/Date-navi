import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useI18n, type AppLanguage } from '../../lib/i18n';

/**
 * 스크린샷 dev 전용 네비게이터.
 * EXPO_PUBLIC_SCREENSHOT=1 일 때만 동작하며, 호스트에서 띄운 로컬 제어 서버를
 * 폴링해 지정된 라우트로 router.replace 한다. openurl 확인창/탭 없이 외부에서
 * 화면을 순회 캡처하기 위한 장치다. 프로덕션 빌드에는 포함되지 않는다(플래그 격리).
 *
 * 제어 서버 프로토콜: GET http://127.0.0.1:8099/route → 라우트 문자열 또는 "IDLE".
 */
const CONTROL_URL = 'http://127.0.0.1:8099/route';
const POLL_MS = 600;

export function ScreenshotNavigator() {
  const router = useRouter();
  const { setLanguage } = useI18n();
  const lastRef = useRef<string>('');

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_SCREENSHOT !== '1') return;
    let alive = true;

    const tick = async () => {
      try {
        const res = await fetch(CONTROL_URL, { cache: 'no-store' } as any);
        const route = (await res.text()).trim();
        if (route && route !== 'IDLE' && route !== lastRef.current) {
          lastRef.current = route;
          // "LANG:en" / "LANG:ko" → 이동 대신 앱 언어 전환
          if (route.startsWith('LANG:')) {
            setLanguage(route.slice(5) as AppLanguage);
          } else {
            router.replace(route as any);
          }
        }
      } catch {
        // 서버 미기동/일시 오류는 무시하고 다음 폴링에서 재시도.
      }
      if (alive) setTimeout(tick, POLL_MS);
    };
    const id = setTimeout(tick, POLL_MS);

    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [router, setLanguage]);

  return null;
}
