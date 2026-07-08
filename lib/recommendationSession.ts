// Phase 6 — RecommendationSession (앱 런타임 내 경량 module store).
// Persistent Cache가 아니다. 앱 재시작 시 소멸 (§13·§21). 최초 추천의 Candidate Pool을 재사용해
// 재추천 시 previousPlaceIds를 제외하고 Kakao 재검색 없이 다시 고른다.
import type { FeelingInput, UserPreferences } from './ai';
import type { PlanIntent } from './intent';
import type { Candidate } from './candidate';

export type RecommendationSession = {
  sessionId: string;
  mode: string;
  input: FeelingInput;
  intent: PlanIntent;
  candidates: Candidate[];
  previousPlaceIds: string[];
  prefs?: UserPreferences;
};

// Math.random 미사용 (테스트 결정론) — 단조 증가 카운터로 sessionId 부여.
let counter = 0;
const store = new Map<string, RecommendationSession>();

export function createSession(data: Omit<RecommendationSession, 'sessionId'>): RecommendationSession {
  counter += 1;
  const sessionId = `sess_${counter}`;
  const session: RecommendationSession = { sessionId, ...data };
  store.set(sessionId, session);
  return session;
}

export function getSession(id?: string | null): RecommendationSession | undefined {
  return id ? store.get(id) : undefined;
}

export function addPreviousPlaceIds(id: string, placeIds: string[]): void {
  const s = store.get(id);
  if (!s) return;
  s.previousPlaceIds = [...new Set([...s.previousPlaceIds, ...placeIds])];
}

// 테스트 전용 — store/counter 초기화.
export function clearSessions(): void {
  store.clear();
  counter = 0;
}
