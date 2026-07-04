import type { FeelingInput, GeoCoords } from './ai';

const norm = (v?: string) => v?.trim() || undefined;

type PickArgs = { energy: string; budget: string; distance: string; duration: string; location?: string; coords?: GeoCoords };
type FeelingArgs = { mood: string; budget: string; duration: string; freeText?: string; location?: string; coords?: GeoCoords };
type LightArgs = { duration: string; location?: string; coords?: GeoCoords };

export function buildPickInput(a: PickArgs): FeelingInput {
  return {
    energy: a.energy,
    budget: a.budget,
    distance: a.distance,
    mood: 'comfortable',
    duration: a.duration,
    avoid: [],
    location: norm(a.location),
    coords: a.coords,
  };
}

export function buildFeelingInput(a: FeelingArgs): FeelingInput {
  return {
    energy: 'medium',
    budget: a.budget,
    distance: 'any',
    mood: a.mood,
    duration: a.duration,
    avoid: [],
    freeText: norm(a.freeText),
    location: norm(a.location),
    coords: a.coords,
  };
}

export function buildLightInput(a: LightArgs): FeelingInput {
  return {
    energy: 'low',
    budget: 'low',
    distance: 'near',
    mood: 'comfortable',
    duration: a.duration,
    avoid: [],
    location: norm(a.location),
    coords: a.coords,
  };
}

type CourseArgs = { idea: string; budget: string; duration: string; location?: string; coords?: GeoCoords };

export function buildCourseInput(a: CourseArgs): FeelingInput {
  return {
    energy: 'medium',
    budget: a.budget || 'medium',
    distance: 'any',
    mood: 'comfortable',
    duration: a.duration || '2-3h',
    avoid: [],
    freeText: a.idea.trim() || undefined,
    location: norm(a.location),
    coords: a.coords,
  };
}
