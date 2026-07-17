import type { RecommendationRequest } from '../shared/recommendation/schemas';
import { recommendDateCardSchema } from '../shared/recommendation/schemas';
import { buildCandidateOnlyCourse } from '../supabase/functions/_shared/recommendation-course-selection';
import type { PlaceCandidate } from '../supabase/functions/_shared/recommendation-ranking';

const request = (overrides: Partial<RecommendationRequest> = {}): RecommendationRequest => ({
  requestId: 'i18n-request',
  mode: 'course',
  language: 'en',
  location: {
    source: 'kakao',
    label: '서울숲',
    latitude: 37,
    longitude: 127,
    kind: 'landmark',
  },
  courseSteps: [
    { id: 'meal-step', category: 'meal', label: 'Meal' },
    { id: 'cafe-step', category: 'cafe', label: 'Cafe' },
  ],
  maxWalkingMinutes: 5,
  ...overrides,
});

const candidate = (
  candidateId: string,
  kakaoPlaceId: string,
  categoryGroupCode: string,
  longitude: number,
  score = 60,
): PlaceCandidate => ({
  candidateId,
  kakaoPlaceId,
  name: `Place ${kakaoPlaceId}`,
  categoryGroupCode,
  categoryGroupName: categoryGroupCode === 'FD6' ? 'Restaurant' : 'Cafe',
  categoryName: categoryGroupCode === 'FD6' ? 'Restaurant > Korean' : 'Cafe',
  address: `Address ${kakaoPlaceId}`,
  roadAddress: `Road ${kakaoPlaceId}`,
  latitude: 37,
  longitude,
  mapUrl: `https://place.map.kakao.com/${kakaoPlaceId}`,
  matchedSearchEvidence: [{
    queryId: `query-${candidateId}`,
    source: 'category',
    page: 1,
    categoryCode: categoryGroupCode,
  }],
  distanceFromSearchCenterMeters: 100,
  score,
  scoreBreakdown: {
    intent: 40, distance: 20, budget: 0, preference: 0,
    routeFit: 0, diversity: 0, behavior: 0, penalty: 0,
  },
});

const candidates = [
  candidate('meal-near', 'meal-near-id', 'FD6', 127.0000, 70),
  candidate('cafe-near', 'cafe-near-id', 'CE7', 127.0010, 65),
];

const selection = {
  steps: [
    { stepId: 'meal-step', candidateId: 'meal-near' },
    { stepId: 'cafe-step', candidateId: 'cafe-near' },
  ],
};

const build = (language: 'ko' | 'en') => buildCandidateOnlyCourse({
  request: request({ language }),
  candidates,
  selection,
  generatedAt: '2026-07-17T00:00:00.000Z',
});

describe('recommend date card i18n texts', () => {
  it('always carries both ko and en card texts regardless of request language', () => {
    for (const language of ['ko', 'en'] as const) {
      const card = build(language).cards[0];
      expect(card.i18n?.ko.title).toBe('서울숲 데이트 코스');
      expect(card.i18n?.ko.summary).toContain('검증된 장소 코스');
      expect(card.i18n?.ko.why_recommended).toContain('검색 후보에서 확인');
      expect(card.i18n?.en.title).toBe('서울숲 date course');
      expect(card.i18n?.en.summary).toContain('verified-place course');
      expect(card.i18n?.en.why_recommended).toContain('verified against the search candidates');
    }
  });

  it('keeps top-level texts in the requester language for backward compatibility', () => {
    const koCard = build('ko').cards[0];
    const enCard = build('en').cards[0];
    expect(koCard.title).toBe(koCard.i18n?.ko.title);
    expect(koCard.summary).toBe(koCard.i18n?.ko.summary);
    expect(enCard.title).toBe(enCard.i18n?.en.title);
    expect(enCard.why_recommended).toBe(enCard.i18n?.en.why_recommended);
  });

  it('card schema accepts the optional i18n block and stays optional for legacy cards', () => {
    const base = {
      requestId: 'r', sessionId: 's', title: 't', summary: 'sum',
      tags: ['a'], why_recommended: 'w',
    };
    expect(recommendDateCardSchema.safeParse(base).success).toBe(true);
    expect(recommendDateCardSchema.safeParse({
      ...base,
      i18n: {
        ko: { title: '제목', summary: '요약', why_recommended: '이유' },
        en: { title: 'Title', summary: 'Summary', why_recommended: 'Why' },
      },
    }).success).toBe(true);
    expect(recommendDateCardSchema.safeParse({
      ...base,
      i18n: { ko: { title: '제목', summary: '요약', why_recommended: '이유' } },
    }).success).toBe(false);
  });
});
