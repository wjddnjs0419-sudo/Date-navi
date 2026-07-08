import { supabase } from './supabase';
import type { AppLanguage } from './i18n';
import { buildPrompt, buildAdjustSoftMessagePrompt, buildSoftMessagePrompt, PROMPT_VERSION, type SoftMessageInput } from './prompt';
export type { SoftMessageInput };
import type { CourseStep } from './course';
export type { CourseStep };
import { distanceToRadius, formatPlacesBlock, detectPlaceFocus, buildRetrievalPlan, type KakaoPlace, type PlaceFocus, type RetrievalPlan } from './place';
import { resolveIntent, type PlanIntent } from './intent';
import { buildCandidates, type Candidate } from './candidate';
import { RECOMMENDATION_CONFIG } from './recommendationConfig';
import {
  resolveIntentMode,
  deterministicFields,
  buildFeelingSelectPrompt,
  buildCourseSelectPrompt,
  assembleFeelingCards,
  assembleCourseCards,
  buildDeterministicFallback,
  usedCandidateIds,
  collectPlaceIds,
  type FeelingRec,
  type CourseRec,
  type IntentMode,
} from './recommendation';
import type { RecommendationSession } from './recommendationSession';
import { logEvent } from './analytics';

// 카카오 로컬 검색은 place-search Edge Function이 대행한다 (REST 키는 함수 시크릿).
// location(텍스트) 또는 coords(GPS 좌표) 중 하나를 받는다. 실패하면 빈 배열 → 장소 없는 프롬프트로 폴백.
// retrieval(Adaptive)이 있으면 다중 키워드/카테고리 검색을 Edge가 오케스트레이션한다 (Phase 2).
// 없으면 focus 기반 현행 단일 검색(자유생성 경로 하위호환).
async function searchPlaces(
  query: { location?: string; coords?: GeoCoords },
  radius: number,
  focus: PlaceFocus | null,
  retrieval?: RetrievalPlan,
): Promise<KakaoPlace[]> {
  try {
    const body = retrieval
      ? { location: query.location, coords: query.coords, radius, queries: retrieval.keywordQueries, categoryCodes: retrieval.categoryCodes }
      : { location: query.location, coords: query.coords, radius, focus: focus ?? undefined };
    const { data, error } = await supabase.functions.invoke('place-search', { body });
    if (error) throw error;
    const places = (data as { places?: KakaoPlace[] })?.places;
    return Array.isArray(places) ? places : [];
  } catch {
    return [];
  }
}

// AI 호출은 Supabase Edge Function(generate-ai)이 대행한다.
// Anthropic 키는 함수 시크릿으로만 존재하며 클라이언트 번들에 노출되지 않는다.
type AIAction = 'cards' | 'soft_message' | 'feeling_select' | 'course_select';

// generate-ai 응답에 첨부되는 계측 usage (§18). 마지막 호출 값을 보관해 호출부가 로깅에 쓸 수 있게 한다.
export type AIUsage = { input_tokens?: number; output_tokens?: number };

async function invokeAI(action: AIAction, prompt: string): Promise<{ data: unknown; usage?: AIUsage }> {
  const { data, error } = await supabase.functions.invoke('generate-ai', {
    body: { action, prompt, prompt_version: PROMPT_VERSION },
  });
  if (error) throw error;
  const usage = (data as { _usage?: AIUsage })?._usage;
  return { data, usage };
}

export type UserPreferences = {
  preferred_tags: string[];
  avoid_tags: string[];
  mood_tags: string[];
  is_long_distance: boolean;
  planning_style: string;
};

// 로그인한 사용자의 온보딩 취향을 불러온다. 추천 호출부 공통 사용.
export async function getUserPreferences(): Promise<UserPreferences | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;
  const { data } = await supabase
    .from('user_preferences')
    .select('preferred_tags, avoid_tags, mood_tags, is_long_distance, planning_style')
    .eq('user_id', user.id)
    .maybeSingle();
  return data ? (data as UserPreferences) : undefined;
}

// 카카오 규약 좌표. x=경도(longitude), y=위도(latitude).
export type GeoCoords = { x: string; y: string };

export type FeelingInput = {
  energy: string;
  distance: string;
  mood: string;
  duration?: string;
  avoid: string[];
  freeText?: string;
  // 사용자가 입력한 동네/지역 텍스트 (예: "성수동"). 있으면 카카오 로컬로 실제 장소를 붙인다.
  location?: string;
  // GPS 현재 위치 (LocationField의 내 위치 토글 사용 시에만 채워진다)
  coords?: GeoCoords;
};

export type DateCard = {
  title: string;
  summary: string;
  estimated_time: string;
  estimated_budget: string;
  tags: string[];
  why_recommended: string;
  steps?: CourseStep[];
  // 카카오 로컬 실제 장소 (location 입력 시에만 채워진다)
  place_name?: string;
  place_address?: string;
  map_url?: string;
};

const FALLBACK_CARDS_BY_LANGUAGE: Record<AppLanguage, DateCard[]> = {
  ko: [
    {
      title: '동네 맛집 포장 + 집 영화',
      summary: '멀리 가지 않고 맛있는 걸 먹으며 편하게 쉬는 데이트',
      estimated_time: '2~3시간',
      estimated_budget: '1인 1~2만 원',
      tags: ['피곤한 날 가능', '이동 적음', '돈 적게 듦'],
      why_recommended: '오늘은 가까운 곳에서 편하게 보내는 게 잘 맞아 보여요.',
    },
    {
      title: '가까운 카페 + 짧은 산책',
      summary: '좋아하는 카페에서 이야기하고 산책하며 힐링하는 데이트',
      estimated_time: '2시간',
      estimated_budget: '1인 1~2만 원',
      tags: ['가벼운 이동', '대화하기 좋음', '실패 확률 낮음'],
      why_recommended: '특별한 준비 없이도 둘이서 편안하게 보낼 수 있어요.',
    },
    {
      title: '편의점 + 야경 산책',
      summary: '편의점 음식으로 가볍게 먹고 야경 보며 걷는 데이트',
      estimated_time: '1~2시간',
      estimated_budget: '1인 5천~1만 원',
      tags: ['저예산', '가까운 곳', '로맨틱'],
      why_recommended: '예산 부담 없이 둘만의 시간을 보낼 수 있어요.',
    },
  ],
  en: [
    {
      title: 'Local takeout + movie night',
      summary: 'Stay close, eat something tasty, and relax together',
      estimated_time: '2-3 hours',
      estimated_budget: '$10-25 per person',
      tags: ['Good when tired', 'Low travel', 'Cheap'],
      why_recommended: 'Staying close and keeping it easy fits today well.',
    },
    {
      title: 'Nearby cafe + short walk',
      summary: 'Chat over coffee and take a refreshing short walk',
      estimated_time: '2 hours',
      estimated_budget: '$10-25 per person',
      tags: ['Easy travel', 'Good for talking', 'Low risk'],
      why_recommended: 'You can enjoy time together without much preparation.',
    },
    {
      title: 'Convenience store + night view walk',
      summary: 'Keep it simple with snacks and a night view stroll',
      estimated_time: '1-2 hours',
      estimated_budget: '$5-10 per person',
      tags: ['Low budget', 'Nearby', 'Romantic'],
      why_recommended: 'You can enjoy time together without worrying about budget.',
    },
  ],
};


const SOFT_MESSAGE_FALLBACKS: Record<AppLanguage, string> = {
  ko: '오늘은 조금 쉬고 싶어. 가까운 데서 편하게 보내는 건 어때? 그래도 같이 있고 싶어 😊',
  en: 'I would like to rest a bit today. How about something comfortable nearby? I still want to be with you 😊',
};

// ─── 초대 한마디 (긍정·설레는 톤) ───────────────────────────────────────────────
// send 화면 전용. generateSoftMessage(거절 완곡용)와 톤이 정반대이므로 별도 함수로 둔다.
export type InviteCard = { title: string; summary?: string; tags?: string[] };

function buildInviteMessagePrompt(card: InviteCard, language: AppLanguage): string {
  const tagText = (card.tags ?? []).join(', ');
  if (language === 'en') {
    return `You help someone invite their partner on a date in a warm, excited tone.
Write a short message inviting them to this date idea. Sound genuinely looking forward to it — NEVER apologetic.

【Date】
- Title: ${card.title}
${card.summary ? `- About: ${card.summary}\n` : ''}${tagText ? `- Vibe: ${tagText}\n` : ''}
Reply with JSON only. Do not include any other text.

{
  "message": "A warm invite to my partner (2-3 sentences, excited and natural, no apology)"
}

Rules:
- Use positive, looking-forward phrasing like "let's go together", "how about it?", "this looks fun"
- Never include apology or burden ("sorry", "it's okay if not")
- Keep it within 2-3 sentences`;
  }

  return `당신은 연인에게 데이트를 설레는 말투로 제안하도록 돕는 전문가입니다.
아래 데이트 후보를 같이 가자고 권하는 짧은 한마디를 만들어주세요. 기대되고 설레는 느낌으로, 절대 사과/거절 투는 쓰지 마세요.

【데이트 후보】
- 제목: ${card.title}
${card.summary ? `- 내용: ${card.summary}\n` : ''}${tagText ? `- 분위기: ${tagText}\n` : ''}
반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트는 출력하지 마세요.

{
  "message": "상대에게 보낼 설레는 초대 한마디 (2~3문장, 자연스러운 연인 말투, 사과 표현 금지)"
}

규칙:
- "같이 가자", "어때?", "재밌을 것 같아" 같은 긍정적이고 기대되는 표현을 쓰세요
- "미안해", "부담되면 괜찮아" 같은 사과·거절 표현은 절대 넣지 마세요
- 2~3문장으로 간결하게 작성하세요`;
}

const INVITE_FALLBACKS: Record<AppLanguage, string> = {
  ko: '이거 우리 같이 가보면 진짜 좋을 것 같아! 시간 어때? 😊',
  en: 'I think we’d have a great time with this one! Want to go together? 😊',
};

export async function generateInviteMessage(card: InviteCard, language: AppLanguage = 'ko'): Promise<string> {
  try {
    const prompt = buildInviteMessagePrompt(card, language);
    const { data } = await invokeAI('soft_message', prompt);
    const msg = (data as { message?: string })?.message;
    if (!msg) throw new Error('No message in response');
    return msg;
  } catch {
    return INVITE_FALLBACKS[language];
  }
}

export async function generateSoftMessage(input: SoftMessageInput, language: AppLanguage = 'ko'): Promise<string> {
  try {
    const prompt = buildSoftMessagePrompt(input, language);
    const { data } = await invokeAI('soft_message', prompt);
    const msg = (data as { message?: string })?.message;
    if (!msg) throw new Error('No message in response');
    return msg;
  } catch {
    return SOFT_MESSAGE_FALLBACKS[language];
  }
}

export async function adjustSoftMessage(
  currentText: string,
  instruction: 'warmer' | 'shorter',
  language: AppLanguage = 'ko',
): Promise<string> {
  try {
    const prompt = buildAdjustSoftMessagePrompt(currentText, instruction, language);
    const { data } = await invokeAI('soft_message', prompt);
    const msg = (data as { message?: string })?.message;
    if (!msg) throw new Error('No message in response');
    return msg;
  } catch {
    return currentText;
  }
}

// Session 재사용/재추천용 부가 정보 (Phase 6). Phase 4·5에서는 onSession 미소비여도 무해.
export type GenerateOptions = {
  previousPlaceIds?: string[];
  onSession?: (s: { intent: PlanIntent; candidates: Candidate[]; usedPlaceIds: string[] }) => void;
};

type CandidateFlowResult = { cards: DateCard[]; usage?: AIUsage; claudeLatencyMs: number; fallbackCount: number };

// 위치가 있고 후보가 확보되면: Claude가 candidate_id만 선택 → 앱이 Validation·결정론 필드·장소를 결합한다 (V2 §10~§12).
async function runCandidateFlow(
  intentMode: IntentMode,
  candidates: Candidate[],
  intent: PlanIntent,
  input: FeelingInput,
  prefs: UserPreferences | undefined,
  language: AppLanguage,
  previousPlaceIds: string[],
): Promise<CandidateFlowResult> {
  const action = intentMode === 'make_course' ? 'course_select' : 'feeling_select';
  const prompt = intentMode === 'make_course'
    ? buildCourseSelectPrompt(candidates, intent, input, prefs, language)
    : buildFeelingSelectPrompt(candidates, intent, input, prefs, language);
  const startedAt = Date.now();
  const { data, usage } = await invokeAI(action, prompt);
  const claudeLatencyMs = Date.now() - startedAt;
  const recs = Array.isArray((data as { recommendations?: unknown[] })?.recommendations)
    ? (data as { recommendations: unknown[] }).recommendations
    : [];

  if (intentMode === 'make_course') {
    const cards = assembleCourseCards(recs as CourseRec[], candidates, input, previousPlaceIds, language);
    return { cards, usage, claudeLatencyMs, fallbackCount: 0 };
  }

  const n = RECOMMENDATION_CONFIG.finalRecommendationCount;
  const feelingRecs = recs as FeelingRec[];
  const valid = assembleFeelingCards(feelingRecs, candidates, input, previousPlaceIds, language);
  if (valid.length >= n) return { cards: valid.slice(0, n), usage, claudeLatencyMs, fallbackCount: 0 };
  // 부족분은 재호출 없는 결정론 폴백으로 채운다 (§12).
  const usedIds = new Set(usedCandidateIds(feelingRecs));
  const fill = buildDeterministicFallback(candidates, intent, input, previousPlaceIds, usedIds, n - valid.length, language);
  return { cards: [...valid, ...fill], usage, claudeLatencyMs, fallbackCount: fill.length };
}

// 위치가 없거나 후보 0개면 현행 자유생성 유지(무회귀). estimated 필드만 앱이 결정론적으로 덮어쓴다 (§11).
async function runFreeGenFlow(
  input: FeelingInput,
  mode: string,
  prefs: UserPreferences | undefined,
  language: AppLanguage,
): Promise<DateCard[]> {
  let placesBlock = '';
  if (input.location || input.coords) {
    const focus = detectPlaceFocus(input.freeText);
    const places = await searchPlaces(
      { location: input.location, coords: input.coords },
      distanceToRadius(input.distance),
      focus,
    );
    placesBlock = formatPlacesBlock(places, language, focus?.label);
  }
  const prompt = buildPrompt(input, mode, prefs, language, placesBlock);
  const { data } = await invokeAI('cards', prompt);
  const cards = (data as { cards?: DateCard[] })?.cards;
  if (!Array.isArray(cards) || cards.length === 0) throw new Error('No cards in response');
  const det = deterministicFields(input, language);
  return cards.slice(0, 3).map(c => ({ ...c, estimated_time: det.estimated_time, estimated_budget: det.estimated_budget }));
}

// Phase 6 — 재추천: 저장된 Session의 Candidate Pool을 재사용하고 previousPlaceIds를 제외해
// Kakao 재검색 없이 다시 고른다. 결과가 비면([] 반환) 호출부가 fresh generate로 폴백한다.
export async function regenerateDateCards(
  session: RecommendationSession,
  language: AppLanguage = 'ko',
): Promise<DateCard[]> {
  try {
    const intentMode = resolveIntentMode(session.mode);
    const res = await runCandidateFlow(
      intentMode, session.candidates, session.intent, session.input, session.prefs, language, session.previousPlaceIds,
    );
    if (res.cards.length > 0) {
      void logEvent('recommendation_regenerated', {
        mode: session.mode,
        intent_purpose: session.intent.purpose,
        ranked_candidate_count: session.candidates.length,
        final_recommendation_count: res.cards.length,
        fallback_recommendation_count: res.fallbackCount,
        claude_latency_ms: res.claudeLatencyMs,
        claude_input_tokens: res.usage?.input_tokens,
        claude_output_tokens: res.usage?.output_tokens,
      });
    }
    return res.cards;
  } catch {
    return [];
  }
}

export async function generateDateCards(
  input: FeelingInput,
  mode: string,
  prefs?: UserPreferences,
  language: AppLanguage = 'ko',
  opts?: GenerateOptions,
): Promise<DateCard[]> {
  const previousPlaceIds = opts?.previousPlaceIds ?? [];
  try {
    if (input.location || input.coords) {
      const intentMode = resolveIntentMode(mode);
      const intent = resolveIntent({
        mode: intentMode,
        freeText: input.freeText,
        mood: input.mood,
        duration: input.duration,
      });
      // Adaptive Retrieval — intent의 다중 쿼리/카테고리로 후보 recall을 넓힌다 (Phase 2).
      const retrieval = buildRetrievalPlan(intent);
      const retrievalStart = Date.now();
      const places = await searchPlaces(
        { location: input.location, coords: input.coords },
        distanceToRadius(input.distance),
        null,
        retrieval,
      );
      const retrievalLatencyMs = Date.now() - retrievalStart;
      const candidates = buildCandidates(places, intent);
      if (candidates.length > 0) {
        const res = await runCandidateFlow(intentMode, candidates, intent, input, prefs, language, previousPlaceIds);
        if (res.cards.length > 0) {
          opts?.onSession?.({ intent, candidates, usedPlaceIds: collectPlaceIds(res.cards, candidates) });
          void logEvent('recommendation_generated', {
            mode,
            intent_purpose: intent.purpose,
            raw_candidate_count: places.length,
            ranked_candidate_count: candidates.length,
            haiku_candidate_count: Math.min(candidates.length, RECOMMENDATION_CONFIG.haikuCandidateLimit),
            final_recommendation_count: res.cards.length,
            fallback_recommendation_count: res.fallbackCount,
            retrieval_latency_ms: retrievalLatencyMs,
            claude_latency_ms: res.claudeLatencyMs,
            claude_input_tokens: res.usage?.input_tokens,
            claude_output_tokens: res.usage?.output_tokens,
          });
          return res.cards;
        }
      }
    }
    return await runFreeGenFlow(input, mode, prefs, language);
  } catch {
    void logEvent('recommendation_fallback', { mode, reason: 'error' });
    return FALLBACK_CARDS_BY_LANGUAGE[language];
  }
}
