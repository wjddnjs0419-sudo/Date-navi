import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// apply_recommendation_session_mutation rebuilds current_course.steps from the double-precision
// coordinate columns via jsonb_build_object. Without extra_float_digits=3 that serialization
// rounds coordinates to ~15 significant figures, while get_recommendation_session reads the same
// columns at extra_float_digits=3 (full precision). The client's strict row-vs-course equality
// (mapRecommendationSessionPayload) then rejects any step whose coordinate needs 16+ figures,
// breaking every edit after a mutation. Same class as the session AM get_recommendation_session fix.
describe('apply_recommendation_session_mutation float precision migration', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260716030000_mutation_float_precision.sql'),
    'utf8',
  );

  it('pins the mutation RPC to extra_float_digits=3, matching get_recommendation_session', () => {
    expect(sql).toMatch(/alter function public\.apply_recommendation_session_mutation\(text, text, jsonb\) set extra_float_digits = 3/i);
  });

  it('repairs already-persisted current_course coordinates at reduced precision', () => {
    expect(sql).toMatch(/set local extra_float_digits = 3/i);
    expect(sql).toMatch(/update public\.recommendation_sessions/i);
    expect(sql).toContain("jsonb_set");
    expect(sql).toContain("'latitude', to_jsonb(cs.latitude)");
    expect(sql).toContain("'longitude', to_jsonb(cs.longitude)");
  });
});
