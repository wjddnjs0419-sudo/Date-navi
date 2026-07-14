import {
  assembleCourseCards,
  assembleFeelingCards,
  buildDeterministicFallback,
  collectPlaceIds,
} from '../lib/recommendation';
import { resolveDisplaySteps, type CourseStep } from '../lib/course';
import type { Candidate } from '../lib/candidate';
import type { DateCard, FeelingInput } from '../lib/ai';
import type { PlanIntent } from '../lib/intent';

const candidates: Candidate[] = [
  {
    candidateId: 'candidate_001',
    placeId: 'kakao-place-101',
    name: '같은 이름',
    category: '카페',
    address: '서울 성수 1',
    x: '127',
    y: '37',
    mapUrl: 'https://place.map.kakao.com/101',
    matchedQueries: ['카페'],
    matchedIntentSignals: [],
    score: 6,
  },
  {
    candidateId: 'candidate_002',
    placeId: 'kakao-place-202',
    name: '같은 이름',
    category: '음식점',
    address: '서울 성수 2',
    x: '127.1',
    y: '37.1',
    mapUrl: 'https://place.map.kakao.com/202',
    matchedQueries: ['맛집'],
    matchedIntentSignals: [],
    score: 5,
  },
];

const input: FeelingInput = {
  energy: 'medium',
  distance: 'any',
  mood: 'comfortable',
  duration: '2-3h',
  avoid: [],
};

const intent: PlanIntent = {
  purpose: 'meal',
  placeTypes: ['cafe'],
  atmosphere: [],
  duration: '2-3h',
  searchQueries: ['카페'],
  positiveSignals: [],
  negativeSignals: [],
};

describe('stable Kakao place identity', () => {
  it('candidate-backed feeling cards retain request-scoped candidate and stable Kakao place IDs', () => {
    const [card] = assembleFeelingCards(
      [{ candidate_id: 'candidate_001', title: '카페', summary: 's', why_recommended: 'w', tags: [] }],
      candidates,
      input,
      [],
      'ko',
    );

    expect(card).toMatchObject({
      candidateId: 'candidate_001',
      kakaoPlaceId: 'kakao-place-101',
      place_name: '같은 이름',
      place_address: '서울 성수 1',
      map_url: 'https://place.map.kakao.com/101',
    });
  });

  it('deterministic fallback cards retain request-scoped candidate and stable Kakao place IDs', () => {
    const [card] = buildDeterministicFallback(candidates, intent, input, [], new Set(), 1, 'ko');

    expect(card).toMatchObject({
      candidateId: 'candidate_001',
      kakaoPlaceId: 'kakao-place-101',
    });
  });

  it('candidate-backed course steps retain IDs while pure action steps omit them', () => {
    const [card] = assembleCourseCards(
      [{
        title: '코스',
        summary: 's',
        why_recommended: 'w',
        tags: [],
        steps: [
          { candidate_id: 'candidate_002', label: '식사' },
          { label: '산책' },
        ],
      }],
      candidates,
      input,
      [],
      'ko',
    );

    expect(card.steps?.[0]).toMatchObject({
      candidateId: 'candidate_002',
      kakaoPlaceId: 'kakao-place-202',
      place_name: '같은 이름',
      place_address: '서울 성수 2',
      map_url: 'https://place.map.kakao.com/202',
    });
    expect(card.steps?.[1]).toEqual({ label: '산책', desc: undefined });
  });

  it('collects stored stable IDs directly without candidate name matching', () => {
    const cards = [
      {
        kakaoPlaceId: 'kakao-card',
        place_name: '중복 이름',
        steps: [
          { label: '첫 장소', kakaoPlaceId: 'kakao-step', place_name: '중복 이름' },
          { label: '같은 장소 재사용', kakaoPlaceId: 'kakao-card', place_name: '다른 이름' },
          { label: '행동' },
        ],
      },
    ] as DateCard[];
    expect(collectPlaceIds(cards)).toEqual(['kakao-card', 'kakao-step']);
  });

  it('keeps legacy cards and steps without IDs display-compatible', () => {
    const legacyStep: CourseStep = { label: '레거시 카페', place_name: '옛 카페' };
    const legacyCard: DateCard = {
      title: '레거시 코스',
      summary: '1단계: 레거시 카페',
      estimated_time: '',
      estimated_budget: '',
      tags: [],
      why_recommended: '',
      steps: [legacyStep],
      place_name: '옛 카페',
      place_address: '옛 주소',
      map_url: 'https://example.com/legacy',
    };

    expect(resolveDisplaySteps(legacyCard)).toEqual([legacyStep]);
    expect(legacyCard).toMatchObject({
      place_name: '옛 카페',
      place_address: '옛 주소',
      map_url: 'https://example.com/legacy',
    });
  });
});
