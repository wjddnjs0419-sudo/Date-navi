import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('replace mutation compares the stable kakaoPlaceId, not the per-search candidateId', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260716050000_replace_compare_stable_place_id.sql'),
    'utf8',
  );

  it('redefines the mutation RPC so a replace is judged unchanged by place identity', () => {
    expect(sql).toContain('create or replace function public.apply_recommendation_session_mutation(');
    // The "replacement must actually change the step" guard has to use the stable Kakao place ID.
    // candidateId is renumbered from candidate_001 on every search, so the old check falsely
    // rejected any replace whose fresh search happened to reuse the target's ephemeral number.
    expect(sql).toContain("v_original_place is not distinct from v_new_step ->> 'kakaoPlaceId'");
    expect(sql).not.toContain("v_original_candidate is not distinct from v_new_step ->> 'candidateId'");
  });

  it('keeps the definer/attack-surface hardening of the previous definition', () => {
    const lower = sql.toLowerCase();
    expect(lower).toContain('security definer');
    expect(lower).toContain('set search_path = public, pg_temp');
    expect(lower).toContain('set extra_float_digits = 3');
  });
});
