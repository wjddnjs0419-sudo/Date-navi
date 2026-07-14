import type { RecommendationCourseStep } from '../shared/recommendation/contracts';

export type CourseEditErrorCode =
  | 'missing' | 'unauthorized' | 'stale' | 'confirmed' | 'min_steps' | 'max_steps'
  | 'locked' | 'duplicate' | 'invalid_order' | 'invalid_candidate' | 'constraint_violation'
  | 'operation_failed';

export class CourseEditError extends Error {
  constructor(public readonly code: CourseEditErrorCode) {
    super(code);
    this.name = 'CourseEditError';
  }
}

export type EditableCourseState = {
  status: 'draft' | 'confirmed' | 'archived' | 'failed';
  steps: readonly RecommendationCourseStep[];
};

export type CourseEditAction =
  | { type: 'setLock'; stepId: string; locked: boolean }
  | { type: 'reorder'; stepIds: readonly string[] }
  | { type: 'replace'; stepId: string; step: RecommendationCourseStep }
  | { type: 'add'; step: RecommendationCourseStep }
  | { type: 'delete'; stepId: string }
  | { type: 'confirm' };

const fail = (code: CourseEditErrorCode): never => { throw new CourseEditError(code); };

function normalized(steps: readonly RecommendationCourseStep[]): RecommendationCourseStep[] {
  if (steps.length < 2) fail('min_steps');
  if (steps.length > 4) fail('max_steps');
  const ids = steps.map((step) => step.stepId);
  const candidates = steps.map((step) => step.candidateId);
  const places = steps.map((step) => step.kakaoPlaceId);
  if (new Set(ids).size !== ids.length || new Set(candidates).size !== candidates.length || new Set(places).size !== places.length) {
    fail('duplicate');
  }
  return steps.map((step, index) => ({ ...step, order: index + 1 }));
}

export function applyCourseEdit(state: EditableCourseState, action: CourseEditAction): EditableCourseState {
  if (state.status === 'confirmed' && action.type !== 'confirm') fail('confirmed');
  if (action.type === 'confirm') return { ...state, status: 'confirmed', steps: normalized(state.steps) };
  if (action.type === 'setLock') {
    const index = state.steps.findIndex((step) => step.stepId === action.stepId);
    if (index < 0) fail('missing');
    const steps = state.steps.map((step, i) => i === index ? { ...step, locked: action.locked } : step);
    return { ...state, steps: normalized(steps) };
  }
  if (action.type === 'reorder') {
    if (action.stepIds.length !== state.steps.length || new Set(action.stepIds).size !== action.stepIds.length) fail('invalid_order');
    const lookup = new Map(state.steps.map((step) => [step.stepId, step]));
    const steps = action.stepIds.map((id) => lookup.get(id));
    if (steps.some((step) => !step)) fail('invalid_order');
    return { ...state, steps: normalized(steps as RecommendationCourseStep[]) };
  }
  if (action.type === 'replace') {
    const index = state.steps.findIndex((step) => step.stepId === action.stepId);
    if (index < 0) fail('missing');
    if (state.steps[index].locked) fail('locked');
    if (action.step.stepId !== action.stepId) fail('invalid_candidate');
    const steps = state.steps.map((step, i) => i === index ? { ...action.step, locked: false } : step);
    return { ...state, steps: normalized(steps) };
  }
  if (action.type === 'add') {
    if (state.steps.length >= 4) fail('max_steps');
    return { ...state, steps: normalized([...state.steps, action.step]) };
  }
  const index = state.steps.findIndex((step) => step.stepId === action.stepId);
  if (index < 0) fail('missing');
  if (state.steps[index].locked) fail('locked');
  if (state.steps.length <= 2) fail('min_steps');
  return { ...state, steps: normalized(state.steps.filter((step) => step.stepId !== action.stepId)) };
}
