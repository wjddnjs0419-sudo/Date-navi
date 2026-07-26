import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import { z } from 'zod';
import { recommendationRequestSchema } from '../../../shared/recommendation/schemas.ts';
import {
  rankReplacementCandidates,
  storedReplacementHistoryVariant,
  toReplacementCandidateDisplay,
} from '../../../shared/recommendation/replacement-candidates.ts';
import { EMPTY_RECOMMENDATION_HISTORY } from '../../../shared/recommendation/recommendation-history.ts';
import { createSupabaseKakaoSearchCacheStore } from '../_shared/kakao-search-cache.ts';
import { searchAndRankRecommendation } from '../_shared/recommendation-search-pipeline.ts';
import { candidateMatchesCategory } from '../_shared/recommendation-course-selection.ts';
import { effectiveStepIntents, placeMatchesStepIntent } from '../_shared/step-intent.ts';
import {
  createSupabaseRecommendationHistoryQueryAdapter,
  loadRecommendationHistory,
} from '../_shared/recommendation-history.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const bodySchema = z.object({ sessionId: z.string().trim().min(1).max(120), targetStepId: z.string().trim().min(1).max(80) }).strict();

const authenticate = async (getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }>) => {
  const { data: { user }, error } = await getUser();
  return error || !user ? null : user;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'INVALID_INPUT' }), { status: 405, headers: corsHeaders });
  const authorization = request.headers.get('Authorization');
  if (!authorization) return new Response(JSON.stringify({ error: 'AUTH_EXPIRED' }), { status: 401, headers: corsHeaders });
  const parsed = bodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return new Response(JSON.stringify({ error: 'INVALID_INPUT' }), { status: 400, headers: corsHeaders });

  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
  const user = await authenticate(() => client.auth.getUser());
  if (!user) return new Response(JSON.stringify({ error: 'AUTH_EXPIRED' }), { status: 401, headers: corsHeaders });
  const { data: session } = await client.from('recommendation_sessions').select('original_request,latest_request,metadata').eq('id', parsed.data.sessionId).maybeSingle();
  const { data: rows } = await client.from('recommendation_course_steps').select('step_id,step_order,category,label,current_kakao_place_id,current_candidate_id,place_name,address,road_address,map_url,latitude,longitude,reason,locked').eq('session_id', parsed.data.sessionId).order('step_order');
  const baseRequest = recommendationRequestSchema.safeParse(session?.latest_request ?? session?.original_request);
  const target = rows?.find((row) => row.step_id === parsed.data.targetStepId);
  if (!baseRequest.success || !target || !rows || rows.length < 2) return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404, headers: corsHeaders });
  const currentRequest = { ...baseRequest.data, courseSteps: [{ id: target.step_id, category: target.category, label: target.label }], excludedPlaceIds: [...new Set([...(baseRequest.data.excludedPlaceIds ?? []), ...rows.map((row) => row.current_kakao_place_id)])] };
  const startedAt = Date.now();
  const cacheMetrics = { hits: 0, misses: 0, kakaoCalls: 0 };
  const assignedVariant = storedReplacementHistoryVariant(session?.metadata);
  let effectiveVariant: 'control' | 'treatment' = 'control';
  let historyLoad: 'not_attempted' | 'loaded' | 'failed' = 'not_attempted';
  let history = EMPTY_RECOMMENDATION_HISTORY;
  if (assignedVariant === 'treatment') {
    try {
      const serviceClient = createClient<any>(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const loaded = await loadRecommendationHistory({
        authenticatedUserId: user.id,
        currentLocation: currentRequest.location,
        activeSessionId: parsed.data.sessionId,
        queries: createSupabaseRecommendationHistoryQueryAdapter(serviceClient),
      });
      if (loaded.status === 'loaded') {
        history = loaded.context;
        effectiveVariant = 'treatment';
        historyLoad = 'loaded';
      } else {
        historyLoad = 'failed';
        effectiveVariant = 'control';
      }
    } catch {
      historyLoad = 'failed';
      effectiveVariant = 'control';
    }
  }
  try {
    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const search = await searchAndRankRecommendation(currentRequest, {
      kakaoRestApiKey: Deno.env.get('KAKAO_REST_API_KEY') ?? '',
      fetcher: fetch,
      cacheStore: createSupabaseKakaoSearchCacheStore(serviceClient),
      cacheMetrics,
    });
    const toStep = (row: typeof rows[number]) => ({ stepId: row.step_id, order: row.step_order, category: row.category, label: row.label, candidateId: row.current_candidate_id, kakaoPlaceId: row.current_kakao_place_id, name: row.place_name, address: row.address, roadAddress: row.road_address, mapUrl: row.map_url, latitude: row.latitude, longitude: row.longitude, reason: row.reason, locked: row.locked });
    const targetIndex = rows.indexOf(target);
    const previousStep = targetIndex > 0 ? toStep(rows[targetIndex - 1]) : undefined;
    const nextStep = targetIndex < rows.length - 1 ? toStep(rows[targetIndex + 1]) : undefined;
    const requiredTargetIntents = effectiveStepIntents(currentRequest).filter((intent) => (
      intent.stepId === target.step_id && intent.strength === 'required'
    ));
    const categoryCompatibleCandidates = search.candidates
      .filter((candidate) => candidateMatchesCategory(candidate, target.category));
    const hardFilteredCandidates = categoryCompatibleCandidates
      .filter((candidate) => requiredTargetIntents.every((intent) => placeMatchesStepIntent(candidate, intent)));
    const ranked = rankReplacementCandidates({
      target: toStep(target),
      previous: previousStep,
      next: nextStep,
      existingKakaoPlaceIds: rows.map((row) => row.current_kakao_place_id),
      // Category and required intent compatibility remain hard filters before history is scored.
      candidates: hardFilteredCandidates,
      maxWalkingMinutes: currentRequest.maxWalkingMinutes,
      history,
      preferences: {
        quietPreferred: currentRequest.quietPreferred ?? currentRequest.parsedPreferences?.quietPreferred,
        photoFriendlyPreferred: currentRequest.photoFriendlyPreferred ?? currentRequest.parsedPreferences?.photoFriendlyPreferred,
      },
    });
    const top = ranked.top.map(toReplacementCandidateDisplay);
    const additional = ranked.additional.map(toReplacementCandidateDisplay);
    const topThreeRepeatCount = effectiveVariant === 'treatment'
      ? ranked.top.filter((candidate) => history.recentHardPlaceIds.includes(candidate.kakaoPlaceId)).length
      : 0;

    console.error(JSON.stringify({
      event: 'replacement_candidates_served',
      assignedVariant,
      effectiveVariant,
      poolSize: ranked.pool.length,
      topThreeRepeatCount,
      empty: ranked.pool.length === 0,
      latencyMs: Date.now() - startedAt,
      loaderStatus: historyLoad,
    }));
    return new Response(JSON.stringify({ targetStepId: target.step_id, top, additional }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'PLACE_SEARCH_TIMEOUT' }), { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
