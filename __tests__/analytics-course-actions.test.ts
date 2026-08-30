import {
  buildCourseBuilderStepViewedParams,
  buildCourseEditActionParams,
  buildCourseRegenerateRequestedParams,
  buildPlaceSelectedParams,
  buildOnboardingPreferencesStepViewedParams,
  type CourseBuilderStep,
  type CourseEditAction,
  type OnboardingPreferencesStep,
} from '../lib/analytics-course-actions';

describe('course action analytics payloads', () => {
  it('labels place selections with a finite context only', () => {
    expect(buildPlaceSelectedParams('course_pin')).toEqual({ selection_context: 'course_pin' });
    expect(buildPlaceSelectedParams('course_replace')).toEqual({ selection_context: 'course_replace' });
  });

  it('summarizes regeneration state without course details', () => {
    expect(buildCourseRegenerateRequestedParams([
      { locked: true },
      { locked: false },
      { locked: true },
    ])).toEqual({
      scope: 'unlocked_steps',
      locked_step_count: 2,
      step_count: 3,
    });
  });

  it('keeps course builder step analytics bounded to the five displayed steps', () => {
    const steps: readonly CourseBuilderStep[] = ['course', 'location', 'time', 'mood', 'review'];

    expect(steps.map((step) => buildCourseBuilderStepViewedParams(step))).toEqual([
      { step: 'course' },
      { step: 'location' },
      { step: 'time' },
      { step: 'mood' },
      { step: 'review' },
    ]);
  });

  it('keeps onboarding preference step analytics bounded to the four displayed steps', () => {
    const steps: readonly OnboardingPreferencesStep[] = ['preferred', 'mood', 'avoid', 'long_distance'];

    expect(steps.map((step) => buildOnboardingPreferencesStepViewedParams(step))).toEqual([
      { step: 'preferred' },
      { step: 'mood' },
      { step: 'avoid' },
      { step: 'long_distance' },
    ]);
  });

  it('keeps course edit analytics bounded to approved actions without entity data', () => {
    const actions: readonly CourseEditAction[] = ['lock', 'unlock', 'reorder', 'delete', 'replace', 'add', 'open_map'];

    for (const action of actions) {
      expect(buildCourseEditActionParams(action)).toEqual({ action });
      expect(Object.keys(buildCourseEditActionParams(action))).toEqual(['action']);
    }
  });
});
