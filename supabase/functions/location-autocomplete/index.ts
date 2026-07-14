import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

type KakaoDocument = {
  id?: string;
  place_name?: string;
  category_name?: string;
  category_group_code?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
};

type KakaoAddressDocument = {
  address_name?: string;
  x?: string;
  y?: string;
  address?: { region_3depth_name?: string } | null;
  road_address?: { region_3depth_name?: string } | null;
};

type LocationDocument = {
  id?: string;
  placeName: string;
  categoryName: string;
  categoryGroupCode: string;
  addressName: string;
  roadAddressName: string;
  x: string;
  y: string;
};

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

    const encodedQuery = encodeURIComponent(query);
    const headers = { Authorization: `KakaoAK ${kakaoKey}` };
    const [keywordResponse, addressResponse] = await Promise.all([
      fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodedQuery}&size=15&sort=accuracy`, { headers }),
      fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodedQuery}&size=10`, { headers }),
    ]);
    if (!keywordResponse.ok && !addressResponse.ok) return json({ error: 'Location search failed' }, 502);

    const keywordPayload = keywordResponse.ok ? await keywordResponse.json() : { documents: [] };
    const addressPayload = addressResponse.ok ? await addressResponse.json() : { documents: [] };
    const keywordDocuments: KakaoDocument[] = Array.isArray(keywordPayload?.documents) ? keywordPayload.documents : [];
    const addressDocuments: KakaoAddressDocument[] = Array.isArray(addressPayload?.documents) ? addressPayload.documents : [];
    const documents: LocationDocument[] = keywordDocuments
      .filter((document) => (
        typeof document.id === 'string'
        && typeof document.place_name === 'string'
        && typeof document.x === 'string'
        && typeof document.y === 'string'
      ))
      .map((document) => ({
        id: document.id!,
        placeName: document.place_name!,
        categoryName: document.category_name ?? '',
        categoryGroupCode: document.category_group_code ?? '',
        addressName: document.address_name ?? '',
        roadAddressName: document.road_address_name ?? '',
        x: document.x!,
        y: document.y!,
      }));
    for (const address of addressDocuments) {
      const placeName = address.address?.region_3depth_name
        || address.road_address?.region_3depth_name
        || address.address_name;
      if (!placeName || typeof address.x !== 'string' || typeof address.y !== 'string') continue;
      documents.push({
        placeName,
        categoryName: '지역 > 주소',
        categoryGroupCode: '',
        addressName: address.address_name ?? '',
        roadAddressName: '',
        x: address.x,
        y: address.y,
      });
    }

    return json({ documents });
  } catch (error) {
    console.error('location-autocomplete error', error);
    return json({ error: 'Internal error' }, 500);
  }
});
