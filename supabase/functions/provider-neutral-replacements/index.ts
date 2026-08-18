import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import { z } from 'zod';
import { fetchNaverLocalPlaces } from '../_shared/providers/naver-place-provider.ts';
import { createNaverSearchCache } from '../_shared/naver-search-cache.ts';
import { discoverProviderNeutralCandidates } from '../_shared/provider-neutral-discovery-pipeline.ts';
import { naverShadowQueries } from '../_shared/recommendation-discovery-strategy.ts';
import { recommendationRequestSchema } from '../../../shared/recommendation/schemas.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const cache = createNaverSearchCache();
const listSchema = z.object({ action: z.literal('list'), sessionId: z.string().trim().min(1), targetStepId: z.string().trim().min(1) }).strict();
const applySchema = z.object({ action: z.literal('apply'), sessionId: z.string().trim().min(1), targetStepId: z.string().trim().min(1), attestationId: z.string().uuid(), providerPlaceId: z.string().trim().min(1) }).strict();
const bodySchema = z.union([listSchema, applySchema]);

type StoredCandidate = { candidateId: string; providerPlaceId: string; name: string; address: string; roadAddress: string; latitude: number; longitude: number };

function jsonObject(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'INVALID_INPUT' }), { status: 405, headers: corsHeaders });
  let body: unknown; try { body = await request.json(); } catch { body = undefined; }
  const parsed = bodySchema.safeParse(body);
  const authorization = request.headers.get('Authorization') ?? '';
  if (!parsed.success) return new Response(JSON.stringify({ error: 'INVALID_INPUT' }), { status: 400, headers: corsHeaders });
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'AUTH_EXPIRED' }), { status: 401, headers: corsHeaders });
  const service = createClient<any>(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: session } = await service.from('recommendation_sessions').select('id,request_id,owner_user_id,latest_request,original_request,current_course,cards').eq('id', parsed.data.sessionId).maybeSingle();
  if (!session || session.owner_user_id !== user.id) return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404, headers: corsHeaders });

  if (parsed.data.action === 'list') {
    const stored = recommendationRequestSchema.safeParse(session.latest_request ?? session.original_request);
    const { data: steps } = await service.from('recommendation_course_steps').select('step_id,category,label,current_place_provider,current_provider_place_id').eq('session_id', session.id).order('step_order');
    const target = (steps ?? []).find((step: { step_id: string }) => step.step_id === parsed.data.targetStepId);
    if (!stored.success || !target || target.current_place_provider !== 'naver') return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404, headers: corsHeaders });
    const replacementRequest = { ...stored.data, courseSteps: [{ id: target.step_id, category: target.category, label: target.label }], excludedPlaceIds: [...new Set([...(stored.data.excludedPlaceIds ?? []), ...(steps ?? []).flatMap((step: { current_provider_place_id?: string | null }) => step.current_provider_place_id ? [step.current_provider_place_id] : [])])] };
    const queries = naverShadowQueries({ locationLabel: replacementRequest.location.label, locationSource: replacementRequest.location.source, stepLabels: [target.label] });
    const discovery = await discoverProviderNeutralCandidates({
      request: replacementRequest,
      primaryAttempts: queries.map((query) => () => fetchNaverLocalPlaces({ query, clientId: Deno.env.get('NAVER_CLIENT_ID') ?? '', clientSecret: Deno.env.get('NAVER_CLIENT_SECRET') ?? '', fetcher: fetch, cache })),
      fallbackAttempts: [], minQualifiedCandidates: 1,
    });
    const candidates: StoredCandidate[] = discovery.candidates.filter((candidate) => candidate.place.category.normalized === (target.category === 'restaurant' ? 'meal' : target.category)).slice(0, 15).map((candidate, index) => ({
      candidateId: `naver_replacement_${String(index + 1).padStart(3, '0')}`,
      providerPlaceId: candidate.place.identity.providerPlaceId,
      name: candidate.place.name,
      address: candidate.place.address?.display ?? '', roadAddress: candidate.place.address?.road ?? '',
      latitude: candidate.place.coordinates?.latitude ?? replacementRequest.location.latitude,
      longitude: candidate.place.coordinates?.longitude ?? replacementRequest.location.longitude,
    }));
    const attestationId = crypto.randomUUID();
    const { error } = await service.from('recommendation_generation_attestations').insert({ request_id: attestationId, session_id: session.id, owner_user_id: user.id, request_json: { type: 'provider_neutral_replacement', baseRequestId: session.request_id, targetStepId: target.step_id }, response_json: { candidates } });
    if (error) return new Response(JSON.stringify({ error: 'OPERATION_FAILED' }), { status: 503, headers: corsHeaders });
    return new Response(JSON.stringify({ targetStepId: target.step_id, candidates, attestationId }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: attestation } = await service.from('recommendation_generation_attestations').select('owner_user_id,session_id,request_json,response_json,consumed_at').eq('request_id', parsed.data.attestationId).maybeSingle();
  const candidates = (jsonObject(attestation?.response_json).candidates as StoredCandidate[] | undefined) ?? [];
  const candidate = candidates.find((entry) => entry.providerPlaceId === parsed.data.providerPlaceId);
  const requestInfo = jsonObject(attestation?.request_json);
  if (!attestation || attestation.owner_user_id !== user.id || attestation.session_id !== session.id || attestation.consumed_at || requestInfo.targetStepId !== parsed.data.targetStepId || !candidate) return new Response(JSON.stringify({ error: 'INVALID_CANDIDATE' }), { status: 422, headers: corsHeaders });
  const course = jsonObject(session.current_course); const courseSteps = Array.isArray(course.steps) ? course.steps : [];
  const oldStep = courseSteps.find((step) => jsonObject(step).stepId === parsed.data.targetStepId);
  if (!oldStep) return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404, headers: corsHeaders });
  const nextStep = { ...jsonObject(oldStep), candidateId: candidate.candidateId, placeIdentity: { provider: 'naver', providerPlaceId: candidate.providerPlaceId }, name: candidate.name, address: candidate.address, roadAddress: candidate.roadAddress, mapUrl: '', latitude: candidate.latitude, longitude: candidate.longitude, reason: '품질 기준을 통과한 다른 후보예요.' };
  const nextCourse = { ...course, steps: courseSteps.map((step) => jsonObject(step).stepId === parsed.data.targetStepId ? nextStep : step) };
  const cards = Array.isArray(session.cards) ? session.cards.map((card: unknown) => { const item = jsonObject(card); const cardSteps = Array.isArray(item.steps) ? item.steps : []; return { ...item, steps: cardSteps.map((step) => { const value = jsonObject(step); return value.candidateId === jsonObject(oldStep).candidateId ? { ...value, candidateId: candidate.candidateId, placeIdentity: nextStep.placeIdentity, place_name: candidate.name, place_address: candidate.roadAddress || candidate.address, map_url: '' } : step; }) }; }) : session.cards;
  const { error: stepError } = await service.from('recommendation_course_steps').update({ current_candidate_id: candidate.candidateId, current_kakao_place_id: null, current_kakao_link_place_id: null, current_place_provider: 'naver', current_provider_place_id: candidate.providerPlaceId, place_name: candidate.name, address: candidate.address, road_address: candidate.roadAddress, map_url: '', latitude: candidate.latitude, longitude: candidate.longitude, reason: nextStep.reason }).eq('session_id', session.id).eq('step_id', parsed.data.targetStepId);
  const { error: sessionError } = await service.from('recommendation_sessions').update({ current_course: nextCourse, cards }).eq('id', session.id).eq('owner_user_id', user.id);
  if (stepError || sessionError) return new Response(JSON.stringify({ error: 'OPERATION_FAILED' }), { status: 503, headers: corsHeaders });
  await service.from('recommendation_generation_attestations').update({ consumed_at: new Date().toISOString() }).eq('request_id', parsed.data.attestationId).is('consumed_at', null);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
