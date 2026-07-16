import type { RecommendationCourseStep } from './contracts.ts';

export type ReplacementCandidateSource = {
  candidateId: string;
  kakaoPlaceId: string;
  name: string;
  address: string;
  roadAddress: string;
  mapUrl: string;
  latitude: number;
  longitude: number;
  score: number;
};

export type ReplacementCandidate = ReplacementCandidateSource & {
  contextScore: number;
};

const distance = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLatitude = radians(b.latitude - a.latitude);
  const deltaLongitude = radians(b.longitude - a.longitude);
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
};

const CURATION_POOL_SIZE = 30;

export function rankReplacementCandidates(input: {
  target: RecommendationCourseStep;
  previous?: RecommendationCourseStep;
  next?: RecommendationCourseStep;
  existingKakaoPlaceIds: readonly string[];
  candidates: readonly ReplacementCandidateSource[];
  maxWalkingMinutes?: number;
}): { top: ReplacementCandidate[]; additional: ReplacementCandidate[]; pool: ReplacementCandidate[] } {
  const existing = new Set(input.existingKakaoPlaceIds);
  const walkingBudget = input.maxWalkingMinutes === undefined ? undefined : input.maxWalkingMinutes * 80;
  const pool = input.candidates
    .filter((candidate) => !existing.has(candidate.kakaoPlaceId))
    .filter((candidate) => {
      if (walkingBudget === undefined) return true;
      const neighbourDistances = [input.previous, input.next]
        .filter((step): step is RecommendationCourseStep => Boolean(step))
        .map((step) => distance(candidate, step));
      return neighbourDistances.every((value) => value <= walkingBudget);
    })
    .map((candidate) => {
      const neighbourDistance = [input.previous, input.next]
        .filter((step): step is RecommendationCourseStep => Boolean(step))
        .reduce((sum, step) => sum + distance(candidate, step), 0);
      return { ...candidate, contextScore: candidate.score - neighbourDistance / 100 };
    })
    .sort((a, b) => b.contextScore - a.contextScore || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId))
    .slice(0, CURATION_POOL_SIZE);
  return { top: pool.slice(0, 3), additional: pool.slice(3, 15), pool };
}

const CURATED_SELECTION_MAX = 10;

export function selectCuratedReplacementCandidates(
  pool: readonly ReplacementCandidate[],
  rawSelection: unknown,
): { top: ReplacementCandidate[]; additional: ReplacementCandidate[] } | null {
  if (!rawSelection || typeof rawSelection !== 'object') return null;
  const candidateIds = (rawSelection as { candidateIds?: unknown }).candidateIds;
  if (!Array.isArray(candidateIds)) return null;

  const byId = new Map(pool.map((candidate) => [candidate.candidateId, candidate]));
  const seen = new Set<string>();
  const curated: ReplacementCandidate[] = [];
  for (const rawId of candidateIds) {
    if (curated.length === CURATED_SELECTION_MAX) break;
    if (typeof rawId !== 'string') continue;
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    const candidate = byId.get(id);
    if (!candidate) continue;
    seen.add(id);
    curated.push(candidate);
  }
  if (curated.length === 0) return null;
  return { top: curated.slice(0, 3), additional: curated.slice(3) };
}

export const buildNaverSearchUrl = (placeName: string) => (
  `https://m.search.naver.com/search.naver?query=${encodeURIComponent(placeName)}`
);

export const buildKakaoMapUrl = (place: Pick<ReplacementCandidateSource, 'kakaoPlaceId' | 'mapUrl'>) => (
  place.mapUrl || `https://place.map.kakao.com/${encodeURIComponent(place.kakaoPlaceId)}`
);
