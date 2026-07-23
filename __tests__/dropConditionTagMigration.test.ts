import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('reactions.condition_tag 제거 마이그레이션', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260723120000_drop_reaction_condition_tag.sql'),
    'utf8',
  );

  it('컬럼을 참조하는 트리거 함수를 먼저 고친다 (순서를 어기면 반응 저장이 깨진다)', () => {
    const fnStart = sql.indexOf('create or replace function public.notify_on_reaction');
    const dropStart = sql.indexOf('drop column');
    expect(fnStart).toBeGreaterThan(-1);
    expect(dropStart).toBeGreaterThan(-1);
    expect(fnStart).toBeLessThan(dropStart);
  });

  it('알림 payload에서 condition_tag만 빼고 나머지 필드는 그대로 둔다', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.notify_on_reaction'));
    const body = fn.slice(0, fn.indexOf('$function$', fn.indexOf('$function$') + 1));
    expect(body).not.toContain('condition_tag');
    expect(body).toContain("'reaction_type', NEW.reaction_type");
    expect(body).toContain("'card_title', v_title");
    expect(body).toContain("'card_id', NEW.card_id");
  });

  it('본인 반응에는 알림을 만들지 않는 기존 가드를 유지한다', () => {
    expect(sql).toContain('if v_creator is null or v_creator = NEW.user_id then');
  });

  it('CHECK 제약과 컬럼을 함께 없앤다', () => {
    expect(sql).toMatch(/drop constraint if exists reactions_condition_tag_check/i);
    expect(sql).toMatch(/drop column if exists condition_tag/i);
  });
});
