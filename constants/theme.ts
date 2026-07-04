import { StyleSheet } from 'react-native';
import { C } from './colors';

export { C } from './colors';

// 간격 스케일. 새 스타일을 쓸 때 이 값을 우선 사용한다.
export const SP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// 모서리 반경 스케일. 기존 화면에서 실제 쓰이는 값만 담는다.
export const R = {
  badge: 6,
  sm: 10,
  md: 14,
  lg: 16,
  btn: 18,
  xl: 20,
  card: 22,
  hero: 24,
} as const;

// 화면 전반에서 반복되는 타이포그래피 프리셋.
export const T = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  sub: { fontSize: 13, color: C.textSub, lineHeight: 20 },
});

// 전역 레이아웃 프리셋.
export const G = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
