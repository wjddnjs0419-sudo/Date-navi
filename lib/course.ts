export type CourseStep = { label: string; desc?: string };

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
