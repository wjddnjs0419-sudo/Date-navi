import type { FeelingInput, GeoCoords } from './ai';
import type { RecommendationLocation } from '../shared/recommendation/contracts';
import {
  buildStructuredCourseInput,
  type CourseCategory,
  type CourseDraft,
} from './course-draft';

const norm = (v?: string) => v?.trim() || undefined;

type FeelingArgs = { mood: string; duration?: string; freeText?: string; location?: string; coords?: GeoCoords };

export function buildFeelingInput(a: FeelingArgs): FeelingInput {
  return {
    energy: 'medium',
    distance: 'any',
    mood: a.mood,
    duration: norm(a.duration),
    avoid: [],
    freeText: norm(a.freeText),
    location: a.coords ? undefined : norm(a.location),
    coords: a.coords,
  };
}

type CourseArgs = {
  idea?: string;
  additionalRequest?: string;
  duration?: string;
  location?: string;
  coords?: GeoCoords;
  recommendationLocation?: RecommendationLocation;
  moods?: readonly string[];
  draft?: CourseDraft;
  categoryLabels?: Record<CourseCategory, string>;
};

export function buildCourseInput(a: CourseArgs): FeelingInput {
  const recommendationLocation = a.draft?.location ?? a.recommendationLocation;
  const coords = recommendationLocation
    ? { x: String(recommendationLocation.longitude), y: String(recommendationLocation.latitude) }
    : a.coords;
  const moods = a.draft?.moods ?? a.moods ?? [];
  const additionalRequest = a.draft?.additionalRequest ?? a.additionalRequest ?? a.idea;
  const courseDraft = a.draft && a.categoryLabels
    ? buildStructuredCourseInput(a.draft, a.categoryLabels)
    : undefined;
  return {
    energy: 'medium',
    distance: 'any',
    mood: moods[0] ?? 'comfortable',
    duration: norm(a.draft?.duration ?? a.duration),
    avoid: [],
    freeText: norm(additionalRequest),
    location: coords ? undefined : norm(a.location),
    coords,
    recommendationLocation,
    courseDraft,
  };
}
