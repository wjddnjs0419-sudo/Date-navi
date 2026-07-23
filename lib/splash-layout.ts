/**
 * 네이티브 스플래시가 정사각 로고 이미지를 contain으로 배치하는 방식을 그대로 계산한다.
 * JS 스플래시가 같은 좌표에 같은 크기로 로고를 그려야 전환 순간 로고가 튀지 않는다.
 */
export function splashMarkLayout({ width, height }: { width: number; height: number }) {
  const size = Math.min(width, height);
  return {
    left: (width - size) / 2,
    top: (height - size) / 2,
    size,
  };
}
