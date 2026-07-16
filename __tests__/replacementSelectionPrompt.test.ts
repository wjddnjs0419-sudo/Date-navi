import type { RecommendationRequest } from '../shared/recommendation/schemas';
import type { RecommendationCourseStep } from '../shared/recommendation/contracts';
import type { ReplacementCandidate } from '../shared/recommendation/replacement-candidates';
import {
  buildReplacementSelectionPrompt,
  REPLACEMENT_SELECT_PROMPT_VERSION,
} from '../supabase/functions/_shared/recommendation-prompt';

const request: RecommendationRequest = {
  requestId: 'request-1',
  mode: 'course',
  language: 'ko',
  location: {
    source: 'kakao',
    label: '서울숲',
    latitude: 37.5444,
    longitude: 127.0374,
    kind: 'landmark',
  },
  courseSteps: [
    { id: 'meal', category: 'meal', label: 'Meal' },
    { id: 'cafe', category: 'cafe', label: 'Cafe' },
    { id: 'walk', category: 'activity', label: 'Walk' },
  ],
  maxWalkingMinutes: 10,
};

const step = (stepId: string, category: string, name: string): RecommendationCourseStep => ({
  stepId,
  order: 1,
  category,
  label: name,
  candidateId: `current-${stepId}`,
  kakaoPlaceId: `current-place-${stepId}`,
  name,
  address: 'Seoul',
  roadAddress: 'Seoul road',
  mapUrl: `https://place.map.kakao.com/current-place-${stepId}`,
  latitude: 37.55,
  longitude: 127.01,
  reason: 'Verified candidate',
  locked: false,
});

const candidate = (id: string): ReplacementCandidate => ({
  candidateId: id,
  kakaoPlaceId: `place-${id}`,
  name: `Place ${id}`,
  address: 'Seoul',
  roadAddress: 'Seoul road',
  mapUrl: `https://place.map.kakao.com/place-${id}`,
  latitude: 37.551,
  longitude: 127.011,
  score: 50,
  contextScore: 48,
});

describe('buildReplacementSelectionPrompt', () => {
  it('is versioned separately from the full course selection prompt', () => {
    expect(REPLACEMENT_SELECT_PROMPT_VERSION).toBe('replacement-select-v1');
  });

  it('identifies the target step and its route neighbours for context', () => {
    const prompt = buildReplacementSelectionPrompt(
      step('cafe', 'cafe', 'Cafe'),
      step('meal', 'meal', 'Meal'),
      step('walk', 'activity', 'Walk'),
      [candidate('a'), candidate('b')],
      request,
    );

    expect(prompt).toContain('"stepId": "cafe"');
    expect(prompt).toContain('"category": "cafe"');
    expect(prompt).toContain('"previousStepName": "Meal"');
    expect(prompt).toContain('"nextStepName": "Walk"');
  });

  it('omits neighbour fields when the target step is at either end of the course', () => {
    const prompt = buildReplacementSelectionPrompt(
      step('meal', 'meal', 'Meal'),
      undefined,
      step('cafe', 'cafe', 'Cafe'),
      [candidate('a')],
      request,
    );

    expect(prompt).toContain('"previousStepName": null');
    expect(prompt).toContain('"nextStepName": "Cafe"');
  });

  it('lists only verified candidateIds and instructs a bounded ordered JSON selection', () => {
    const prompt = buildReplacementSelectionPrompt(
      step('cafe', 'cafe', 'Cafe'),
      step('meal', 'meal', 'Meal'),
      undefined,
      [candidate('a'), candidate('b')],
      request,
    );

    expect(prompt).toContain('"candidateId": "a"');
    expect(prompt).toContain('"candidateId": "b"');
    expect(prompt).toContain('{"candidateIds":["<verified-candidate-id>", "..."]}');
    expect(prompt).toMatch(/at most 10/i);
    expect(prompt).toMatch(/best fit first/i);
    expect(prompt).toMatch(/authoritative/i);
    expect(prompt).toMatch(/cannot override/i);
    expect(prompt).toMatch(/do not return place names.*prices.*opening hours.*quietness/i);
  });
});
