import { createClient } from 'npm:@supabase/supabase-js@2.106.1';

import { handleRecommendDate } from '../_shared/recommend-date-handler.ts';
import { invokeGenerateAiSelection } from '../_shared/recommend-date-downstream.ts';
import {
  acquireCourseGenerationLock,
  consumeCourseGenerationQuota,
  recordAiRateLimitEvent,
  releaseCourseGenerationLock,
} from '../_shared/ai-rate-limit.ts';
import { createSupabaseKakaoSearchCacheStore } from '../_shared/kakao-search-cache.ts';
import { searchAndRankRecommendation } from '../_shared/recommendation-search-pipeline.ts';
import {
  createSupabaseRecommendationHistoryQueryAdapter,
  loadRecommendationHistoryAssignmentScope,
  loadRecommendationHistory,
} from '../_shared/recommendation-history.ts';
import { lookupPlacePrices, recordPlaceKnowledge } from '../_shared/place-ledger.ts';
import {
  buildPlacePriceEstimationPrompt,
  parsePlacePriceEstimate,
  PLACE_PRICE_PROMPT_VERSION,
} from '../_shared/place-price-prompt.ts';
import {
  persistedHistoryExperimentVariant,
  historyExperimentLogKey,
  type HistoryExperimentMode,
} from '../../../shared/recommendation/history-experiment.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// generate-ai가 실제로 쓰는 모델과 같아야 estimate_model 기록이 진실이 된다.
const PLACE_PRICE_ESTIMATE_MODEL = 'claude-haiku-4-5';

function historyExperimentMode(value: string | undefined): HistoryExperimentMode {
  return value === 'ab50' || value === 'treatment' ? value : 'off';
}

Deno.serve(async (request) => {
  const startedAt = Date.now();
  const experimentMode = historyExperimentMode(Deno.env.get('RECOMMENDATION_HISTORY_EXPERIMENT'));
  let body: unknown;
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
  }
  const rateLimitClient = createClient<any>(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const result = await handleRecommendDate({
    method: request.method,
    authorization: request.headers.get('Authorization'),
    body,
  }, {
    rateLimit: {
      acquire: async ({ userId, requestId }) => {
        return acquireCourseGenerationLock(rateLimitClient, { userId, requestId });
      },
      release: async ({ userId, requestId }) => {
        await releaseCourseGenerationLock(rateLimitClient, { userId, requestId });
      },
      consume: async ({ userId }) => {
        return consumeCourseGenerationQuota(rateLimitClient, { userId });
      },
      recordEvent: async ({ userId, eventType }) => {
        await recordAiRateLimitEvent(rateLimitClient, { userId, eventType });
      },
    },
    authenticate: async (authorization) => {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authorization } } },
      );
      const { data: { user }, error } = await userClient.auth.getUser();
      return error || !user ? null : { id: user.id };
    },
    searchCandidates: async (input, history) => {
      const startedAt = Date.now();
      const cacheMetrics = { hits: 0, misses: 0, kakaoCalls: 0 };
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const result = await searchAndRankRecommendation(input, {
        kakaoRestApiKey: Deno.env.get('KAKAO_REST_API_KEY') ?? '',
        fetcher: fetch,
        cacheStore: createSupabaseKakaoSearchCacheStore(serviceClient),
        cacheMetrics,
        history,
        priceLookup: (ids) => lookupPlacePrices({ client: serviceClient as never, kakaoPlaceIds: ids }),
      });
      console.error(JSON.stringify({
        event: 'kakao_cache_lookup',
        fn: 'recommend-date',
        ...cacheMetrics,
        searchTotalMs: Date.now() - startedAt,
      }));
      return result;
    },
    loadHistory: async ({ authenticatedUserId, request: historyRequest }) => {
      const serviceClient = createClient<any>(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      return loadRecommendationHistory({
        authenticatedUserId,
        currentLocation: historyRequest.location,
        activeSessionId: historyRequest.sessionId,
        queries: createSupabaseRecommendationHistoryQueryAdapter(serviceClient),
      });
    },
    historyExperiment: {
      mode: experimentMode,
      resolveAssignmentContext: async ({ authenticatedUserId, request: experimentRequest }) => {
        const serviceClient = createClient<any>(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const queries = createSupabaseRecommendationHistoryQueryAdapter(serviceClient);
        const scope = await loadRecommendationHistoryAssignmentScope({ authenticatedUserId, queries });
        if (!experimentRequest.sessionId) {
          return { ...scope, ...(scope.status === 'failed' ? { assignmentScopeFailed: true } : {}) };
        }
        const { data: session, error } = await serviceClient
          .from('recommendation_sessions')
          .select('owner_user_id,metadata')
          .eq('id', experimentRequest.sessionId)
          .maybeSingle();
        const persistedAssignedVariant = !error && session?.owner_user_id === authenticatedUserId
          ? persistedHistoryExperimentVariant(session.metadata)
          : undefined;
        return {
          ...scope,
          ...(scope.status === 'failed' ? { assignmentScopeFailed: true } : {}),
          ...(persistedAssignedVariant ? { persistedAssignedVariant } : {}),
        };
      },
    },
    loadReplacementCandidateRank: async ({
      authenticatedUserId, sessionId, targetStepId, kakaoPlaceId, candidateListAttestationId,
    }) => {
      const serviceClient = createClient<any>(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: attestation, error } = await serviceClient
        .from('recommendation_generation_attestations')
        .select('session_id,owner_user_id,request_json,response_json,created_at,consumed_at')
        .eq('request_id', candidateListAttestationId)
        .maybeSingle();
      const { data: session, error: sessionError } = await serviceClient
        .from('recommendation_sessions')
        .select('request_id')
        .eq('id', sessionId)
        .maybeSingle();
      if (error || !attestation || attestation.session_id !== sessionId
        || attestation.consumed_at !== null || sessionError || !session
        || attestation.owner_user_id !== authenticatedUserId
        || attestation.request_json?.type !== 'replacement_candidate_list'
        || attestation.request_json?.baseRequestId !== session.request_id
        || attestation.request_json?.targetStepId !== targetStepId
        || Date.now() - Date.parse(attestation.created_at) > 15 * 60 * 1000) return undefined;
      const rank = attestation.response_json?.candidateRanks?.find((candidate: unknown) => (
        typeof candidate === 'object' && candidate !== null
        && (candidate as { kakaoPlaceId?: unknown }).kakaoPlaceId === kakaoPlaceId
      ))?.displayRank;
      return Number.isInteger(rank) && rank >= 1 && rank <= 15 ? rank : undefined;
    },
    generateSelection: (input) => invokeGenerateAiSelection({
      ...input,
      supabaseUrl: Deno.env.get('SUPABASE_URL')!,
      anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
    }),
    stageAttestation: async ({ ownerUserId, request, response }) => {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const sessionId = response.course.sessionId;
      if (sessionId !== request.requestId) {
        const { data: session, error: sessionError } = await serviceClient
          .from('recommendation_sessions')
          .select('id, owner_user_id, request_id')
          .eq('id', sessionId)
          .maybeSingle();
        if (sessionError || !session || session.owner_user_id !== ownerUserId
          || request.baseRequestId !== session.request_id) {
          throw new Error('session owner or version mismatch');
        }
      }
      const { error } = await serviceClient.from('recommendation_generation_attestations').insert({
        request_id: request.requestId,
        session_id: sessionId,
        owner_user_id: ownerUserId,
        request_json: request,
        response_json: response,
      });
      if (error) throw error;
    },
    onCourseValidationFailure: (stage) => {
      console.error(JSON.stringify({ event: 'recommend_date_course_validation_failed', stage }));
    },
    recordPlaceKnowledge: ({ places }) => {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const authorization = request.headers.get('Authorization') ?? '';
      // 응답 이후 실행 — 원장 기록·가격 추정이 사용자 대기 시간에 들어가지 않는다.
      // @ts-ignore Supabase Edge Runtime 전역
      EdgeRuntime.waitUntil(recordPlaceKnowledge({
        client: serviceClient as never,
        places,
        model: PLACE_PRICE_ESTIMATE_MODEL,
        estimate: async (place) => {
          const raw = await invokeGenerateAiSelection({
            supabaseUrl: Deno.env.get('SUPABASE_URL')!,
            anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
            authorization,
            action: 'estimate_place_price',
            prompt: buildPlacePriceEstimationPrompt({
              placeName: place.name,
              categoryName: place.categoryName,
              address: place.address,
            }),
            promptVersion: PLACE_PRICE_PROMPT_VERSION,
          }, { timeoutMs: 8_000 });
          return parsePlacePriceEstimate(raw);
        },
      }));
    },
  });

  const resultBody = result.body as {
    error?: { code?: string };
    metadata?: { historyExperiment?: {
      assignedVariant: 'control' | 'treatment';
      effectiveVariant: 'control' | 'treatment';
      historyLoad: 'not_attempted' | 'loaded' | 'failed';
      recentHistoryExcludedCount: number;
      recentCooldownRelaxed: boolean;
    } };
    course?: { sessionId?: string };
  } | null;
  const historyMetadata = result.observability?.historyExperiment ?? resultBody?.metadata?.historyExperiment;
  console.error(JSON.stringify({
    event: 'recommend_date_history_outcome',
    assignedVariant: historyMetadata?.assignedVariant ?? 'control',
    effectiveVariant: historyMetadata?.effectiveVariant ?? 'control',
    historyLoad: historyMetadata?.historyLoad ?? 'not_attempted',
    outcome: result.status < 400 ? 'success' : resultBody?.error?.code ?? 'error',
    latencyMs: Date.now() - startedAt,
    recentHistoryExcludedCount: historyMetadata?.recentHistoryExcludedCount ?? 0,
    recentCooldownRelaxed: historyMetadata?.recentCooldownRelaxed ?? false,
    experimentActive: Boolean(historyMetadata),
    sessionKey: historyExperimentLogKey(result.observability?.sessionId ?? resultBody?.course?.sessionId ?? 'invalid-request'),
  }));

  if (result.status === 204) return new Response(null, { status: 204, headers: corsHeaders });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
