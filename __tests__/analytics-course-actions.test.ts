import {
  buildCourseRegenerateRequestedParams,
  buildPlaceSelectedParams,
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
});
