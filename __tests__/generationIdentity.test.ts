import {
  FALLBACK_CARDS_BY_LANGUAGE,
  generateDateCards,
  regenerateDateCards,
  type DateCard,
  type FeelingInput,
} from '../lib/ai';
import type { Candidate } from '../lib/candidate';
import type { PlanIntent } from '../lib/intent';
import type { RecommendationSession } from '../lib/recommendationSession';
import { supabase } from '../lib/supabase';
import { randomUUID } from 'expo-crypto';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const invoke = jest.fn();
const randomUUIDMock = jest.mocked(randomUUID);
Object.assign(supabase, { functions: { invoke } });

const input: FeelingInput = {
  energy: 'medium',
  distance: 'any',
  mood: 'comfortable',
  duration: '2-3h',
  avoid: [],
};

const sourceCard = (title: string): DateCard => ({
  title,
  summary: `${title} 설명`,
  estimated_time: 'AI 시간',
  estimated_budget: 'AI 예산',
  tags: ['대화'],
  why_recommended: `${title} 추천 이유`,
});

const candidates: Candidate[] = [1, 2, 3].map(index => ({
  candidateId: `candidate_00${index}`,
  placeId: `place-${index}`,
  name: `장소 ${index}`,
  category: index === 1 ? '카페' : '음식점',
  address: `서울 주소 ${index}`,
  x: `127.0${index}`,
  y: `37.5${index}`,
  mapUrl: `https://place.map.kakao.com/${index}`,
  matchedQueries: index === 1 ? ['카페'] : ['맛집'],
  matchedIntentSignals: [],
  score: 10 - index,
}));

const intent: PlanIntent = {
  purpose: 'meal',
  placeTypes: ['cafe', 'restaurant'],
  atmosphere: ['comfortable'],
  duration: '2-3h',
  searchQueries: ['카페', '맛집'],
  positiveSignals: [],
  negativeSignals: [],
};

beforeEach(() => {
  invoke.mockReset();
  randomUUIDMock.mockReset();
});

function expectOneNonemptyRequestId(cards: DateCard[]): string {
  expect(cards.length).toBeGreaterThan(0);
  const requestIds = new Set(cards.map(card => card.requestId));
  expect(requestIds.size).toBe(1);
  const [requestId] = [...requestIds];
  expect(requestId).toEqual(expect.stringMatching(/^req_.+/));
  return requestId as string;
}

describe('generation identity behavior', () => {
  it('keeps Kakao identity through a fresh location-backed candidate flow and session capture', async () => {
    const locationInput: FeelingInput = {
      ...input,
      location: '성수동',
      freeText: '카페에서 대화하고 싶어',
    };
    const sourcePlaces = [{
      placeId: 'kakao-place-777',
      name: '성수 실제 카페',
      category: '카페 > 커피전문점',
      address: '서울 성동구 성수동 777',
      url: 'https://place.map.kakao.com/777',
      x: '127.0557',
      y: '37.5445',
    }];
    const sourceRecommendations = [{
      candidate_id: 'candidate_001',
      title: '성수 카페 데이트',
      summary: '실제 카페에서 편하게 대화해요',
      why_recommended: '원하는 카페와 지역 조건에 맞아요',
      tags: ['카페', '대화'],
    }];
    const inputSnapshot = { ...locationInput, avoid: [...locationInput.avoid] };
    const placesSnapshot = sourcePlaces.map(place => ({ ...place }));
    const recommendationsSnapshot = sourceRecommendations.map(rec => ({ ...rec, tags: [...rec.tags] }));
    let captured: Parameters<NonNullable<import('../lib/ai').GenerateOptions['onSession']>>[0] | undefined;
    invoke.mockImplementation(async (functionName: string) => functionName === 'place-search'
      ? { data: { places: sourcePlaces, _meta: { origin: { x: '127.0550', y: '37.5440' } } }, error: null }
      : { data: { recommendations: sourceRecommendations }, error: null });
    randomUUIDMock.mockReturnValue('00000000-0000-4000-8000-000000000103');

    const result = await generateDateCards(locationInput, 'feeling', undefined, 'ko', {
      onSession: session => { captured = session; },
    });

    expectOneNonemptyRequestId(result);
    expect(result[0]).toMatchObject({
      candidateId: 'candidate_001',
      kakaoPlaceId: 'kakao-place-777',
      requestId: 'req_00000000-0000-4000-8000-000000000103',
    });
    expect(captured?.candidates[0]).toMatchObject({
      candidateId: 'candidate_001',
      placeId: 'kakao-place-777',
    });
    expect(captured?.usedPlaceIds).toEqual(['kakao-place-777']);
    expect(locationInput).toEqual(inputSnapshot);
    expect(sourcePlaces).toEqual(placesSnapshot);
    expect(sourceRecommendations).toEqual(recommendationsSnapshot);
  });

  it('clones free-generation success cards and attaches one request ID without mutating the response source', async () => {
    const sourceCards = [sourceCard('카페 데이트'), sourceCard('산책 데이트')];
    const sourceSnapshot = sourceCards.map(card => ({ ...card, tags: [...card.tags] }));
    invoke.mockResolvedValue({ data: { cards: sourceCards }, error: null });
    randomUUIDMock.mockReturnValue('00000000-0000-4000-8000-000000000101');

    const result = await generateDateCards(input, 'feeling', undefined, 'ko');

    expectOneNonemptyRequestId(result);
    expect(sourceCards).toEqual(sourceSnapshot);
    expect(result).not.toBe(sourceCards);
    result.forEach((card, index) => expect(card).not.toBe(sourceCards[index]));
  });

  it('clones fallback cards and attaches one request ID without mutating the static fallback source', async () => {
    const sourceCards = FALLBACK_CARDS_BY_LANGUAGE.ko;
    const sourceSnapshot = sourceCards.map(card => ({ ...card, tags: [...card.tags] }));
    invoke.mockRejectedValue(new Error('generate-ai unavailable'));
    randomUUIDMock.mockReturnValue('00000000-0000-4000-8000-000000000102');

    const result = await generateDateCards(input, 'feeling', undefined, 'ko');

    expectOneNonemptyRequestId(result);
    expect(sourceCards).toEqual(sourceSnapshot);
    expect(result).not.toBe(sourceCards);
    result.forEach((card, index) => expect(card).not.toBe(sourceCards[index]));
  });

  it('regeneration returns a fresh request ID and reuses the complete session ID', async () => {
    const session: RecommendationSession = {
      sessionId: 'session-existing-001',
      mode: 'feeling',
      input,
      intent,
      candidates,
      previousPlaceIds: [],
    };
    invoke.mockResolvedValue({
      data: {
        recommendations: candidates.map((candidate, index) => ({
          candidate_id: candidate.candidateId,
          title: `추천 ${index + 1}`,
          summary: `추천 설명 ${index + 1}`,
          why_recommended: `추천 이유 ${index + 1}`,
          tags: ['실제 장소'],
        })),
      },
      error: null,
    });

    randomUUIDMock
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000201')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000202');
    const first = await regenerateDateCards(session, 'ko');
    const second = await regenerateDateCards(session, 'ko');
    const firstRequestId = expectOneNonemptyRequestId(first);
    const secondRequestId = expectOneNonemptyRequestId(second);

    expect(secondRequestId).not.toBe(firstRequestId);
    expect(first.every(card => card.sessionId === session.sessionId)).toBe(true);
    expect(second.every(card => card.sessionId === session.sessionId)).toBe(true);
  });
});
