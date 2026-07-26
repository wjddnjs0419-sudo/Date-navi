import { createClient } from 'npm:@supabase/supabase-js@2.106.1';

import { handleRecommendDate } from '../_shared/recommend-date-handler.ts';
import { invokeGenerateAiSelection } from '../_shared/recommend-date-downstream.ts';
import { createSupabaseKakaoSearchCacheStore } from '../_shared/kakao-search-cache.ts';
import { searchAndRankRecommendation } from '../_shared/recommendation-search-pipeline.ts';
import {
  createSupabaseRecommendationHistoryQueryAdapter,
  loadRecommendationHistory,
} from '../_shared/recommendation-history.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  const startedAt = Date.now();
  const assignedVariant = Deno.env.get('RECOMMENDATION_HISTORY_DIVERSITY_TREATMENT') === 'true'
    ? 'treatment' as const
    : 'control' as const;
  let body: unknown;
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
  }

  const result = await handleRecommendDate({
    method: request.method,
    authorization: request.headers.get('Authorization'),
    body,
  }, {
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
    historyExperiment: { assignedVariant, assignmentUnit: 'user' },
    generateSelection: (input) => invokeGenerateAiSelection({
      ...input,
      supabaseUrl: Deno.env.get('SUPABASE_URL')!,
      anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
    }),
    parseStepIntentsAi: (input) => invokeGenerateAiSelection({
      ...input,
      action: 'parse_step_intents',
      supabaseUrl: Deno.env.get('SUPABASE_URL')!,
      anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
    }, { timeoutMs: 8_000 }),
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
  } | null;
  const historyMetadata = resultBody?.metadata?.historyExperiment;
  console.error(JSON.stringify({
    event: 'recommend_date_history_outcome',
    assignedVariant: historyMetadata?.assignedVariant ?? assignedVariant,
    effectiveVariant: historyMetadata?.effectiveVariant ?? 'control',
    historyLoad: historyMetadata?.historyLoad ?? 'not_attempted',
    outcome: result.status < 400 ? 'success' : resultBody?.error?.code ?? 'error',
    latencyMs: Date.now() - startedAt,
    recentHistoryExcludedCount: historyMetadata?.recentHistoryExcludedCount ?? 0,
    recentCooldownRelaxed: historyMetadata?.recentCooldownRelaxed ?? false,
  }));

  if (result.status === 204) return new Response(null, { status: 204, headers: corsHeaders });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
