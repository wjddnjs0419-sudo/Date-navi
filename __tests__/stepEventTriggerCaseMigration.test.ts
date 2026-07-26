import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const migrationsDir = join(root, 'supabase/migrations');

describe('step event trigger case fix', () => {
  const migration = readFileSync(
    join(migrationsDir, '20260726120000_fix_step_event_trigger_tg_op_case.sql'),
    'utf8',
  );
  const canonical = readFileSync(join(root, 'docs/supabase-schema.sql'), 'utf8');

  it('compares TG_OP against the uppercase values Postgres actually supplies', () => {
    expect(migration).toContain("tg_op = 'INSERT'");
    expect(migration).toContain("tg_op = 'UPDATE'");
    expect(migration).toContain("tg_op = 'DELETE'");
  });

  // place_deleted는 부모 스텝이 사라진 뒤에 기록된다. 복합 FK가 cascade로 남아 있으면
  // after delete는 FK 위반으로 삭제 자체를 깨뜨리고, before delete로 옮겨도 cascade가
  // 방금 넣은 행을 지운다. 세션 FK만 남기는 것이 유일한 해법이다.
  it('drops the composite step foreign key that makes deletion events impossible', () => {
    expect(migration).toContain('drop constraint if exists recommendation_step_events_session_id_step_id_fkey');
    const stepEventsTable = canonical.match(
      /create table if not exists public\.recommendation_step_events \(([\s\S]*?)\n\);/,
    )?.[1];
    expect(stepEventsTable).toBeDefined();
    expect(stepEventsTable).not.toContain('references public.recommendation_course_steps');
    expect(stepEventsTable).toContain('references public.recommendation_sessions(id) on delete cascade');
  });

  // 트리거가 살아난 뒤로는 이벤트 기록 실패가 곧 코스 생성 실패다. actor_user_id는
  // not null이므로 auth.uid()가 없는 컨텍스트(서비스 롤 등)에서도 세션 소유자로 채운다.
  it('never lets a missing auth.uid() abort the step write it is auditing', () => {
    expect(migration).toContain('coalesce(auth.uid()');
    expect(migration).toContain('select owner_user_id from public.recommendation_sessions where id = p_session_id');
    expect(canonical).toContain('coalesce(auth.uid()');
  });

  it('never compares tg_op against a lowercase literal in the live schema', () => {
    const offenders = [...canonical.matchAll(/tg_op\s*(?:=|in)\s*\(?\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(offenders).toEqual([]);
  });

  it('leaves no lowercase tg_op comparison in the newest definition of any migration', () => {
    const latestByFile = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => ({ file, sql: readFileSync(join(migrationsDir, file), 'utf8') }));
    // 최신 마이그레이션이 이전 정의를 대체하므로, 마지막으로 트리거를 재정의한 파일만 검사한다.
    const lastTriggerDefinition = latestByFile
      .filter((entry) => entry.sql.includes('recommendation_course_step_event_trigger()'))
      .at(-1);
    expect(lastTriggerDefinition).toBeDefined();
    const offenders = [...lastTriggerDefinition!.sql.matchAll(/tg_op\s*(?:=|in)\s*\(?\s*'([a-z_]+)'/g)];
    expect(offenders.map((m) => m[1])).toEqual([]);
  });
});
