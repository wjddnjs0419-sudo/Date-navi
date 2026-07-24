/**
 * 확정 화면에서 사용자가 입력한 제목(draft)을 저장할 최종 제목으로 정규화한다.
 * 앞뒤 공백을 제거하고, 비어 있으면 위치 기반 기본 제목(fallback)으로 폴백한다.
 */
export function resolveConfirmTitle(draft: string, fallback: string): string {
  return draft.trim() || fallback;
}
