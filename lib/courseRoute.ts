import type { Candidate } from './candidate';
import type { GeoCoords } from './ai';
import type { PlanIntent } from './intent';

type Point = { x: string; y: string };

const toRad = (v: number): number => (v * Math.PI) / 180;

export function distanceMeters(a: Point, b: Point): number {
  const ax = Number(a.x);
  const ay = Number(a.y);
  const bx = Number(b.x);
  const by = Number(b.y);
  if (![ax, ay, bx, by].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const earth = 6371000;
  const dLat = toRad(by - ay);
  const dLon = toRad(bx - ax);
  const lat1 = toRad(ay);
  const lat2 = toRad(by);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

function candidateMatchesAnchor(c: Candidate, anchor: string): boolean {
  const haystack = `${c.name} ${c.category}`;
  return haystack.includes(anchor) || c.matchedQueries.includes(anchor);
}

export function routeDistanceMeters(route: Candidate[], origin?: GeoCoords): number {
  if (route.length <= 1 && !origin) return 0;
  let total = 0;
  let prev: Point | undefined = origin;
  for (const c of route) {
    if (prev) total += distanceMeters(prev, c);
    prev = c;
  }
  return total;
}

function combinations<T>(buckets: T[][], limit = 300): T[][] {
  const out: T[][] = [];
  const walk = (idx: number, acc: T[]) => {
    if (out.length >= limit) return;
    if (idx >= buckets.length) {
      out.push([...acc]);
      return;
    }
    for (const item of buckets[idx]) {
      acc.push(item);
      walk(idx + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

export function orderCandidatesForCourseRoute(
  candidates: Candidate[],
  intent: PlanIntent,
  origin?: GeoCoords,
): Candidate[] {
  const anchors = intent.courseAnchors ?? [];
  if (anchors.length < 2) return candidates;

  const buckets = anchors.map(anchor =>
    candidates
      .filter(c => candidateMatchesAnchor(c, anchor))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6),
  );
  if (buckets.some(b => b.length === 0)) return candidates;

  const combos = combinations(buckets)
    .filter(combo => new Set(combo.map(c => c.placeId)).size === combo.length)
    .map(combo => ({
      combo,
      distance: routeDistanceMeters(combo, origin),
      score: combo.reduce((sum, c) => sum + c.score, 0),
    }))
    .sort((a, b) => a.distance - b.distance || b.score - a.score);

  const best = combos[0]?.combo;
  if (!best) return candidates;

  const chosen = new Set(best.map(c => c.placeId));
  return [...best, ...candidates.filter(c => !chosen.has(c.placeId))];
}
