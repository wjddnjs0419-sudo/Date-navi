import type { FeelingInput } from './ai';

type PickArgs = { energy: string; budget: string; distance: string; duration: string };
type FeelingArgs = { mood: string; budget: string; duration: string; freeText?: string };
type LightArgs = { duration: string };

export function buildPickInput(a: PickArgs): FeelingInput {
  return {
    energy: a.energy,
    budget: a.budget,
    distance: a.distance,
    mood: 'comfortable',
    duration: a.duration,
    avoid: [],
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
    freeText: a.freeText?.trim() || undefined,
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
  };
}

type CourseArgs = { idea: string; budget: string; duration: string };

export function buildCourseInput(a: CourseArgs): FeelingInput {
  return {
    energy: 'medium',
    budget: a.budget || 'medium',
    distance: 'any',
    mood: 'comfortable',
    duration: a.duration || '2-3h',
    avoid: [],
    freeText: a.idea.trim() || undefined,
  };
}
