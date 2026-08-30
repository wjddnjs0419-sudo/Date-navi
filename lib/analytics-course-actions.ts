export type PlaceSelectionContext = 'course_pin' | 'course_replace';
export type CourseBuilderStep = 'course' | 'location' | 'time' | 'mood' | 'review';
export type OnboardingPreferencesStep = 'preferred' | 'mood' | 'avoid' | 'long_distance';
export type CourseEditAction = 'lock' | 'unlock' | 'reorder' | 'delete' | 'replace' | 'add' | 'open_map';

export function buildCourseBuilderStepViewedParams(step: CourseBuilderStep) {
  return { step };
}

export function buildOnboardingPreferencesStepViewedParams(step: OnboardingPreferencesStep) {
  return { step };
}

export function buildCourseEditActionParams(action: CourseEditAction) {
  return { action };
}

export function buildPlaceSelectedParams(selectionContext: PlaceSelectionContext) {
  return { selection_context: selectionContext };
}

export function buildCourseRegenerateRequestedParams(steps: readonly { locked: boolean }[]) {
  return {
    scope: 'unlocked_steps' as const,
    locked_step_count: steps.filter((step) => step.locked).length,
    step_count: steps.length,
  };
}
