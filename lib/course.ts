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

export type TrailNode = { x: number; y: number };
export type TrailOpts = { nodesPerRow: number; rowHeight: number; padX: number; padY: number };

/**
 * 가로 S자(serpentine)로 노드 좌표를 계산한다.
 * 각 행은 nodesPerRow개를 균등 배치하고, 홀수 행은 좌우를 반전한다.
 */
export function computeTrailNodes(stepCount: number, width: number, opts: TrailOpts): TrailNode[] {
  const { nodesPerRow, rowHeight, padX, padY } = opts;
  const usable = Math.max(1, width - padX * 2);
  const gap = nodesPerRow > 1 ? usable / (nodesPerRow - 1) : 0;
  const nodes: TrailNode[] = [];
  for (let i = 0; i < stepCount; i++) {
    const row = Math.floor(i / nodesPerRow);
    const col = i % nodesPerRow;
    const order = row % 2 === 0 ? col : nodesPerRow - 1 - col;
    const x = padX + order * gap;
    const y = padY + row * rowHeight;
    nodes.push({ x, y });
  }
  return nodes;
}

/**
 * 노드들을 잇는 둥근 곡선 SVG path(d)를 만든다.
 * 연속 노드 사이를 2차 베지어(Q)로 둥글게 연결한다.
 */
export function buildTrailPath(nodes: TrailNode[]): string {
  if (nodes.length < 2) return '';
  let d = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const cur = nodes[i];
    const cx = prev.x;
    const cy = cur.y;
    d += ` Q ${cx} ${cy} ${cur.x} ${cur.y}`;
  }
  return d;
}
