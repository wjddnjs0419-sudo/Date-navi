import { parseStepsFromSummary, computeTrailNodes, buildTrailPath } from '../lib/course';

describe('parseStepsFromSummary', () => {
  it('"N단계: … → …" 문자열을 steps로 분해', () => {
    const out = parseStepsFromSummary('1단계: 한강 피크닉 → 2단계: 카페 → 3단계: 야경 산책');
    expect(out).toHaveLength(3);
    expect(out[0].label).toBe('한강 피크닉');
    expect(out[2].label).toBe('야경 산책');
  });
  it('단계 표기가 없으면 빈 배열', () => {
    expect(parseStepsFromSummary('그냥 한 줄 요약')).toEqual([]);
  });
  it('빈 입력은 빈 배열', () => {
    expect(parseStepsFromSummary('')).toEqual([]);
    expect(parseStepsFromSummary(undefined)).toEqual([]);
  });
});

describe('computeTrailNodes', () => {
  const opts = { nodesPerRow: 2, rowHeight: 140, padX: 40, padY: 60 };

  it('노드 수만큼 좌표를 반환', () => {
    const nodes = computeTrailNodes(4, 320, opts);
    expect(nodes).toHaveLength(4);
  });
  it('첫 행은 좌→우, 둘째 행은 우→좌 (serpentine)', () => {
    const nodes = computeTrailNodes(4, 320, opts);
    expect(nodes[0].x).toBeLessThan(nodes[1].x);
    expect(nodes[2].x).toBeGreaterThan(nodes[3].x);
    expect(nodes[2].y).toBeGreaterThan(nodes[0].y);
  });
  it('단계 증가 시 행이 아래로 추가되어 y가 커진다', () => {
    const few = computeTrailNodes(2, 320, opts);
    const many = computeTrailNodes(6, 320, opts);
    const maxYfew = Math.max(...few.map(n => n.y));
    const maxYmany = Math.max(...many.map(n => n.y));
    expect(maxYmany).toBeGreaterThan(maxYfew);
  });
});

describe('buildTrailPath', () => {
  it('첫 노드는 M으로 시작, 이후 노드마다 곡선 명령 포함', () => {
    const d = buildTrailPath([{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 150 }]);
    expect(d.startsWith('M 10 10')).toBe(true);
    expect(d).toMatch(/[CQ]/);
  });
  it('노드 1개 이하면 빈 문자열', () => {
    expect(buildTrailPath([])).toBe('');
    expect(buildTrailPath([{ x: 0, y: 0 }])).toBe('');
  });
});
