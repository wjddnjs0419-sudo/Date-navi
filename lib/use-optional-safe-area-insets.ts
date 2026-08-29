import { createContext, useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 } as const;
const SAFE_AREA_CONTEXT = SafeAreaInsetsContext ?? createContext(null);

/**
 * 화면 단위 Safe Area 계산을 위한 경계 훅.
 * 앱 런타임에서는 SafeAreaProvider의 실제 inset을 사용하고,
 * provider 없이 렌더링되는 테스트/스토리에서는 0 inset으로 동작한다.
 */
export function useOptionalSafeAreaInsets() {
  return useContext(SAFE_AREA_CONTEXT) ?? ZERO_INSETS;
}
