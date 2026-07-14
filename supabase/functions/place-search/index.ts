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

const CODE_LABELS: Record<string, string> = { FD6: '음식점', CE7: '카페', AT4: '관광명소', CT1: '문화시설' };

// Adaptive Retrieval Config (PLAN_GENERATION_ARCHITECTURE_V2.md §8·§19)
const RETRIEVAL = {
  minCandidateCount: 30,
  maxCandidateCount: 80,
  initialPageSize: 15,
  maxPagesPerQuery: 2,
  maxKakaoRequests: 8,
  minIntentQueriesExecuted: 2,
};

type Place = { placeId: string; name: string; category: string; address: string; url: string; x: string; y: string };
type KakaoDoc = {
  id: string; // Kakao doc.id — 요청 간 안정 식별용 placeId (Phase 0)
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
    placeId: doc.id,
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

async function searchCategory(key: string, code: string, label: string, x: string, y: string, radius: number, size = 5, page = 1): Promise<Place[]> {
  const url = `${KAKAO_BASE}/search/category.json?category_group_code=${code}&x=${x}&y=${y}&radius=${radius}&sort=distance&size=${size}&page=${page}`;
  const res = await fetch(url, { headers: authHeaders(key) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents ?? []).map((d: KakaoDoc) => toPlace(d, label));
}

async function searchKeyword(key: string, query: string, label: string, x: string, y: string, radius: number, size = 5, page = 1): Promise<Place[]> {
  const url = `${KAKAO_BASE}/search/keyword.json?query=${encodeURIComponent(query)}&x=${x}&y=${y}&radius=${radius}&sort=distance&size=${size}&page=${page}`;
  const res = await fetch(url, { headers: authHeaders(key) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents ?? []).map((d: KakaoDoc) => toPlace(d, label));
}

// Adaptive Retrieval — 다중 키워드/카테고리 검색을 부분 실패 허용(각 쿼리 독립 catch)으로 돌리고
// placeId 기준 중복 제거, min/max·요청 예산·핵심쿼리 실행 수 기반 early stop을 적용한다 (§8).
async function adaptiveRetrieve(
  key: string, x: string, y: string, radius: number,
  queries: string[], categoryCodes: string[], geocodeCost: number,
): Promise<{ places: Place[]; successfulQueryCount: number; failedQueryCount: number; kakaoRequestCount: number }> {
  const size = RETRIEVAL.initialPageSize;
  const tasks: ((page: number) => Promise<Place[]>)[] = [
    ...queries.map(q => (page: number) => searchKeyword(key, q, q, x, y, radius, size, page)),
    ...categoryCodes.map(code => (page: number) => searchCategory(key, code, CODE_LABELS[code] ?? code, x, y, radius, size, page)),
  ];

  const seen = new Set<string>();
  const places: Place[] = [];
  let successful = 0;
  let failed = 0;
  let kakaoRequestCount = geocodeCost;

  const merge = (res: Place[]) => {
    for (const p of res) {
      if (!p.placeId || seen.has(p.placeId)) continue;
      seen.add(p.placeId);
      places.push(p);
    }
  };

  for (let page = 1; page <= RETRIEVAL.maxPagesPerQuery; page++) {
    // page 2 이전에 early stop 판정: 충분한 후보 + 핵심 intent 쿼리 최소 실행 완료 (§8 재평가)
    if (page > 1) {
      const enoughQueries = successful >= Math.min(RETRIEVAL.minIntentQueriesExecuted, tasks.length);
      if (places.length >= RETRIEVAL.minCandidateCount && enoughQueries) break;
    }

    const batch: Promise<{ ok: boolean; r: Place[] }>[] = [];
    for (const run of tasks) {
      if (kakaoRequestCount >= RETRIEVAL.maxKakaoRequests) break;
      if (places.length >= RETRIEVAL.maxCandidateCount) break;
      kakaoRequestCount++;
      batch.push(run(page).then(r => ({ ok: true, r })).catch(() => ({ ok: false, r: [] as Place[] })));
    }
    if (batch.length === 0) break;

    const settled = await Promise.all(batch);
    for (const s of settled) {
      if (s.ok) { successful++; merge(s.r); } else { failed++; }
    }
    if (places.length >= RETRIEVAL.maxCandidateCount) break;
  }

  return { places: places.slice(0, RETRIEVAL.maxCandidateCount), successfulQueryCount: successful, failedQueryCount: failed, kakaoRequestCount };
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

    const { location, radius, focus, coords, queries, categoryCodes } = await req.json();
    // GPS 좌표가 오면 지오코딩 없이 그대로 사용한다 (x=경도, y=위도). 숫자 형식만 허용해 쿼리 주입을 막는다.
    const COORD_RE = /^-?[0-9]+([.][0-9]+)?$/;
    const hasCoords = coords && typeof coords.x === 'string' && typeof coords.y === 'string'
      && COORD_RE.test(coords.x) && COORD_RE.test(coords.y);
    if (!hasCoords && (typeof location !== 'string' || !location.trim())) {
      return json({ error: 'Invalid request' }, 400);
    }
    const safeRadius = Math.min(Math.max(Number(radius) || 3000, 500), 20000);

    const key = Deno.env.get('KAKAO_REST_API_KEY');
    if (!key) return json({ error: 'Kakao key not configured' }, 500);

    const coord = hasCoords
      ? { x: coords.x, y: coords.y }
      : await geocode(key, (location as string).trim());
    if (!coord) return json({ places: [] });
    const geocodeCost = hasCoords ? 0 : 1;

    // ── Adaptive Retrieval 경로 (Phase 2) — queries/categoryCodes가 오면 다중 쿼리 오케스트레이션 ──
    const safeQueries = Array.isArray(queries)
      ? queries.filter((q: unknown): q is string => typeof q === 'string' && !!q.trim()).slice(0, 8)
      : [];
    const safeCodes = Array.isArray(categoryCodes)
      ? categoryCodes.filter((c: unknown): c is string => typeof c === 'string' && !!CODE_LABELS[c])
      : [];
    if (safeQueries.length > 0 || safeCodes.length > 0) {
      const result = await adaptiveRetrieve(key, coord.x, coord.y, safeRadius, safeQueries, safeCodes, geocodeCost);
      return json({
        places: result.places,
        _meta: {
          origin: coord,
          successfulQueryCount: result.successfulQueryCount,
          failedQueryCount: result.failedQueryCount,
          kakaoRequestCount: result.kakaoRequestCount,
        },
      });
    }

    // ── 현행 경로 (자유생성 하위호환) — focus 감지 시 단일 카테고리/키워드, 아니면 기본 카테고리 세트 ──
    const hasFocus = focus && typeof focus.label === 'string';
    const focusCode = hasFocus && typeof focus.code === 'string' ? focus.code : undefined;
    const focusQuery = hasFocus && typeof focus.query === 'string' ? focus.query : undefined;

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

    return json({ places, _meta: { origin: coord } });
  } catch (err) {
    console.error('place-search error', err);
    return json({ error: 'Internal error' }, 500);
  }
});
