import type { CourseDraft } from '../lib/course-draft';
import { RecommendationRequestError } from '../lib/recommend-date';
import {
  buildRecommendationRequestStartedParams,
  normalizeRecommendationRequestError,
} from '../lib/analytics-course';

const draft: CourseDraft = {
  location: null,
  steps: [
    { id: 'first', category: 'meal', pin: { kakaoPlaceId: 'secret-place', name: 'private', address: 'private' } },
    { id: 'second', category: 'cafe' },
  ],
  maxWalkingMinutes: 10,
  perPersonBudgetKRWInput: '20000',
  moods: ['romantic'],
  duration: '3h',
  additionalRequest: 'quiet place please',
};

describe('course analytics payloads', () => {
  it('summarizes course inputs without raw user or place data', () => {
    expect(buildRecommendationRequestStartedParams(draft)).toEqual({
      mode: 'make_course',
      step_count: 2,
      has_pinned_place: true,
      has_walking_limit: true,
      has_budget: true,
      has_duration: true,
      has_mood: true,
      has_additional_request: true,
    });
  });

  it('normalizes only approved recommendation error fields', () => {
    expect(normalizeRecommendationRequestError(new RecommendationRequestError(
      'COURSE_VALIDATION_FAILED',
      { failureStage: 'course_build' },
    ))).toEqual({ error_code: 'course_validation_failed', failure_stage: 'course_build' });
    expect(normalizeRecommendationRequestError(new Error('untrusted backend detail'))).toEqual({ error_code: 'unknown' });
  });
});
