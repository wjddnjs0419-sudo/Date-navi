import { distanceMeters, orderCandidatesForCourseRoute, routeDistanceMeters } from '../lib/courseRoute';
import type { Candidate } from '../lib/candidate';
import type { PlanIntent } from '../lib/intent';

const cand = (over: Partial<Candidate>): Candidate => ({
  candidateId: 'candidate_001',
  placeId: 'p1',
  name: '장소',
  category: '카페',
  address: 'addr',
  x: '127.0000',
  y: '37.0000',
  mapUrl: 'url',
  matchedQueries: [],
  matchedIntentSignals: [],
  score: 5,
  ...over,
});

const intent: PlanIntent = {
  purpose: 'general_date',
  placeTypes: ['cafe', 'restaurant'],
  atmosphere: [],
  searchQueries: ['카페', '삼겹살', '술집'],
  courseAnchors: ['카페', '삼겹살', '술집'],
  positiveSignals: [],
  negativeSignals: [],
};

describe('courseRoute', () => {
  it('distanceMeters는 가까운 좌표가 먼 좌표보다 작다', () => {
    const near = distanceMeters({ x: '127.0000', y: '37.0000' }, { x: '127.0010', y: '37.0000' });
    const far = distanceMeters({ x: '127.0000', y: '37.0000' }, { x: '127.0500', y: '37.0000' });
    expect(near).toBeLessThan(far);
  });

  it('routeDistanceMeters는 origin에서 순서대로 이동한 거리를 합산한다', () => {
    const route = [
      cand({ x: '127.0010', y: '37.0000' }),
      cand({ x: '127.0020', y: '37.0000' }),
    ];
    expect(routeDistanceMeters(route, { x: '127.0000', y: '37.0000' })).toBeGreaterThan(0);
  });

  it('ordered anchors를 만족하는 후보 중 동선이 짧은 조합을 앞에 둔다', () => {
    const candidates = [
      cand({ candidateId: 'candidate_001', placeId: 'cafe', name: '집앞 카페', category: '카페', x: '127.0005', matchedQueries: ['카페'], score: 5 }),
      cand({ candidateId: 'candidate_002', placeId: 'pork_far', name: '먼 삼겹살', category: '음식점', x: '127.0500', matchedQueries: ['삼겹살'], score: 10 }),
      cand({ candidateId: 'candidate_003', placeId: 'bar', name: '집앞 술집', category: '술집', x: '127.0010', matchedQueries: ['술집'], score: 5 }),
      cand({ candidateId: 'candidate_004', placeId: 'pork_near', name: '근처 삼겹살', category: '음식점', x: '127.0015', matchedQueries: ['삼겹살'], score: 3 }),
    ];
    const ordered = orderCandidatesForCourseRoute(candidates, intent, { x: '127.0000', y: '37.0000' });
    expect(ordered.slice(0, 3).map(c => c.placeId)).toEqual(['cafe', 'pork_near', 'bar']);
  });
});
