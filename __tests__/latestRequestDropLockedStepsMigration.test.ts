import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Root cause of the "lock / add / replace / regenerate all break once a step is
// locked" bug: apply_recommendation_session_mutation persisted latest_request.lockedSteps
// in an abbreviated {stepId,candidateId,kakaoPlaceId} shape that no longer satisfies
// recommendationRequestSchema. Every reader of latest_request (client hydration AND the
// replacement-candidates edge) then rejected the whole session. The per-step `locked`
// column is the authoritative lock state and the client rebuilds lockedSteps outbound, so
// latest_request must never carry lockedSteps at all.
describe('drop lockedSteps from persisted latest_request migration', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260716020000_latest_request_drop_locked_steps.sql'),
    'utf8',
  );

  it('backfills existing sessions by removing lockedSteps from latest_request', () => {
    expect(sql).toMatch(/update\s+public\.recommendation_sessions\s+set\s+latest_request\s*=\s*latest_request\s*-\s*'lockedSteps'/i);
    expect(sql).toMatch(/where\s+latest_request\s*\?\s*'lockedSteps'/i);
  });

  it('redefines apply_recommendation_session_mutation so persist never re-adds lockedSteps', () => {
    expect(sql).toContain('create or replace function public.apply_recommendation_session_mutation');
    // The persist clause must unconditionally strip lockedSteps ...
    expect(sql).toMatch(/latest_request = jsonb_set\(coalesce\(v_request, latest_request, original_request\), '\{courseSteps\}', v_request_steps\) - 'lockedSteps'/);
    // ... and must NOT re-introduce the old conditional that wrote v_locked_steps back in.
    expect(sql).not.toContain("'{lockedSteps}', v_locked_steps");
  });
});
