import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { candidatePoolSnapshotsSchema } from '../shared/recommendation/schemas';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260727160000_candidate_pool_snapshots.sql'), 'utf8');
const contractSql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260826130000_course_pipeline_contracts.sql'), 'utf8');

describe('candidate pool snapshot persistence migration', () => {
  it('validates the attested full ranked pool before initial session storage', () => {
    expect(sql).toContain('validate_candidate_pool_snapshot');
    expect(sql).toContain("v_response -> 'candidatePool'");
    expect(sql).toContain("raise invalid_parameter_value using message = 'invalid_candidate'");
  });

  it('stores the immutable response snapshot and retains it during later mutations', () => {
    expect(sql).toContain("v_response -> 'candidatePool', 'draft'");
    expect(sql).toContain('candidate_pool = candidate_pool,');
  });

  it('accepts the provider discovery bound of 50 candidates', () => {
    const snapshots = Array.from({ length: 50 }, (_, index) => ({
      candidateId: `candidate-${index}`,
      placeIdentity: { provider: 'kakao' as const, providerPlaceId: `place-${index}` },
      category: 'meal',
      rank: index + 1,
      totalScore: 0,
      scoreBreakdown: { intent: 0, distance: 0, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
      distanceFromSearchCenterMeters: 0,
      priceAtRanking: { source: 'unknown' as const, minKRW: null, maxKRW: null },
      selectedInitially: false,
      forced: false,
      pinned: false,
      reintroducedByHistory: false,
    }));

    expect(candidatePoolSnapshotsSchema.safeParse(snapshots).success).toBe(true);
    expect(contractSql).toContain('jsonb_array_length(p_pool) not between 2 and 50');
  });

  it('preserves step ownership and permits the same physical place in separate source pools', () => {
    const base = {
      placeIdentity: { provider: 'naver' as const, providerPlaceId: 'same-place' },
      category: 'unknown',
      rank: 1,
      totalScore: 0,
      scoreBreakdown: { intent: 0, distance: 0, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
      distanceFromSearchCenterMeters: 0,
      priceAtRanking: { source: 'unknown' as const, minKRW: null, maxKRW: null },
      selectedInitially: false, forced: false, pinned: false, reintroducedByHistory: false,
      qualification: { category: 'unknown' as const, intent: 'not_required' as const, intentEvidence: [] },
    };
    expect(candidatePoolSnapshotsSchema.safeParse([
      { ...base, candidateId: 'meal-same', sourceStepId: 'meal' },
      { ...base, candidateId: 'cafe-same', sourceStepId: 'cafe', rank: 2 },
    ]).success).toBe(true);
  });
});
