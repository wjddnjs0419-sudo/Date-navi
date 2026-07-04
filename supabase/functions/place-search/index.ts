import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const KAKAO_BASE = 'https://dapi.kakao.com/v2/local';

// 카카오 카테고리 코드 → 화면/프롬프트에 쓸 한글 라벨
const CATEGORIES: { code: string; label: string }[] = [
  { code: 'FD6', label: '음식점' },
  { code: 'CE7', label: '카페' },
  { code: 'AT4', label: '관광명소' },
  { code: 'CT1', label: '문화시설' }, // 전시/공연 등
];
// 별도 카테고리 코드가 없는 술집은 키워드로 보강
const KEYWORDS: { query: string; label: string }[] = [{ query: '술집', label: '술집' }];

type Place = { name: string; category: string; address: string; url: string; x: string; y: string };
type KakaoDoc = {
  place_name: string;
  road_address_name?: string;
  address_name?: string;
  place_url?: string;
  x: string;
  y: string;
};

const authHeaders = (key: string) => ({ Authorization: `KakaoAK ${key}` });

function toPlace(doc: KakaoDoc, category: string): Place {
  return {
    name: doc.place_name,
    category,
    address: doc.road_address_name || doc.address_name || '',
    url: doc.place_url || '',
    x: doc.x,
    y: doc.y,
  };
}

// location 텍스트 → 대표 좌표 1개
async function geocode(key: string, location: string): Promise<{ x: string; y: string } | null> {
  const url = `${KAKAO_BASE}/search/keyword.json?query=${encodeURIComponent(location)}&size=1`;
  const res = await fetch(url, { headers: authHeaders(key) });
  if (!res.ok) return null;
  const data = await res.json();
  const doc = data.documents?.[0];
  return doc ? { x: doc.x, y: doc.y } : null;
}

async function searchCategory(key: string, code: string, label: string, x: string, y: string, radius: number, size = 5): Promise<Place[]> {
  const url = `${KAKAO_BASE}/search/category.json?category_group_code=${code}&x=${x}&y=${y}&radius=${radius}&sort=distance&size=${size}`;
  const res = await fetch(url, { headers: authHeaders(key) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents ?? []).map((d: KakaoDoc) => toPlace(d, label));
}

async function searchKeyword(key: string, query: string, label: string, x: string, y: string, radius: number, size = 5): Promise<Place[]> {
  const url = `${KAKAO_BASE}/search/keyword.json?query=${encodeURIComponent(query)}&x=${x}&y=${y}&radius=${radius}&sort=distance&size=${size}`;
  const res = await fetch(url, { headers: authHeaders(key) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents ?? []).map((d: KakaoDoc) => toPlace(d, label));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 로그인된 사용자만 호출 가능
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const { location, radius, focus, coords } = await req.json();
    // GPS 좌표가 오면 지오코딩 없이 그대로 사용한다 (x=경도, y=위도). 숫자 형식만 허용해 쿼리 주입을 막는다.
    const COORD_RE = /^-?\d+(\.\d+)?$/;
    const hasCoords = coords && typeof coords.x === 'string' && typeof coords.y === 'string'
      && COORD_RE.test(coords.x) && COORD_RE.test(coords.y);
    if (!hasCoords && (typeof location !== 'string' || !location.trim())) {
      return json({ error: 'Invalid request' }, 400);
    }
    const safeRadius = Math.min(Math.max(Number(radius) || 3000, 500), 20000);
    // freeText에서 "카페"/"맛집" 등 카테고리가 감지된 경우에만 채워짐 — 있으면 그 카테고리만 검색해 후보를 좁힌다.
    const hasFocus = focus && typeof focus.label === 'string';
    const focusCode = hasFocus && typeof focus.code === 'string' ? focus.code : undefined;
    const focusQuery = hasFocus && typeof focus.query === 'string' ? focus.query : undefined;

    const key = Deno.env.get('KAKAO_REST_API_KEY');
    if (!key) return json({ error: 'Kakao key not configured' }, 500);

    const coord = hasCoords
      ? { x: coords.x, y: coords.y }
      : await geocode(key, (location as string).trim());
    if (!coord) return json({ places: [] });

    const results = focusCode
      ? await Promise.all([searchCategory(key, focusCode, focus.label, coord.x, coord.y, safeRadius, 15)])
      : focusQuery
        ? await Promise.all([searchKeyword(key, focusQuery, focus.label, coord.x, coord.y, safeRadius, 15)])
        : await Promise.all([
          ...CATEGORIES.map(c => searchCategory(key, c.code, c.label, coord.x, coord.y, safeRadius)),
          ...KEYWORDS.map(k => searchKeyword(key, k.query, k.label, coord.x, coord.y, safeRadius)),
        ]);

    // 병합 + 이름 기준 중복 제거 + 최대 20개
    const seen = new Set<string>();
    const places: Place[] = [];
    for (const p of results.flat()) {
      if (!p.name || seen.has(p.name)) continue;
      seen.add(p.name);
      places.push(p);
      if (places.length >= 20) break;
    }

    return json({ places });
  } catch (err) {
    console.error('place-search error', err);
    return json({ error: 'Internal error' }, 500);
  }
});
