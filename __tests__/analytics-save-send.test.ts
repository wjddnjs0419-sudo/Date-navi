import {
  buildCourseSavedParams,
  buildProposalSentParams,
  shouldTrackProposalSent,
} from '../lib/analytics-course-save';

describe('save and send analytics payloads', () => {
  it('summarizes an explicit course save without the title', () => {
    expect(buildCourseSavedParams(3, true)).toEqual({
      mode: 'make_course',
      step_count: 3,
      title_customized: true,
    });
  });

  it('tracks only in-app sends initiated by the structured course result', () => {
    expect(shouldTrackProposalSent('course_recommendation_result')).toBe(true);
    expect(shouldTrackProposalSent('legacy_recommendation_result')).toBe(false);
    expect(shouldTrackProposalSent(undefined)).toBe(false);
    expect(buildProposalSentParams()).toEqual({
      send_method: 'in_app',
      source_screen: 'course_recommendation_result',
    });
  });
});
