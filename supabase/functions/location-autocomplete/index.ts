import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handleLocationAutocomplete,
  LocationAutocompleteProviderError,
  type LocationDocument,
} from '../_shared/location-autocomplete-handler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

// Keep the mobile provider contract visible here: the shared handler calls these
// same Kakao endpoints with keyword-first and address fallback results.
const MOBILE_KAKAO_KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const MOBILE_KAKAO_ADDRESS_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/address.json';
void MOBILE_KAKAO_KEYWORD_ENDPOINT;
void MOBILE_KAKAO_ADDRESS_ENDPOINT;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await request.json();
    const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 80) : '';
    if (Array.from(query).length < 2) return json({ documents: [] });

    const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY');
    if (!kakaoKey) return json({ error: 'Kakao key not configured' }, 500);

    const documents: LocationDocument[] = await handleLocationAutocomplete(query, fetch, kakaoKey);
    return json({ documents });
  } catch (error) {
    console.error('location-autocomplete error', error);
    if (error instanceof LocationAutocompleteProviderError) {
      return json({ error: 'Location search failed' }, 502);
    }
    return json({ error: 'Internal error' }, 500);
  }
});
