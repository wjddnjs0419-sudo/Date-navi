// 소셜 로그인 버튼 3종(카카오·구글·애플)의 크기를 한 곳에서 계산한다.
// 카카오는 공식 이미지 버튼이라 크기를 바꿀 수 없으므로, 그 이미지가 기준이 되고
// 나머지 두 버튼이 거기에 맞춘다.

/** 카카오 공식 버튼 이미지 원본 비율(600×90). 높이 = 폭 / 이 값. */
const KAKAO_BUTTON_RATIO = 600 / 90;

/** 이미지에 내장된 코너 반경(실측 7px / 원본 높이 90px). */
const KAKAO_CORNER_RATIO = 7 / 90;

/** Apple이 Sign in with Apple 버튼에 요구하는 최소 높이(pt). iOS 최소 탭 타깃과도 일치. */
const MIN_BUTTON_HEIGHT = 44;

/** 화면 폭에서 hero 좌우 여백(24×2)을 뺀 콘텐츠 폭. */
const HORIZONTAL_PADDING = 48;

export function socialButtonHeight(screenWidth: number): number {
  const contentWidth = screenWidth - HORIZONTAL_PADDING;
  return Math.max(MIN_BUTTON_HEIGHT, Math.round(contentWidth / KAKAO_BUTTON_RATIO));
}

export function socialButtonRadius(height: number): number {
  return Math.round(height * KAKAO_CORNER_RATIO);
}
