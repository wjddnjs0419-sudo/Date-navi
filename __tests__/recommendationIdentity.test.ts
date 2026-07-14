import type { DateCard } from '../lib/ai';
import {
  attachRecommendationIdentity,
  createRecommendationRequestId,
  readRecommendationIdentity,
  writeRecommendationIdentity,
} from '../lib/recommendationIdentity';

const card = (overrides: Partial<DateCard> = {}): DateCard => ({
  title: '데이트',
  summary: '설명',
  estimated_time: '2시간',
  estimated_budget: '',
  tags: [],
  why_recommended: '추천 이유',
  ...overrides,
});

describe('recommendation request/session identity boundary', () => {
  it('creates request IDs from an injectable cryptographically secure UUID provider', () => {
    const first = createRecommendationRequestId(
      () => '00000000-0000-4000-8000-000000000001',
    );
    const second = createRecommendationRequestId(
      () => '00000000-0000-4000-8000-000000000002',
    );

    expect(first).toBe('req_00000000-0000-4000-8000-000000000001');
    expect(second).toBe('req_00000000-0000-4000-8000-000000000002');
  });

  it('clones every generated card and attaches one request/session identity', () => {
    const cards = [card({ kakaoPlaceId: 'place-101' }), card()];
    const attached = attachRecommendationIdentity(cards, {
      requestId: 'request-001',
      sessionId: 'session-001',
    });

    expect(attached).toEqual([
      { ...cards[0], requestId: 'request-001', sessionId: 'session-001' },
      { ...cards[1], requestId: 'request-001', sessionId: 'session-001' },
    ]);
    expect(attached).not.toBe(cards);
    expect(attached[0]).not.toBe(cards[0]);
    expect(cards[0]).not.toHaveProperty('requestId');
  });

  it('writes modern runtime identity to nullable DB columns', () => {
    expect(writeRecommendationIdentity(card({
      requestId: 'request-001',
      sessionId: 'session-001',
      kakaoPlaceId: 'place-101',
    }))).toEqual({
      recommendation_request_id: 'request-001',
      recommendation_session_id: 'session-001',
      kakao_place_id: 'place-101',
    });

    expect(writeRecommendationIdentity(card())).toEqual({
      recommendation_request_id: null,
      recommendation_session_id: null,
      kakao_place_id: null,
    });
  });

  it('reads modern DB identity and treats legacy null/missing columns as absent', () => {
    expect(readRecommendationIdentity({
      recommendation_request_id: 'request-001',
      recommendation_session_id: 'session-001',
      kakao_place_id: 'place-101',
    })).toEqual({
      requestId: 'request-001',
      sessionId: 'session-001',
      kakaoPlaceId: 'place-101',
    });

    expect(readRecommendationIdentity({
      recommendation_request_id: null,
      recommendation_session_id: null,
      kakao_place_id: null,
      place_name: 'place-101',
    })).toEqual({});
    expect(readRecommendationIdentity({ place_name: 'place-101' })).toEqual({});
  });
});
