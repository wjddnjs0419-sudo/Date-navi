import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { supabase } from '../../lib/supabase';
import { RecommendationSessionCache } from '../../lib/recommendation-session-cache';
import {
  recommendationSessionRepository,
  type RecommendationSessionSnapshot,
} from '../../lib/recommendation-session-repository';
import type { RecommendationRequest } from '../../shared/recommendation/schemas';

type SessionRepository = typeof recommendationSessionRepository;

type RecommendationSessionContextValue = {
  prepareRecommendationRequest: (request: RecommendationRequest) => RecommendationRequest;
  getPreparedRecommendationRequest: (requestId: string) => RecommendationRequest;
  persistRecommendationSession: (requestId: string) => Promise<RecommendationSessionSnapshot>;
  loadRecommendationSession: (
    sessionId: string,
    requestId: string,
  ) => Promise<RecommendationSessionSnapshot>;
  getRecommendationSession: (
    sessionId: string,
    requestId?: string,
  ) => RecommendationSessionSnapshot | undefined;
  mutateRecommendationSession: (
    sessionId: string,
    action: 'lock' | 'unlock' | 'reorder' | 'replace' | 'add' | 'delete' | 'regenerate' | 'confirm',
    payload: Record<string, unknown>,
  ) => Promise<RecommendationSessionSnapshot>;
};

const RecommendationSessionContext = createContext<RecommendationSessionContextValue | null>(null);

export function RecommendationSessionProvider({
  children,
  repository = recommendationSessionRepository,
}: {
  children: ReactNode;
  repository?: SessionRepository;
}) {
  const cacheRef = useRef<RecommendationSessionCache | null>(null);
  if (!cacheRef.current) cacheRef.current = new RecommendationSessionCache();
  const cache = cacheRef.current;
  const mutationsRef = useRef(new Map<string, Promise<RecommendationSessionSnapshot>>());

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') cache.clear();
    });
    return () => subscription.unsubscribe();
  }, [cache]);

  const value = useMemo<RecommendationSessionContextValue>(() => ({
    prepareRecommendationRequest(request) {
      return cache.prepareRequest(request);
    },
    getPreparedRecommendationRequest(requestId) {
      return cache.getPreparedRequest(requestId, true)!;
    },
    async persistRecommendationSession(requestId) {
      const snapshot = await repository.persist(requestId);
      cache.set(snapshot, snapshot.sessionId, requestId);
      cache.deletePreparedRequest(requestId);
      return snapshot;
    },
    loadRecommendationSession(sessionId, requestId) {
      return cache.getOrHydrate(sessionId, requestId, (id) => repository.hydrate(id));
    },
    getRecommendationSession(sessionId, requestId) {
      return cache.get(sessionId, requestId);
    },
    mutateRecommendationSession(sessionId, action, payload) {
      const existing = mutationsRef.current.get(sessionId);
      if (existing) return existing;
      const mutation = repository.mutate(sessionId, action, payload)
        .then((snapshot) => cache.set(snapshot, sessionId, snapshot.requestId))
        .finally(() => { mutationsRef.current.delete(sessionId); });
      mutationsRef.current.set(sessionId, mutation);
      return mutation;
    },
  }), [cache, repository]);

  return (
    <RecommendationSessionContext.Provider value={value}>
      {children}
    </RecommendationSessionContext.Provider>
  );
}

export function useRecommendationSessionStore(): RecommendationSessionContextValue {
  const value = use(RecommendationSessionContext);
  if (!value) throw new Error('RecommendationSessionProvider is missing.');
  return value;
}
