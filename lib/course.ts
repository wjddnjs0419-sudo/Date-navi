// place_* 필드는 make_course candidate 단계에서 실제 장소가 결합될 때만 채워진다 (V2 §16, 하위호환).
export type CourseStep = {
  label: string;
  desc?: string;
  candidateId?: string;
  kakaoPlaceId?: string;
  place_name?: string;
  place_address?: string;
  map_url?: string;
};

/**
 * "1단계: A → 2단계: B → 3단계: C" 형태의 요약을 단계 배열로 분해한다.
 * 단계 표기를 못 찾으면 빈 배열을 반환한다.
 */
export function parseStepsFromSummary(summary?: string): CourseStep[] {
  if (!summary) return [];
  const parts = summary.split('→');
  const steps: CourseStep[] = [];
  for (const part of parts) {
    const m = part.match(/\d+\s*단계\s*[:：]\s*(.+)/);
    if (m && m[1].trim()) steps.push({ label: m[1].trim() });
  }
  return steps;
}

// 카드 상세 표시용: steps가 있으면 그대로, 없으면 summary 텍스트 파싱으로 최대한 복원한다.
// place_name 등 장소 결합 정보는 텍스트 파싱으로 복원 불가 — 파싱 폴백은 label만 채운다.
export function resolveDisplaySteps(card: { steps?: CourseStep[] | null; summary?: string }): CourseStep[] {
  if (card.steps && card.steps.length > 0) return card.steps;
  return parseStepsFromSummary(card.summary);
}
