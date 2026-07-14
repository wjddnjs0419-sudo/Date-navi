// Phase 3 — Candidate Processing (순수 로직).
// KakaoPlace[] + PlanIntent → Dedup(by placeId) → Evidence Scoring → Ranking → Top N Candidate[].
// Kakao에 없는 정보(소음·가격·혼잡도 등)는 점수화하지 않는다. (PLAN_GENERATION_ARCHITECTURE_V2.md §9)

import type { KakaoPlace } from './place';
import type { PlanIntent, PlaceType } from './intent';

export type Candidate = {
  placeId: string;
  candidateId: string; // 'candidate_001' — 요청 내 임시 ID (Claude 전달/검증 전용, 요청 간 식별 금지)
  name: string;
  category: string;
  address: string;
  x: string;
  y: string;
  mapUrl: string;
  matchedQueries: string[];
  matchedIntentSignals: string[];
  score: number;
};

export type CandidateConfig = {
  rankedCandidateLimit: number;
};

export const DEFAULT_CANDIDATE_CONFIG: CandidateConfig = {
  rankedCandidateLimit: 20,
};

// placeType(영문 토큰) → Kakao가 반환하는 category 한글 라벨. Base Category Match 판정용.
const PLACE_TYPE_LABELS: Record<PlaceType, string[]> = {
  cafe: ['카페'],
  restaurant: ['음식점'],
  bar: ['술집'],
  culture: ['문화시설'],
  attraction: ['관광명소'],
  activity: ['액티비티'],
  sports: ['스포츠'],
};

const SCORE = {
  baseCategoryMatch: 3,
  intentKeywordMatch: 3,
  primaryQueryMatch: 5,
  positiveSignal: 2,
  extraQuery: 1,
  negativeSignal: -5,
};

// Deduplication 우선순위: ① placeId → ② mapUrl → ③ name+address. (§9)
function dedupKey(p: KakaoPlace): string {
  if (p.placeId) return `id:${p.placeId}`;
  if (p.url) return `url:${p.url}`;
  return `na:${p.name}|${p.address}`;
}

function dedup(places: KakaoPlace[]): KakaoPlace[] {
  const seen = new Set<string>();
  const out: KakaoPlace[] = [];
  for (const p of places) {
    const key = dedupKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function scorePlace(p: KakaoPlace, intent: PlanIntent): { score: number; matchedQueries: string[]; matchedIntentSignals: string[] } {
  const haystack = `${p.name} ${p.category}`;
  let score = 0;

  // Base Category Match — 장소 category가 intent placeType 라벨에 해당하는가.
  const categoryLabels = intent.placeTypes.flatMap(t => PLACE_TYPE_LABELS[t]);
  if (categoryLabels.some(label => p.category.includes(label))) score += SCORE.baseCategoryMatch;

  // Intent Keyword / Query Match — searchQueries 중 이름·카테고리에 나타난 것.
  const matchedQueries = intent.searchQueries.filter(q => haystack.includes(q));
  if (matchedQueries.length > 0) {
    score += SCORE.intentKeywordMatch;
    score += (matchedQueries.length - 1) * SCORE.extraQuery; // Multiple Query Match
    if (intent.primaryQuery && matchedQueries.includes(intent.primaryQuery)) score += SCORE.primaryQueryMatch;
    if (intent.normalizedQuery && matchedQueries.includes(intent.normalizedQuery)) score += SCORE.primaryQueryMatch;
  }

  // Positive Signal Match.
  const matchedIntentSignals = intent.positiveSignals.filter(s => haystack.includes(s));
  score += matchedIntentSignals.length * SCORE.positiveSignal;

  // Negative Signal Match (name/category 문자열에만 적용 — 효과 과대평가 금지, §9).
  const negativeHits = intent.negativeSignals.filter(s => haystack.includes(s)).length;
  score += negativeHits * SCORE.negativeSignal;

  return { score, matchedQueries, matchedIntentSignals };
}

const pad3 = (n: number): string => String(n).padStart(3, '0');

export function buildCandidates(
  places: KakaoPlace[],
  intent: PlanIntent,
  config: CandidateConfig = DEFAULT_CANDIDATE_CONFIG,
): Candidate[] {
  const scored = dedup(places).map(p => {
    const { score, matchedQueries, matchedIntentSignals } = scorePlace(p, intent);
    return { p, score, matchedQueries, matchedIntentSignals };
  });

  // 안정 정렬: score 내림차순, 동점이면 입력 순서 유지.
  const ranked = scored
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, config.rankedCandidateLimit);

  return ranked.map((s, idx) => ({
    placeId: s.p.placeId,
    candidateId: `candidate_${pad3(idx + 1)}`,
    name: s.p.name,
    category: s.p.category,
    address: s.p.address,
    x: s.p.x,
    y: s.p.y,
    mapUrl: s.p.url,
    matchedQueries: s.matchedQueries,
    matchedIntentSignals: s.matchedIntentSignals,
    score: s.score,
  }));
}
