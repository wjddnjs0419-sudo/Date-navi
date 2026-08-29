import {
  COURSE_CATEGORIES,
  COURSE_MOODS,
  buildStructuredCourseInput,
  courseDraftReducer,
  createInitialCourseDraft,
  getQuickMeetingTime,
  parseCoursePreferences,
  parseDurationHours,
  parsePerPersonBudgetKRW,
  validateCourseDraft,
  type CourseCategory,
  type CourseDraft,
} from '../lib/course-draft';
import { buildCourseInput } from '../lib/modeForm';
import type { RecommendationLocation } from '../shared/recommendation/contracts';

const location: RecommendationLocation = {
  source: 'kakao', kakaoPlaceId: 'origin-1', label: '서울숲',
  address: '서울 성동구 성수동1가', latitude: 37.5444, longitude: 127.0374, kind: 'landmark',
};

const categoryLabels: Record<CourseCategory, string> = {
  meal: '식사', cafe: '카페', drinks: '술집', activity: '활동', culture: '문화', walk: '산책', ai_decide: 'AI가 결정',
};

function idFactory(...ids: string[]) {
  let index = 0;
  return () => ids[index++];
}

function validDraft(): CourseDraft {
  let draft = createInitialCourseDraft(idFactory('step-a', 'step-b', 'step-c'));
  draft = courseDraftReducer(draft, { type: 'toggleCategory', category: 'meal', stepId: 'step-a' });
  draft = courseDraftReducer(draft, { type: 'toggleCategory', category: 'cafe', stepId: 'step-b' });
  return {
    ...draft,
    location,
    meetingTime: { kind: 'custom', startsAt: '2026-08-29T18:30:00.000Z' },
  };
}

describe('redesigned structured course draft', () => {
  it('starts with no selected categories so the first screen is neutral', () => {
    expect(COURSE_CATEGORIES).toEqual(['meal', 'cafe', 'drinks', 'activity', 'culture', 'walk', 'ai_decide']);
    expect(COURSE_MOODS).toEqual(['emotional', 'quiet', 'lively', 'romantic', 'comfortable', 'novel']);
    expect(createInitialCourseDraft(idFactory('step-a'))).toMatchObject({
      steps: [],
      meetingTime: undefined,
    });
  });

  it('toggles categories in selection order and enforces the four-step maximum', () => {
    let draft = createInitialCourseDraft(idFactory('meal', 'cafe', 'walk', 'culture', 'activity'));
    draft = courseDraftReducer(draft, { type: 'toggleCategory', category: 'meal', stepId: 'meal' });
    draft = courseDraftReducer(draft, { type: 'toggleCategory', category: 'cafe', stepId: 'cafe' });
    draft = courseDraftReducer(draft, { type: 'toggleCategory', category: 'walk', stepId: 'walk' });
    draft = courseDraftReducer(draft, { type: 'toggleCategory', category: 'culture', stepId: 'culture' });
    draft = courseDraftReducer(draft, { type: 'toggleCategory', category: 'activity', stepId: 'activity' });

    expect(draft.steps.map((step) => step.category)).toEqual(['meal', 'cafe', 'walk', 'culture']);

    draft = courseDraftReducer(draft, { type: 'toggleCategory', category: 'cafe', stepId: 'cafe' });
    expect(draft.steps.map((step) => step.category)).toEqual(['meal', 'walk', 'culture']);
  });

  it('removes the selected preference when Anything is chosen', () => {
    let draft = validDraft();
    draft = courseDraftReducer(draft, { type: 'setStepPreference', stepId: 'step-a', tag: '한식' });
    expect(draft.steps[0].intentTags).toEqual(['한식']);

    draft = courseDraftReducer(draft, { type: 'setStepPreference', stepId: 'step-a', tag: undefined });
    expect(draft.steps[0]).not.toHaveProperty('intentTags');
  });

  it('keeps meeting time independent from total duration', () => {
    let draft = validDraft();
    draft = courseDraftReducer(draft, { type: 'setDuration', duration: '2-3h' });
    draft = courseDraftReducer(draft, { type: 'setMeetingTime', meetingTime: { kind: 'tonight' } });

    expect(draft.duration).toBe('2-3h');
    expect(draft.meetingTime).toEqual({ kind: 'tonight' });
    expect(buildStructuredCourseInput(draft, categoryLabels)).toMatchObject({
      duration: '2-3h', meetingTime: { kind: 'tonight' },
    });
  });

  it('creates deterministic quick meeting times from the supplied clock', () => {
    const now = new Date('2026-08-25T10:15:00.000Z');
    expect(getQuickMeetingTime('today-18', now)).toEqual({ kind: 'custom', startsAt: new Date(2026, 7, 25, 18).toISOString() });
    expect(getQuickMeetingTime('weekend-afternoon', now)).toEqual({ kind: 'custom', startsAt: new Date(2026, 7, 29, 15).toISOString() });
  });

  it('requires location, at least two categories, and meeting time before generation', () => {
    const initial = createInitialCourseDraft(idFactory('step-a'));
    const result = validateCourseDraft(initial);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      { code: 'location_required' }, { code: 'step_count_invalid' }, { code: 'meeting_time_required' },
    ]));
  });

  it('serializes the redesigned draft without parsing supplementary text', () => {
    const draft = validDraft();
    const input = buildStructuredCourseInput({
      ...draft, additionalRequest: '초밥 말고 라멘',
      steps: [{ ...draft.steps[0], intentTags: ['라멘'] }, draft.steps[1]],
    }, categoryLabels);

    expect(input).toMatchObject({
      additionalRequest: '초밥 말고 라멘',
      meetingTime: { kind: 'custom', startsAt: '2026-08-29T18:30:00.000Z' },
      courseSteps: [{ id: 'step-a', intentTags: ['라멘'] }, { id: 'step-b' }],
    });
    expect('parsedPreferences' in input).toBe(false);
    expect(validateCourseDraft({ ...draft, steps: [draft.steps[0], draft.steps[1]] }).valid).toBe(true);
  });

  it('preserves legacy duration mapping while carrying the structured course draft', () => {
    const draft = { ...validDraft(), moods: ['lively', 'romantic'] as const, duration: 'half_day' };
    const input = buildCourseInput({ draft, categoryLabels });
    expect(input.recommendationLocation).toEqual(location);
    expect(input.duration).toBe('half_day');
    expect(input.courseDraft).toEqual(buildStructuredCourseInput(draft, categoryLabels));
  });
});

describe('existing course draft parsers', () => {
  it('keeps deterministic exclusions and soft preferences', () => {
    expect(parseCoursePreferences('카페 빼줘. 조용한 실내에서 사진 찍고 싶어')).toEqual({
      excludedCategories: ['cafe'], quietPreferred: true, photoFriendlyPreferred: true, indoorOnly: true,
    });
  });

  it.each([['2시간', 2], ['2-3 hours', 2], ['', undefined], [undefined, undefined]])(
    'parses leading hours from duration text %s', (value, expected) => expect(parseDurationHours(value)).toBe(expected),
  );

  it.each([['50,000', 50000], ['30000', 30000], ['', undefined]])(
    'parses per-person budget %s', (value, expected) => expect(parsePerPersonBudgetKRW(value)).toBe(expected),
  );
});
