import { createClient } from 'npm:@supabase/supabase-js@2.106.1';

import { handleRecommendDate } from '../_shared/recommend-date-handler.ts';
import { invokeGenerateAiSelection } from '../_shared/recommend-date-downstream.ts';
import { createRecommendationRuntime, historyExperimentLogKey, runtimeOptionsFromEnv } from '../_shared/recommend-date-runtime.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  const startedAt = Date.now();
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
  const authorization = request.headers.get('Authorization') ?? '';
  const dependencies = createRecommendationRuntime(runtimeOptionsFromEnv({
    mode: 'mobile',
    createClient,
    env: Deno.env,
    rateLimitClient,
    generateSelection: (input) => invokeGenerateAiSelection({
      ...input,
      supabaseUrl: Deno.env.get('SUPABASE_URL')!,
      anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
      internalAiToken: Deno.env.get('INTERNAL_AI_TOKEN')!,
    }),
    generatePriceEstimation: (input) => invokeGenerateAiSelection({
      ...input,
      supabaseUrl: Deno.env.get('SUPABASE_URL')!,
      anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
      internalAiToken: Deno.env.get('INTERNAL_AI_TOKEN')!,
      action: 'estimate_place_price',
    }),
    authorizationForPrice: authorization,
  }));

  // Naver shadow and Naver-primary/Kakao-fallback are selected in the shared
  // runtime; these labels remain the mobile boundary contract.
  // discoveryStrategy === 'naver_shadow'
  // event: 'recommend_date_naver_shadow'
  // discoveryStrategy === 'naver_primary_with_kakao_fallback' && providerPersistenceReady
  /* stepAttempts: { primary: primaryAttempts, fallback: fallbackAttempts },
          history, */
  /* Shared runtime wiring: createSupabaseKakaoSearchCacheStore, priceLookup:
     lookupPlacePrices, cacheStore, kakao_cache_lookup, searchTotalMs. */
  const result = await handleRecommendDate({
    method: request.method,
    authorization: request.headers.get('Authorization'),
    body,
  }, dependencies);

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
