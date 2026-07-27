// 목적: 커버리지가 아니라 추정 품질 검증(스펙 §4). 이름만으로 가격대를 아는 개발 중
// 장소들로 AI 추정 로직을 출시 전에 사람이 검증한다. 결과는 markdown 표로 출력한다.
// 실행: npm run backfill:place-prices  (scripts/.env.eval.local + KAKAO_REST_API_KEY 필요)
// 프롬프트·파서는 Edge와 단일 소스(supabase/functions/_shared/place-price-prompt.ts).
import { createClient } from '@supabase/supabase-js';
import {
  buildPlacePriceEstimationPrompt,
  parsePlacePriceEstimate,
  PLACE_PRICE_PROMPT_VERSION,
} from '../supabase/functions/_shared/place-price-prompt';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const MODEL = 'claude-haiku-4-5';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY || !KAKAO_REST_API_KEY) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, KAKAO_REST_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Step = {
  current_kakao_place_id: string | null;
  place_name: string | null;
  address: string | null;
  road_address: string | null;
  map_url: string | null;
  latitude: number | null;
  longitude: number | null;
};

// 스텝 테이블에는 카테고리가 없어 카카오 재조회로 보강한다(프롬프트 입력 요건).
async function kakaoCategory(name: string, id: string) {
  const response = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(name)}&size=15`,
    { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } },
  );
  if (!response.ok) {
    console.error(`kakao ${response.status} — ${name}`);
    return { categoryName: '', categoryGroupCode: '', resolved: false };
  }
  const body = await response.json() as { documents?: { id: string; category_name?: string; category_group_code?: string }[] };
  const doc = (body.documents ?? []).find((d) => d.id === id);
  // 카테고리가 비면 프롬프트 입력이 부실해져 검증 표본 자체가 오염된다 — 표에 드러낸다.
  return {
    categoryName: doc?.category_name ?? '',
    categoryGroupCode: doc?.category_group_code ?? '',
    resolved: Boolean(doc),
  };
}

async function estimate(prompt: string): Promise<unknown> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 256,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = await response.json() as { content?: { text?: string }[] };
  const text = body.content?.[0]?.text ?? '';
  try {
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
}

async function main() {
  const { data: steps, error } = await supabase
    .from('recommendation_course_steps')
    .select('current_kakao_place_id, place_name, address, road_address, map_url, latitude, longitude');
  if (error) throw error;

  const byId = new Map<string, Step>();
  for (const step of (steps ?? []) as Step[]) {
    if (step.current_kakao_place_id && step.place_name) byId.set(step.current_kakao_place_id, step);
  }
  console.error(`고유 장소 ${byId.size}곳 추정 시작 (model=${MODEL}, prompt=${PLACE_PRICE_PROMPT_VERSION})`);

  const rows = ['| 장소 | 카테고리 | 추정(1인) | 판정 |', '|---|---|---|---|'];
  let failures = 0;
  let unresolvedCategories = 0;
  for (const [id, step] of byId) {
    const category = await kakaoCategory(step.place_name!, id);
    if (!category.resolved) unresolvedCategories += 1;
    const raw = await estimate(buildPlacePriceEstimationPrompt({
      placeName: step.place_name!,
      categoryName: category.categoryName,
      address: step.address ?? '',
    }));
    const parsed = parsePlacePriceEstimate(raw);
    if (parsed) {
      const { error: upsertError } = await supabase.from('places').upsert([{
        kakao_place_id: id,
        place_name: step.place_name,
        address: step.address,
        road_address: step.road_address,
        map_url: step.map_url,
        latitude: step.latitude,
        longitude: step.longitude,
        category_name: category.categoryName,
        category_group_code: category.categoryGroupCode,
        estimated_min_krw: parsed.minKRW,
        estimated_max_krw: parsed.maxKRW,
        estimated_at: new Date().toISOString(),
        estimate_model: MODEL,
        // Edge의 upsert(_shared/place-ledger.ts)와 같은 갱신 시점을 남긴다.
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }], { onConflict: 'kakao_place_id' });
      if (upsertError) console.error(`upsert 실패 ${step.place_name}: ${upsertError.message}`);
    } else {
      failures += 1;
    }
    rows.push(`| ${step.place_name} | ${category.categoryName} | ${
      parsed ? `${parsed.minKRW.toLocaleString()}~${parsed.maxKRW.toLocaleString()}원` : '실패'
    } |  |`);
  }

  console.log(rows.join('\n'));
  console.log(
    `\nprompt version: ${PLACE_PRICE_PROMPT_VERSION} · model: ${MODEL}`
    + ` · 파싱 실패 ${failures}건 · 카테고리 미해결 ${unresolvedCategories}건`,
  );
  // 목적이 품질 검증이라 재실행 시에도 전 장소를 다시 추정한다(프롬프트 수정 후 재비교).
  return failures;
}

main().then((failures) => { if (failures > 0) process.exitCode = 1; }).catch((e) => {
  console.error(e);
  process.exit(1);
});
