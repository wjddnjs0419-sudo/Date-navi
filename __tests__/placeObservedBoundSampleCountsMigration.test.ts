import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 임계치는 "구간을 만든 답변 수"에 걸려야 한다. 전체 응답 수로 세면 보통(2) 답변이
// 비쌈(3) 1건을 통과시켜, 한 사람의 앵커가 하한이 된다.
describe('관측 구간 경계별 표본 수 마이그레이션', () => {
  const root = join(__dirname, '..');
  const migration = readFileSync(
    join(root, 'supabase/migrations/20260727140000_place_observed_bound_sample_counts.sql'),
    'utf8',
  );
  const canonical = readFileSync(join(root, 'docs/supabase-schema.sql'), 'utf8');

  it.each([['migration', () => migration], ['canonical', () => canonical]])(
    '%s: 경계별 표본 수 컬럼이 존재한다', (_label, sql) => {
      expect(sql()).toContain('observed_min_sample_count');
      expect(sql()).toContain('observed_max_sample_count');
    });

  it('재계산 함수가 하한/상한 배열 길이를 각 경계의 표본 수로 기록한다', () => {
    expect(migration).toContain('create or replace function public.recompute_place_observed_price');
    expect(migration).toContain("coalesce(array_length(lowers, 1), 0)");
    expect(migration).toContain("coalesce(array_length(uppers, 1), 0)");
    expect(migration).toContain('observed_min_sample_count =');
    expect(migration).toContain('observed_max_sample_count =');
  });

  it('구간 계산 규칙은 그대로다 — 보간 백분위를 도입하지 않는다', () => {
    expect(migration).not.toContain('percentile_cont');
    expect(migration).toContain("lowers[floor((array_length(lowers, 1) - 1) * 0.75)::integer + 1]");
    expect(migration).toContain("uppers[ceil((array_length(uppers, 1) - 1) * 0.25)::integer + 1]");
  });

  it('기존 행을 재계산해 새 컬럼을 채운다 — 0으로 남으면 관측이 영구히 무시된다', () => {
    expect(migration).toMatch(/recompute_place_observed_price\(\s*\w+\s*\)[\s\S]*?from public\.places/);
  });

  it('함수는 서비스 롤 전용을 유지한다', () => {
    expect(migration).toContain('revoke all on function public.recompute_place_observed_price(text) from public');
  });
});
