// __tests__/dateMemoriesRatingMigration.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('date_memories rating 컬럼 마이그레이션', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260722100000_date_memories_add_rating.sql'),
    'utf8',
  ).toLowerCase();

  it('1~5점 범위의 rating 정수 컬럼을 추가한다', () => {
    expect(sql).toContain('alter table public.date_memories');
    expect(sql).toContain('add column if not exists rating integer');
    expect(sql).toContain('check (rating is null or (rating >= 1 and rating <= 5))');
  });
});
