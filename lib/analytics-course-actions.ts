export type PlaceSelectionContext = 'course_pin' | 'course_replace';

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
