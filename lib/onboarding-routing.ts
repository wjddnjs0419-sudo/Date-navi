export type OnboardingRouteInputs = {
  hasSession: boolean;
  displayName: string | null | undefined;
  linked: boolean;
  pendingCode: string | null;
  onboardingCompleted: boolean;
};

/**
 * 로그인/온보딩 상태로부터 진입 목적지를 결정하는 순수 함수.
 * 커플 연결은 선택 사항이므로 완료 판정은 onboarding_completed 하나로 한다.
 * 미연결 사용자도 tabs로 진입할 수 있다(둘러보기 모드).
 */
export function resolveOnboardingDestination(i: OnboardingRouteInputs): string {
  if (!i.hasSession) return '/(auth)';
  if (!i.displayName) return '/onboarding/nickname';

  // 딥링크 초대: 아직 미연결이고 대기 코드가 있으면 연결 화면으로 유도.
  if (i.pendingCode && !i.linked) {
    return `/onboarding/couple-connect?code=${encodeURIComponent(i.pendingCode)}`;
  }

  if (!i.onboardingCompleted) return '/onboarding/preferences';
  return '/(tabs)';
}
