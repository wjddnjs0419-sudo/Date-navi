import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import { createSupabaseKakaoSearchCacheStore } from '../_shared/kakao-search-cache.ts';
import { searchAndRankRecommendation } from '../_shared/recommendation-search-pipeline.ts';
import { lookupPlacePrices } from '../_shared/place-ledger.ts';
import {
  createSupabaseRecommendationHistoryQueryAdapter,
  loadRecommendationHistory,
} from '../_shared/recommendation-history.ts';
import { handleReplacementCandidates } from '../_shared/replacement-candidates-handler.ts';
import { historyExperimentLogKey } from '../../../shared/recommendation/history-experiment.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  let body: unknown;
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
  }
  const authorization = request.headers.get('Authorization');
  const configuredExperimentMode = Deno.env.get('RECOMMENDATION_HISTORY_EXPERIMENT');
  const historyExperimentMode = configuredExperimentMode === 'ab50' || configuredExperimentMode === 'treatment'
    ? configuredExperimentMode
    : 'off';
  const cacheMetrics = { hits: 0, misses: 0, kakaoCalls: 0 };
  const result = await handleReplacementCandidates({
    method: request.method,
    authorization,
    body,
  }, {
    experimentMode: historyExperimentMode,
    authenticate: async (token) => {
      const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: token } },
      });
      const { data: { user }, error } = await client.auth.getUser();
      return error || !user ? null : { id: user.id };
    },
    loadSession: async (sessionId) => {
      const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authorization ?? '' } },
      });
      const { data } = await client.from('recommendation_sessions')
        .select('original_request,latest_request,metadata').eq('id', sessionId).maybeSingle();
      return data ? {
        originalRequest: data.original_request,
        latestRequest: data.latest_request,
        metadata: data.metadata,
      } : null;
    },
    loadSteps: async (sessionId) => {
      const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authorization ?? '' } },
      });
      const { data } = await client.from('recommendation_course_steps')
        .select('step_id,step_order,category,label,current_kakao_place_id,current_candidate_id,place_name,address,road_address,map_url,latitude,longitude,reason,locked')
        .eq('session_id', sessionId).order('step_order');
      return data ?? [];
    },
    loadHistory: async ({ authenticatedUserId, currentLocation, activeSessionId }) => {
      const serviceClient = createClient<any>(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      return loadRecommendationHistory({
        authenticatedUserId,
        currentLocation,
        activeSessionId,
        queries: createSupabaseRecommendationHistoryQueryAdapter(serviceClient),
      });
    },
    searchCandidates: async (currentRequest) => {
      const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      return searchAndRankRecommendation(currentRequest, {
        kakaoRestApiKey: Deno.env.get('KAKAO_REST_API_KEY') ?? '',
        fetcher: fetch,
        cacheStore: createSupabaseKakaoSearchCacheStore(serviceClient),
        cacheMetrics,
        // 생성과 같은 예산 점수를 쓴다 — budget은 score→contextScore→replacementScore로 흐른다.
        priceLookup: (ids) => lookupPlacePrices({ client: serviceClient as never, kakaoPlaceIds: ids }),
      });
    },
    stageCandidateList: async ({ ownerUserId, sessionId, baseRequestId, targetStepId, candidates }) => {
      const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const requestId = crypto.randomUUID();
      const { error } = await client.from('recommendation_generation_attestations').insert({
        request_id: requestId,
        session_id: sessionId,
        owner_user_id: ownerUserId,
        request_json: { type: 'replacement_candidate_list', baseRequestId, targetStepId },
        response_json: { candidateRanks: candidates },
      });
      if (error) throw error;
      return requestId;
    },
  });
  if (result.metrics) {
    const sessionId = body && typeof body === 'object' && !Array.isArray(body)
      && typeof (body as { sessionId?: unknown }).sessionId === 'string'
      ? (body as { sessionId: string }).sessionId
      : undefined;
    console.error(JSON.stringify({
      event: 'replacement_candidates_served',
      ...result.metrics,
      ...(sessionId ? { sessionKey: historyExperimentLogKey(sessionId) } : {}),
    }));
  }
  if (result.status === 204) return new Response(null, { status: 204, headers: corsHeaders });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
