import { randomUUID } from 'expo-crypto';
import type { DateCard } from './ai';

export type RecommendationIdentity = {
  requestId?: string;
  sessionId?: string;
  kakaoPlaceId?: string;
};

export type RecommendationIdentityColumns = {
  recommendation_request_id: string | null;
  recommendation_session_id: string | null;
  kakao_place_id: string | null;
};

export function createRecommendationRequestId(uuidProvider: () => string = randomUUID): string {
  return `req_${uuidProvider()}`;
}

export function attachRecommendationIdentity(
  cards: DateCard[],
  identity: RecommendationIdentity,
): DateCard[] {
  return cards.map(card => ({
    ...card,
    ...(identity.requestId ? { requestId: identity.requestId } : {}),
    ...(identity.sessionId ? { sessionId: identity.sessionId } : {}),
    ...(identity.kakaoPlaceId ? { kakaoPlaceId: identity.kakaoPlaceId } : {}),
  }));
}

export function writeRecommendationIdentity(identity: RecommendationIdentity): RecommendationIdentityColumns {
  return {
    recommendation_request_id: identity.requestId ?? null,
    recommendation_session_id: identity.sessionId ?? null,
    kakao_place_id: identity.kakaoPlaceId ?? null,
  };
}

type RecommendationIdentityRow = Partial<RecommendationIdentityColumns> & Record<string, unknown>;

export function readRecommendationIdentity(row: RecommendationIdentityRow): RecommendationIdentity {
  const identity: RecommendationIdentity = {};
  if (typeof row.recommendation_request_id === 'string' && row.recommendation_request_id.length > 0) {
    identity.requestId = row.recommendation_request_id;
  }
  if (typeof row.recommendation_session_id === 'string' && row.recommendation_session_id.length > 0) {
    identity.sessionId = row.recommendation_session_id;
  }
  if (typeof row.kakao_place_id === 'string' && row.kakao_place_id.length > 0) {
    identity.kakaoPlaceId = row.kakao_place_id;
  }
  return identity;
}
