import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import { z } from 'zod';
import { recommendationRequestSchema } from '../../../shared/recommendation/schemas.ts';
import { rankReplacementCandidates } from '../../../shared/recommendation/replacement-candidates.ts';
import { searchAndRankRecommendation } from '../_shared/recommendation-search-pipeline.ts';
import { candidateMatchesCategory } from '../_shared/recommendation-course-selection.ts';

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
  const { data: session } = await client.from('recommendation_sessions').select('original_request,latest_request').eq('id', parsed.data.sessionId).maybeSingle();
  const { data: rows } = await client.from('recommendation_course_steps').select('step_id,step_order,category,label,current_kakao_place_id,current_candidate_id,place_name,address,road_address,map_url,latitude,longitude,reason,locked').eq('session_id', parsed.data.sessionId).order('step_order');
  const baseRequest = recommendationRequestSchema.safeParse(session?.latest_request ?? session?.original_request);
  const target = rows?.find((row) => row.step_id === parsed.data.targetStepId);
  if (!baseRequest.success || !target || !rows || rows.length < 2) return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404, headers: corsHeaders });
  const currentRequest = { ...baseRequest.data, courseSteps: rows.map((row) => ({ id: row.step_id, category: row.category, label: row.label })), excludedPlaceIds: [...new Set([...(baseRequest.data.excludedPlaceIds ?? []), ...rows.map((row) => row.current_kakao_place_id)])] };
  try {
    const search = await searchAndRankRecommendation(currentRequest, { kakaoRestApiKey: Deno.env.get('KAKAO_REST_API_KEY') ?? '', fetcher: fetch });
    const toStep = (row: typeof rows[number]) => ({ stepId: row.step_id, order: row.step_order, category: row.category, label: row.label, candidateId: row.current_candidate_id, kakaoPlaceId: row.current_kakao_place_id, name: row.place_name, address: row.address, roadAddress: row.road_address, mapUrl: row.map_url, latitude: row.latitude, longitude: row.longitude, reason: row.reason, locked: row.locked });
    const targetIndex = rows.indexOf(target);
    const ranked = rankReplacementCandidates({ target: toStep(target), previous: targetIndex > 0 ? toStep(rows[targetIndex - 1]) : undefined, next: targetIndex < rows.length - 1 ? toStep(rows[targetIndex + 1]) : undefined, existingKakaoPlaceIds: rows.map((row) => row.current_kakao_place_id), candidates: search.candidates.filter((candidate) => candidateMatchesCategory(candidate, target.category)), maxWalkingMinutes: currentRequest.maxWalkingMinutes });
    return new Response(JSON.stringify({ targetStepId: target.step_id, top: ranked.top, additional: ranked.additional, limit: 15 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'PLACE_SEARCH_TIMEOUT' }), { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
