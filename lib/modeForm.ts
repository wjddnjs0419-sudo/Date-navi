import type { FeelingInput, GeoCoords } from './ai';

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

type CourseArgs = { idea: string; duration?: string; location?: string; coords?: GeoCoords };

export function buildCourseInput(a: CourseArgs): FeelingInput {
  return {
    energy: 'medium',
    distance: 'any',
    mood: 'comfortable',
    duration: norm(a.duration),
    avoid: [],
    freeText: a.idea.trim() || undefined,
    location: a.coords ? undefined : norm(a.location),
    coords: a.coords,
  };
}
