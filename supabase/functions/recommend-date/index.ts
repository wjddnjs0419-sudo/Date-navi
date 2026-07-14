import { createClient } from 'npm:@supabase/supabase-js@2.106.1';

import { handleRecommendDate } from '../_shared/recommend-date-handler.ts';
import { invokeGenerateAiSelection } from '../_shared/recommend-date-downstream.ts';
import { searchAndRankRecommendation } from '../_shared/recommendation-search-pipeline.ts';

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
    searchCandidates: (input) => searchAndRankRecommendation(input, {
      kakaoRestApiKey: Deno.env.get('KAKAO_REST_API_KEY') ?? '',
      fetcher: fetch,
    }),
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
  });

  if (result.status === 204) return new Response(null, { status: 204, headers: corsHeaders });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
