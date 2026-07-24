import {
  COURSE_CATEGORIES,
  COURSE_MOODS,
  buildStructuredCourseInput,
  courseDraftReducer,
  createInitialCourseDraft,
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
  source: 'kakao',
  kakaoPlaceId: 'origin-1',
  label: '서울숲',
  address: '서울 성동구 성수동1가',
  latitude: 37.5444,
  longitude: 127.0374,
  kind: 'landmark',
};

const categoryLabels: Record<CourseCategory, string> = {
  meal: '식사',
  cafe: '카페',
  drinks: '술집',
  activity: '활동',
  culture: '문화',
  walk: '산책',
  ai_decide: 'AI가 결정',
};

function idFactory(...ids: string[]) {
  let index = 0;
  return () => ids[index++];
}

describe('structured course draft', () => {
  it('uses stable enums and creates two uniquely identified default steps', () => {
    expect(COURSE_CATEGORIES).toEqual(['meal', 'cafe', 'drinks', 'activity', 'culture', 'walk', 'ai_decide']);
    expect(COURSE_MOODS).toEqual(['comfortable', 'lively', 'romantic', 'quiet', 'novel']);

    const draft = createInitialCourseDraft(idFactory('step-a', 'step-b'));

    expect(draft.steps).toEqual([
      { id: 'step-a', category: 'meal' },
      { id: 'step-b', category: 'cafe' },
    ]);
  });

  it('adds up to four steps, refuses duplicate IDs, and never removes below two', () => {
    let draft = createInitialCourseDraft(idFactory('step-a', 'step-b'));
    draft = courseDraftReducer(draft, { type: 'addStep', step: { id: 'step-c', category: 'activity' } });
    draft = courseDraftReducer(draft, { type: 'addStep', step: { id: 'step-c', category: 'walk' } });
    draft = courseDraftReducer(draft, { type: 'addStep', step: { id: 'step-d', category: 'culture' } });
    draft = courseDraftReducer(draft, { type: 'addStep', step: { id: 'step-e', category: 'drinks' } });

    expect(draft.steps.map((step) => step.id)).toEqual(['step-a', 'step-b', 'step-c', 'step-d']);

    draft = courseDraftReducer(draft, { type: 'removeStep', stepId: 'step-c' });
    draft = courseDraftReducer(draft, { type: 'removeStep', stepId: 'step-d' });
    draft = courseDraftReducer(draft, { type: 'removeStep', stepId: 'step-b' });

    expect(draft.steps.map((step) => step.id)).toEqual(['step-a', 'step-b']);
  });

  it('reorders and changes categories without changing step identity', () => {
    let draft = createInitialCourseDraft(idFactory('step-a', 'step-b'));
    draft = courseDraftReducer(draft, { type: 'moveStep', stepId: 'step-a', direction: 'down' });
    draft = courseDraftReducer(draft, { type: 'setStepCategory', stepId: 'step-a', category: 'walk' });

    expect(draft.steps).toEqual([
      { id: 'step-b', category: 'cafe' },
      { id: 'step-a', category: 'walk' },
    ]);
  });

  it('extracts deterministic ko/en exclusions and safe soft preferences', () => {
    expect(parseCoursePreferences('카페 빼줘. 술집 제외하고 걷기 싫어. 조용한 실내에서 사진 찍고 싶어')).toEqual({
      excludedCategories: ['cafe', 'drinks', 'walk'],
      quietPreferred: true,
      photoFriendlyPreferred: true,
      indoorOnly: true,
    });
    expect(parseCoursePreferences('Avoid cafes, no bars, and avoid walking. Quiet indoor places for photos.')).toEqual({
      excludedCategories: ['cafe', 'drinks', 'walk'],
      quietPreferred: true,
      photoFriendlyPreferred: true,
      indoorOnly: true,
    });
    expect(parseCoursePreferences('카페에서 조용히 쉬고 싶어')).toEqual({ quietPreferred: true });
  });

  it.each([
    'not quiet',
    'photos are not important',
    'indoor is not needed',
    'I do not need indoor places',
  ])('does not reverse an unambiguous English soft-preference negation: %s', (text) => {
    expect(parseCoursePreferences(text)).toEqual({});
  });

  it.each([
    '실내는 싫어',
    '사진은 중요하지 않아',
    '사진은 필요 없어',
    '조용한 곳은 원하지 않아',
    '조용하지 않아도 괜찮아',
  ])('does not reverse an unambiguous Korean soft-preference negation: %s', (text) => {
    expect(parseCoursePreferences(text)).toEqual({});
  });

  it('suppresses only the negated signal while retaining other positive signals', () => {
    expect(parseCoursePreferences('Not quiet, but indoor places that are good for photos.')).toEqual({
      photoFriendlyPreferred: true,
      indoorOnly: true,
    });
    expect(parseCoursePreferences('실내는 싫지만 조용하고 사진 찍기 좋은 곳')).toEqual({
      quietPreferred: true,
      photoFriendlyPreferred: true,
    });
  });

  it.each([
    'No photos',
    'avoid quiet places',
    'avoid indoor venues',
    '사진 안 찍고 싶어',
    '실내 말고 야외',
  ])('never turns an explicit soft-preference rejection into its opposite: %s', (text) => {
    expect(parseCoursePreferences(text)).toEqual({});
  });

  it.each([
    'quiet can be boring',
    'indoor or outdoor is fine',
    '사진 얘기는 나중에',
  ])('omits ambiguous soft-preference keyword mentions: %s', (text) => {
    expect(parseCoursePreferences(text)).toEqual({});
  });

  it.each(['-1', '0', 'abc', '10,000,001'])('rejects invalid optional per-person budgets: %s', (perPersonBudgetKRWInput) => {
    const draft = {
      ...createInitialCourseDraft(idFactory('step-a', 'step-b')),
      location,
      perPersonBudgetKRWInput,
    };

    expect(validateCourseDraft(draft).issues).toContainEqual({ code: 'budget_invalid' });
  });

  it.each([
    ['50,000', 50000],
    ['30000', 30000],
    ['', undefined],
  ])('parses per-person budget %s', (input, expected) => {
    expect(parsePerPersonBudgetKRW(input)).toBe(expected);
  });

  it.each([
    ['2시간', 2],
    ['2~3시간', 2],
    ['2-3 hours', 2],
    ['', undefined],
    [undefined, undefined],
  ])('parses leading hours from duration text %s', (input, expected) => {
    expect(parseDurationHours(input)).toBe(expected);
  });

  it('doubles the per-person budget into the two-person total for the edge contract', () => {
    const draft = {
      ...createInitialCourseDraft(idFactory('step-a', 'step-b')),
      location,
      perPersonBudgetKRWInput: '50,000',
    };
    expect(buildStructuredCourseInput(draft, categoryLabels).totalBudgetKRW).toBe(100000);
  });

  it('rejects missing location, oversized requests, duplicate IDs, and unresolved exclusions', () => {
    const initial = createInitialCourseDraft(idFactory('step-a', 'step-b'));
    const result = validateCourseDraft({
      ...initial,
      steps: [initial.steps[0], { ...initial.steps[1], id: initial.steps[0].id }],
      additionalRequest: `avoid cafes ${'x'.repeat(500)}`,
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      { code: 'location_required' },
      { code: 'duplicate_step_ids' },
      { code: 'additional_request_too_long' },
      { code: 'exclusion_conflict', categories: ['cafe'] },
    ]));
  });

  it('pins a step to a picked place and clears it, leaving other steps untouched', () => {
    let draft = createInitialCourseDraft(idFactory('step-a', 'step-b'));
    const pin = { kakaoPlaceId: 'k1', name: '블루보틀 성수', address: '서울 성동구 아차산로 7' };
    draft = courseDraftReducer(draft, { type: 'setStepPin', stepId: 'step-a', pin });

    expect(draft.steps[0]).toEqual({ id: 'step-a', category: 'meal', pin });
    expect(draft.steps[1]).toEqual({ id: 'step-b', category: 'cafe' });

    draft = courseDraftReducer(draft, { type: 'clearStepPin', stepId: 'step-a' });
    expect(draft.steps[0]).toEqual({ id: 'step-a', category: 'meal' });
  });

  it('maps a pinned step to pinnedKakaoPlaceId/pinnedName with the place name as label', () => {
    let draft: CourseDraft = { ...createInitialCourseDraft(idFactory('step-a', 'step-b')), location };
    draft = courseDraftReducer(draft, {
      type: 'setStepPin',
      stepId: 'step-a',
      pin: { kakaoPlaceId: 'k1', name: '블루보틀 성수', address: '서울 성동구 아차산로 7' },
    });

    const structured = buildStructuredCourseInput(draft, categoryLabels);

    expect(structured.courseSteps).toEqual([
      { id: 'step-a', category: 'meal', label: '블루보틀 성수', pinnedKakaoPlaceId: 'k1', pinnedName: '블루보틀 성수' },
      { id: 'step-b', category: 'cafe', label: '카페' },
    ]);
  });

  it('accepts blank optional text and maps a valid draft to Phase 1 structured fields', () => {
    let draft = {
      ...createInitialCourseDraft(idFactory('step-a', 'step-b')),
      location,
      maxWalkingMinutes: 10 as const,
      perPersonBudgetKRWInput: '50,000',
      moods: ['romantic', 'quiet'] as const,
      duration: '2-3h',
      additionalRequest: '   ',
    };
    expect(validateCourseDraft(draft).valid).toBe(true);

    draft = { ...draft, additionalRequest: '사진 찍기 좋은 실내 장소' };
    const structured = buildStructuredCourseInput(draft, categoryLabels);

    expect(structured).toEqual({
      location,
      courseSteps: [
        { id: 'step-a', category: 'meal', label: '식사' },
        { id: 'step-b', category: 'cafe', label: '카페' },
      ],
      maxWalkingMinutes: 10,
      totalBudgetKRW: 100000,
      moods: ['romantic', 'quiet'],
      duration: '2-3h',
      additionalRequest: '사진 찍기 좋은 실내 장소',
      parsedPreferences: { indoorOnly: true, photoFriendlyPreferred: true },
    });
  });

  it('preserves the structured draft while mapping location, text, mood, and duration to legacy FeelingInput', () => {
    const draft = {
      ...createInitialCourseDraft(idFactory('step-a', 'step-b')),
      location,
      moods: ['lively', 'romantic'] as const,
      duration: 'half_day',
      additionalRequest: '  야경을 보고 싶어  ',
    };
    const input = buildCourseInput({ draft, categoryLabels });

    expect(input.recommendationLocation).toEqual(location);
    expect(input.coords).toEqual({ x: '127.0374', y: '37.5444' });
    expect(input.freeText).toBe('야경을 보고 싶어');
    expect(input.mood).toBe('lively');
    expect(input.duration).toBe('half_day');
    expect(input.courseDraft).toEqual(buildStructuredCourseInput(draft, categoryLabels));
  });
});
