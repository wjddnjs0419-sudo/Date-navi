import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  // 온보딩은 BackBar로만 이동하는 선형 흐름이다. iOS 스와이프-뒤로가기
  // 제스처가 간헐적으로 화면을 건너뛰어(온보딩 스킵) 미완료 상태로 진입시키므로
  // 제스처를 끄고 명시적 버튼 네비게이션만 허용한다.
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
