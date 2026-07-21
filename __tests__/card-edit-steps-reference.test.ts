import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 목업(05_card_edit_confirm)은 스텝별 시간 편집기지만, CourseStep엔 시간/카테고리 필드가 없어
// 그 기능은 만들지 않는다(사용자 확인). 대신 make_course 카드면 기존 CourseStepList로
// 현재 스텝을 참고용(읽기 전용)으로 보여준다 — 편집 대상은 title/summary/time/budget 그대로.
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card edit screen steps reference', () => {
  const source = read('app/card/edit/[id].tsx');

  it('fetches mode and steps alongside the editable fields', () => {
    expect(source).toMatch(/\.select\('[^']*\bmode\b[^']*\bsteps\b[^']*'\)|\.select\('[^']*\bsteps\b[^']*\bmode\b[^']*'\)/);
  });

  it('renders CourseStepList as a read-only reference for make_course cards', () => {
    expect(source).toMatch(/import \{[^}]*CourseStepList[^}]*\} from '..\/..\/..\/components\/ui'/);
    expect(source).toMatch(/Mode === 'make_course'[\s\S]*?<CourseStepList/);
  });

  it('does not add an editable control for steps (reference only, no onChange wiring)', () => {
    const stepsBlock = source.match(/Mode === 'make_course'[\s\S]*?<CourseStepList[^/]*\/>/)?.[0] ?? '';
    expect(stepsBlock).not.toMatch(/onChange/);
  });

  it('preserves the save payload (title/summary/estimated_time/estimated_budget only)', () => {
    const payload = source.match(/\.update\(\{([\s\S]*?)\}\)/)?.[1] ?? '';
    expect(payload).toContain('title: title.trim()');
    expect(payload).toContain('summary: summary.trim()');
    expect(payload).toContain('estimated_time: time.trim()');
    expect(payload).toContain('estimated_budget: budget.trim()');
    expect(payload).not.toContain('steps:');
    expect(payload).not.toContain('mode:');
  });
});
