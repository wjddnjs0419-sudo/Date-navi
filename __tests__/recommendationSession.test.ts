import {
  createSession,
  getSession,
  addPreviousPlaceIds,
  clearSessions,
} from '../lib/recommendationSession';
import type { Candidate } from '../lib/candidate';
import type { PlanIntent } from '../lib/intent';
import type { FeelingInput } from '../lib/ai';

const intent: PlanIntent = { purpose: 'meal', placeTypes: ['cafe'], atmosphere: [], budgetLevel: 'low', duration: '2-3h', searchQueries: ['카페'], positiveSignals: [], negativeSignals: [] };
const input: FeelingInput = { energy: 'medium', budget: 'low', distance: 'any', mood: 'comfortable', duration: '2-3h', avoid: [] };
const cands: Candidate[] = [
  { candidateId: 'candidate_001', placeId: 'p1', name: 'A', category: '카페', address: 'x', x: '1', y: '2', mapUrl: 'u', matchedQueries: [], matchedIntentSignals: [], score: 1 },
];

beforeEach(() => clearSessions());

describe('recommendationSession store', () => {
  it('createSession assigns unique deterministic ids and round-trips', () => {
    const a = createSession({ mode: 'feeling', input, intent, candidates: cands, previousPlaceIds: ['p1'] });
    const b = createSession({ mode: 'feeling', input, intent, candidates: cands, previousPlaceIds: [] });
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(getSession(a.sessionId)?.previousPlaceIds).toEqual(['p1']);
    expect(getSession(b.sessionId)?.candidates).toBe(cands);
  });

  it('getSession returns undefined for missing/undefined id', () => {
    expect(getSession(undefined)).toBeUndefined();
    expect(getSession('nope')).toBeUndefined();
  });

  it('addPreviousPlaceIds merges unique', () => {
    const s = createSession({ mode: 'feeling', input, intent, candidates: cands, previousPlaceIds: ['p1'] });
    addPreviousPlaceIds(s.sessionId, ['p1', 'p2']);
    expect(getSession(s.sessionId)?.previousPlaceIds).toEqual(['p1', 'p2']);
  });

  it('addPreviousPlaceIds on missing session is a no-op', () => {
    expect(() => addPreviousPlaceIds('nope', ['p9'])).not.toThrow();
  });
});
