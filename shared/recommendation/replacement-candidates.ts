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

export function rankReplacementCandidates(input: {
  target: RecommendationCourseStep;
  previous?: RecommendationCourseStep;
  next?: RecommendationCourseStep;
  existingKakaoPlaceIds: readonly string[];
  candidates: readonly ReplacementCandidateSource[];
  maxWalkingMinutes?: number;
}): { top: ReplacementCandidate[]; additional: ReplacementCandidate[] } {
  const existing = new Set(input.existingKakaoPlaceIds);
  const walkingBudget = input.maxWalkingMinutes === undefined ? undefined : input.maxWalkingMinutes * 80;
  const ranked = input.candidates
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
    .slice(0, 15);
  return { top: ranked.slice(0, 3), additional: ranked.slice(3) };
}

export const buildNaverSearchUrl = (placeName: string) => (
  `https://m.search.naver.com/search.naver?query=${encodeURIComponent(placeName)}`
);

export const buildKakaoMapUrl = (place: Pick<ReplacementCandidateSource, 'kakaoPlaceId' | 'mapUrl'>) => (
  place.mapUrl || `https://place.map.kakao.com/${encodeURIComponent(place.kakaoPlaceId)}`
);
