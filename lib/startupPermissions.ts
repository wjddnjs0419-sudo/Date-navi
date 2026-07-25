import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { registerPushToken } from './push';

// 로그인된 세션이 확인되는 즉시 호출한다(초기 부팅 + SIGNED_IN).
// 미결정 권한은 이때 한 번 묻고, 알림이 허용 상태면 푸시 토큰을 (재)등록한다.
// 이미 결정된 권한(허용/거부)에는 iOS가 팝업을 다시 띄우지 않으므로 매번 불러도 안전하다.
export async function ensureStartupPermissions(): Promise<void> {
  try {
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === 'undetermined' && canAskAgain) {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    // 재설치·토큰 로테이션 후에도 서버가 항상 현재 기기 토큰을 갖도록 허용 시 매번 재등록.
    if (status === 'granted') await registerPushToken();
  } catch {
    // 권한 확인 실패가 앱 부팅을 막으면 안 된다.
  }

  try {
    const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    if (status === 'undetermined' && canAskAgain) {
      await Location.requestForegroundPermissionsAsync();
    }
  } catch {
    // 위 동일.
  }
}
