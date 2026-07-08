// Phase 4·5 — Claude candidate 선택 플로우 순수 로직.
// 위치가 있을 때만 쓰인다. Kakao 검색·Claude 호출은 lib/ai.ts가 담당.
// (PLAN_GENERATION_ARCHITECTURE_V2.md §10·§11·§12·§16)
import type { AppLanguage } from './i18n';
import type { FeelingInput, UserPreferences, DateCard } from './ai';
import type { Candidate } from './candidate';
import type { PlanIntent } from './intent';
import type { CourseStep } from './course';
import { RECOMMENDATION_CONFIG } from './recommendationConfig';
import { DURATION_MAP, DURATION_MAP_EN } from './prompt';

export type IntentMode = 'feeling' | 'make_course';

export type FeelingRec = { candidate_id?: string; title?: string; summary?: string; why_recommended?: string; tags?: string[] };
export type CourseRec = { title?: string; summary?: string; why_recommended?: string; tags?: string[]; steps?: { candidate_id?: string; label?: string; desc?: string }[] };

// make_course만 course. 나머지(feeling/next_meet 및 구 카드의 레거시 pick_for_me/light)는 단일 장소 카드 → feeling.
export function resolveIntentMode(mode: string): IntentMode {
  return mode === 'make_course' ? 'make_course' : 'feeling';
}

// estimated_time은 실제 장소 소요시간이 아니라 "사용자가 고른 시간 범위"다 (§11).
// estimated_budget은 항상 빈 문자열 — 예산은 실제 장소 데이터로 검증할 수 없어 AI 추천 근거에서 제외한다.
export function deterministicFields(
  input: FeelingInput,
  language: AppLanguage,
): { estimated_time: string; estimated_budget: string } {
  const durationMap = language === 'en' ? DURATION_MAP_EN : DURATION_MAP;
  return {
    estimated_budget: '',
    estimated_time: input.duration ? (durationMap[input.duration] ?? input.duration) : '',
  };
}

const clampCandidates = (c: Candidate[]): Candidate[] => c.slice(0, RECOMMENDATION_CONFIG.haikuCandidateLimit);

export function buildCandidatesBlock(candidates: Candidate[], language: AppLanguage): string {
  const list = clampCandidates(candidates)
    .map(c => `- ${c.candidateId} | ${c.name} | ${c.category} | ${c.address}`)
    .join('\n');
  return language === 'en'
    ? `【Candidate places (choose only from these)】\n${list}`
    : `【후보 장소 (반드시 이 중에서만 선택)】\n${list}`;
}

// §10 속성 사실 단정 금지.
const NO_FACT_RULE_KO =
  '없는 속성(조용함/저렴함/혼잡도/분위기 등)을 사실로 단정하지 마세요. 카테고리·거리·검색어 일치 같은 확인 가능한 근거로만 설명하세요.';
const NO_FACT_RULE_EN =
  'Do not claim unsupported venue attributes (quiet/cheap/crowd/vibe) as facts. Explain only from available signals: category, distance, matched query.';

function prefsHint(prefs: UserPreferences | undefined, language: AppLanguage): string {
  if (!prefs) return '';
  const parts: string[] = [];
  if (prefs.preferred_tags?.length) parts.push(prefs.preferred_tags.join(', '));
  if (prefs.avoid_tags?.length) parts.push((language === 'en' ? 'avoid: ' : '피하기: ') + prefs.avoid_tags.join(', '));
  if (!parts.length) return '';
  return (language === 'en' ? '\n【Couple preferences】\n' : '\n【커플 취향】\n') + parts.join(' / ');
}

export function buildFeelingSelectPrompt(
  candidates: Candidate[], intent: PlanIntent, input: FeelingInput,
  prefs: UserPreferences | undefined, language: AppLanguage,
): string {
  const block = buildCandidatesBlock(candidates, language);
  const note = input.freeText ? `\n${language === 'en' ? 'Note' : '메모'}: ${input.freeText}` : '';
  const durationMap = language === 'en' ? DURATION_MAP_EN : DURATION_MAP;
  const durationNote = input.duration
    ? `\n${language === 'en' ? 'Time available' : '가능 시간'}: ${durationMap[input.duration] ?? input.duration}`
    : '';
  const n = RECOMMENDATION_CONFIG.finalRecommendationCount;
  if (language === 'en') {
    return `You recommend dates by SELECTING from real candidate places. Pick ${n} distinct candidates and write a warm card for each.
${block}${prefsHint(prefs, 'en')}${note}${durationNote}

${NO_FACT_RULE_EN}
Reply with JSON only:
{ "recommendations": [ { "candidate_id": "candidate_001", "title": "<=15 chars", "summary": "<=40 chars", "why_recommended": "<=50 chars", "tags": ["t1","t2","t3"] } ] }`;
  }
  return `당신은 실제 후보 장소 중에서 선택해 데이트를 추천합니다. 서로 다른 후보 ${n}개를 골라 각각 따뜻한 카드를 작성하세요.
${block}${prefsHint(prefs, 'ko')}${note}${durationNote}

${NO_FACT_RULE_KO}
반드시 아래 JSON으로만 답하세요:
{ "recommendations": [ { "candidate_id": "candidate_001", "title": "15자 이내", "summary": "40자 이내", "why_recommended": "50자 이내, 따뜻한 말투", "tags": ["태그1","태그2","태그3"] } ] }`;
}

// duration이 짧을수록 코스 단계 수를 줄이라는 구조적 지침 — 사실 단정이 아니라 페이싱 지침이라 hallucination 위험이 없다.
// 키 집합은 DURATION_MAP(lib/prompt.ts)과 반드시 같아야 한다 — __tests__/recommendation.test.ts가 이를 강제한다.
export const COURSE_STEP_COUNT_BY_DURATION: Record<string, number> = {
  '1h': 2,
  '2-3h': 3,
  half_day: 4,
  full_day: 4,
};

export function buildCourseSelectPrompt(
  candidates: Candidate[], intent: PlanIntent, input: FeelingInput,
  prefs: UserPreferences | undefined, language: AppLanguage,
): string {
  const block = buildCandidatesBlock(candidates, language);
  const note = input.freeText ? `\n${language === 'en' ? 'Idea' : '아이디어'}: ${input.freeText}` : '';
  const stepCount = input.duration ? COURSE_STEP_COUNT_BY_DURATION[input.duration] : undefined;
  const stepCountRule = stepCount
    ? (language === 'en' ? `\nAvailable time is limited — build the course with exactly ${stepCount} steps.` : `\n가능 시간이 제한적이니 코스를 정확히 ${stepCount}단계로 구성하세요.`)
    : '';
  if (language === 'en') {
    return `Build ONE (max 2) ordered date course from the real candidates below.
${block}${prefsHint(prefs, 'en')}${note}${stepCountRule}

Each place step MUST reference a candidate_id from the list. Pure-action steps (walk, movie) omit candidate_id.
${NO_FACT_RULE_EN}
Reply with JSON only:
{ "recommendations": [ { "title": "<=15 chars", "summary": "<=40 chars", "why_recommended": "<=50 chars", "tags": ["t1","t2"], "steps": [ { "candidate_id": "candidate_003", "label": "brunch", "desc": "<=20 chars" }, { "label": "river walk", "desc": "<=20 chars" } ] } ] }`;
  }
  return `아래 실제 후보들로 순서 있는 데이트 코스 1개(최대 2개)를 구성하세요.
${block}${prefsHint(prefs, 'ko')}${note}${stepCountRule}

장소 단계는 반드시 목록의 candidate_id를 참조하세요. 순수 행동 단계(산책·영화 등)는 candidate_id 없이 label/desc만 작성하세요.
${NO_FACT_RULE_KO}
반드시 아래 JSON으로만 답하세요:
{ "recommendations": [ { "title": "15자 이내", "summary": "40자 이내", "why_recommended": "50자 이내", "tags": ["태그1","태그2"], "steps": [ { "candidate_id": "candidate_003", "label": "브런치", "desc": "20자 이내" }, { "label": "한강 산책", "desc": "20자 이내" } ] } ] }`;
}

export function assembleFeelingCards(
  recs: FeelingRec[], candidates: Candidate[], input: FeelingInput,
  previousPlaceIds: string[], language: AppLanguage,
): DateCard[] {
  const byId = new Map(candidates.map(c => [c.candidateId, c]));
  const prev = new Set(previousPlaceIds);
  const seen = new Set<string>();
  const det = deterministicFields(input, language);
  const out: DateCard[] = [];
  for (const r of recs) {
    const id = r.candidate_id;
    if (!id || seen.has(id)) continue;
    const c = byId.get(id);
    if (!c || prev.has(c.placeId)) continue;
    seen.add(id);
    out.push({
      title: r.title ?? c.name,
      summary: r.summary ?? '',
      why_recommended: r.why_recommended ?? '',
      tags: Array.isArray(r.tags) ? r.tags : [],
      estimated_time: det.estimated_time,
      estimated_budget: det.estimated_budget,
      place_name: c.name,
      place_address: c.address,
      map_url: c.mapUrl,
    });
  }
  return out;
}

export function assembleCourseCards(
  recs: CourseRec[], candidates: Candidate[], input: FeelingInput,
  previousPlaceIds: string[], language: AppLanguage,
): DateCard[] {
  const byId = new Map(candidates.map(c => [c.candidateId, c]));
  const prev = new Set(previousPlaceIds);
  const det = deterministicFields(input, language);
  const out: DateCard[] = [];
  for (const r of recs.slice(0, 2)) {
    const steps: CourseStep[] = [];
    let placeCount = 0;
    for (const st of r.steps ?? []) {
      if (st.candidate_id) {
        const c = byId.get(st.candidate_id);
        if (!c || prev.has(c.placeId)) continue; // ghost/제외 place step 제거
        placeCount++;
        steps.push({ label: st.label ?? c.name, desc: st.desc, place_name: c.name, place_address: c.address, map_url: c.mapUrl });
      } else {
        steps.push({ label: st.label ?? '', desc: st.desc }); // 행동 단계 유지
      }
    }
    if (placeCount === 0) continue; // 유효 장소 단계 0 → 코스 폐기 (§12)
    out.push({
      title: r.title ?? '', summary: r.summary ?? '', why_recommended: r.why_recommended ?? '',
      tags: Array.isArray(r.tags) ? r.tags : [], estimated_time: det.estimated_time,
      estimated_budget: det.estimated_budget, steps,
    });
  }
  return out;
}

// 재호출 없는 결정론 폴백 (§12). 데이터로 확인 가능한 사실만 문구화, 분위기/가격 단정 금지.
export function buildDeterministicFallback(
  candidates: Candidate[], intent: PlanIntent, input: FeelingInput,
  previousPlaceIds: string[], usedCandidateIdSet: Set<string>, needed: number, language: AppLanguage,
): DateCard[] {
  if (needed <= 0) return [];
  const prev = new Set(previousPlaceIds);
  const det = deterministicFields(input, language);
  const en = language === 'en';
  const out: DateCard[] = [];
  for (const c of candidates) {
    if (out.length >= needed) break;
    if (usedCandidateIdSet.has(c.candidateId) || prev.has(c.placeId)) continue;
    out.push({
      title: c.name,
      summary: en ? 'A place matching your search conditions and location.' : '검색 조건과 위치를 고려한 추천 장소예요.',
      why_recommended: en ? 'Selected by category, distance, and matched query.' : '검색 조건, 장소 유형, 거리 기준으로 선정되었어요.',
      tags: c.matchedQueries.slice(0, 3),
      estimated_time: det.estimated_time, estimated_budget: det.estimated_budget,
      place_name: c.name, place_address: c.address, map_url: c.mapUrl,
    });
  }
  return out;
}

export function usedCandidateIds(recs: FeelingRec[]): string[] {
  return recs.map(r => r.candidate_id).filter((id): id is string => !!id);
}

// 조립된 카드가 소비한 placeId 회수 (Session previousPlaceIds용, Phase 6).
export function collectPlaceIds(cards: DateCard[], candidates: Candidate[]): string[] {
  const byName = new Map(candidates.map(c => [c.name, c.placeId]));
  const ids = new Set<string>();
  for (const card of cards) {
    if (card.place_name && byName.has(card.place_name)) ids.add(byName.get(card.place_name)!);
    for (const st of card.steps ?? []) {
      if (st.place_name && byName.has(st.place_name)) ids.add(byName.get(st.place_name)!);
    }
  }
  return [...ids];
}
