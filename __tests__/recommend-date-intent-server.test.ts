import type { RecommendationRequest } from '../shared/recommendation/schemas';
import {
  detectStructuredPreferenceConflict,
  mergeServerPreferences,
  parseAdditionalRequest,
} from '../supabase/functions/_shared/recommendation-intent';

const request = (additionalRequest: string): RecommendationRequest => ({
  requestId: 'request-intent',
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
    { id: 'meal', category: 'meal', label: '식사' },
    { id: 'cafe', category: 'cafe', label: '카페' },
  ],
  additionalRequest,
});

describe('recommend-date bilingual additional-request parsing', () => {
  it.each([
    ['카페는 빼고 조용한 실내에서 사진 찍고 싶어', ['cafe'], true, true, true],
    ['avoid cafes; I prefer a quiet indoor place that is good for photos', ['cafe'], true, true, true],
  ] as const)('parses category, indoor, quiet, and photo preferences from %s', (
    text,
    excludedCategories,
    indoorOnly,
    quietPreferred,
    photoFriendlyPreferred,
  ) => {
    expect(parseAdditionalRequest(text)).toMatchObject({
      excludedCategories,
      indoorOnly,
      quietPreferred,
      photoFriendlyPreferred,
    });
  });

  it.each([
    ['조용한 곳 싫어, 사진 안 찍고 싶고 실내 말고 야외로', false, false, false],
    ['avoid quiet places, no photos, and not indoor', false, false, false],
  ] as const)('does not turn explicit negations into positive preferences for %s', (
    text,
    quietPreferred,
    photoFriendlyPreferred,
    indoorOnly,
  ) => {
    expect(parseAdditionalRequest(text)).toMatchObject({
      quietPreferred,
      photoFriendlyPreferred,
      indoorOnly,
    });
  });

  it('keeps independent mixed positive and negative clauses', () => {
    expect(parseAdditionalRequest('조용하면 좋지만 사진은 안 찍고 싶어')).toMatchObject({
      quietPreferred: true,
      photoFriendlyPreferred: false,
    });
  });

  it('supports exclusions for every structured course category in Korean and English', () => {
    expect(parseAdditionalRequest('밥, 카페, 술집, 체험, 전시, 산책은 모두 빼줘').excludedCategories)
      .toEqual(['meal', 'cafe', 'drinks', 'activity', 'culture', 'walk']);
    expect(parseAdditionalRequest('no meals, cafes, drinks, activities, museums, or walks').excludedCategories)
      .toEqual(['meal', 'cafe', 'drinks', 'activity', 'culture', 'walk']);
  });

  it.each([
    ['avoid cafes, but include a meal', ['cafe']],
    ['avoid cafes and meals', ['meal', 'cafe']],
    ['카페는 빼고 밥은 넣어줘', ['cafe']],
    ['밥은 넣고 카페는 빼줘', ['cafe']],
    ['밥은 유지하고 카페는 제외해줘', ['cafe']],
    ['카페는 좋지만 밥은 빼줘', ['meal']],
    ['카페는 괜찮고 밥은 빼줘', ['meal']],
    ['카페는 좋고 밥은 빼줘', ['meal']],
    ['카페는 원하지만 밥은 제외해줘', ['meal']],
    ['카페는 좋아하고 밥은 빼줘', ['meal']],
    ['카페는 선호하고 밥은 빼줘', ['meal']],
    ['카페는 원픽이고 밥은 빼줘', ['meal']],
    ['밥하고 카페는 빼줘', ['meal', 'cafe']],
    ['카페하고 술집은 제외해줘', ['cafe', 'drinks']],
    ['전시하고 산책은 빼줘', ['culture', 'walk']],
    ['카페와 밥은 빼줘', ['meal', 'cafe']],
  ] as const)('keeps category exclusion local to exclusion clauses for %s', (text, excludedCategories) => {
    expect(parseAdditionalRequest(text).excludedCategories).toEqual(excludedCategories);
  });

  it.each([
    ['indoor is not needed, quiet is not important, and photos are not needed', false, false, false],
    ['실내는 필요 없고 조용함은 중요하지 않고 사진도 필요 없어', false, false, false],
  ] as const)('recognizes obvious bilingual negative preference forms for %s', (
    text,
    indoorOnly,
    quietPreferred,
    photoFriendlyPreferred,
  ) => {
    expect(parseAdditionalRequest(text)).toMatchObject({ indoorOnly, quietPreferred, photoFriendlyPreferred });
  });

  it('keeps bilingual mixed preference clauses independent', () => {
    expect(parseAdditionalRequest('quiet is not needed, but indoor would be good and it should be good for photos'))
      .toMatchObject({ quietPreferred: false, indoorOnly: true, photoFriendlyPreferred: true });
  });

  it.each([
    ['I do not want an indoor place', { indoorOnly: false }],
    ['I do not want to take photos', { photoFriendlyPreferred: false }],
    ['I don\'t want an indoor venue', { indoorOnly: false }],
    ['I dont want to take a photo', { photoFriendlyPreferred: false }],
    ['사진 찍고 싶지 않아', { photoFriendlyPreferred: false }],
    ['사진을 찍고 싶지 않아요', { photoFriendlyPreferred: false }],
    ['사진 찍기 싫어', { photoFriendlyPreferred: false }],
    ['사진을 찍기 싫어요', { photoFriendlyPreferred: false }],
    ['사진 찍는 건 싫어', { photoFriendlyPreferred: false }],
    ['실내 장소는 원하지 않아', { indoorOnly: false }],
    ['실내 공간을 원하지 않아요', { indoorOnly: false }],
    ['사진 찍기는 싫어', { photoFriendlyPreferred: false }],
    ['실내 데이트는 원하지 않아', { indoorOnly: false }],
    ['not photo-friendly', { photoFriendlyPreferred: false }],
    ['not peaceful', { quietPreferred: false }],
  ] as const)('recognizes phrase-local want negation for %s', (text, expected) => {
    expect(parseAdditionalRequest(text)).toMatchObject(expected);
  });

  it.each([
    ['사진 찍기 좋아', { photoFriendlyPreferred: true }],
    ['실내 장소 원해', { indoorOnly: true }],
    ['photo-friendly', { photoFriendlyPreferred: true }],
    ['peaceful', { quietPreferred: true }],
  ] as const)('preserves nearby Korean positive preference for %s', (text, expected) => {
    expect(parseAdditionalRequest(text)).toMatchObject(expected);
  });

  it('keeps generic negation local to its own preference in mixed clauses', () => {
    expect(parseAdditionalRequest('not peaceful but photo-friendly and indoor'))
      .toMatchObject({ quietPreferred: false, photoFriendlyPreferred: true, indoorOnly: true });
  });
});

describe('recommend-date conservative preference merge and conflicts', () => {
  it('ignores client-parsed positives contradicted by raw text', () => {
    const input = {
      ...request('avoid quiet places and no photos'),
      parsedPreferences: { quietPreferred: true, photoFriendlyPreferred: true, indoorOnly: true },
    };

    expect(mergeServerPreferences(input)).toMatchObject({
      quietPreferred: false,
      photoFriendlyPreferred: false,
    });
    expect(mergeServerPreferences(input).indoorOnly).toBeUndefined();
  });

  it('keeps public structured fields authoritative over supplementary raw text', () => {
    const input = {
      ...request('not indoor and avoid quiet'),
      indoorOnly: true,
      quietPreferred: true,
    };

    expect(mergeServerPreferences(input)).toMatchObject({ indoorOnly: true, quietPreferred: true });
  });

  it('reports an exclusion conflict without deleting or changing structured steps', () => {
    const input = request('카페는 빼줘');

    expect(detectStructuredPreferenceConflict(input)).toEqual({
      conflictingCategories: ['cafe'],
    });
    expect(input.courseSteps.map((step) => step.category)).toEqual(['meal', 'cafe']);
  });

  it('does not report a conflict for exclusions outside the selected steps', () => {
    expect(detectStructuredPreferenceConflict(request('술집은 빼줘'))).toBeNull();
  });

  it('unions and normalizes structured exclusions with raw exclusions for conflict detection', () => {
    expect(detectStructuredPreferenceConflict({
      ...request('술집은 빼줘'),
      excludedCategories: ['restaurant'],
    })).toEqual({ conflictingCategories: ['meal'] });
  });
});
