import type { AppLanguage } from './i18n';
import type { FeelingInput, UserPreferences } from './ai';

// 프롬프트 템플릿을 의미 있게 바꿀 때마다 올린다. ai_recommendation_logs에 태깅되어 버전별 품질 비교에 쓰인다.
export const PROMPT_VERSION = 'v1';

export const ENERGY_MAP: Record<string, string> = {
  low: '피곤함',
  medium: '보통',
  high: '에너지 넘침',
};
export const BUDGET_MAP: Record<string, string> = {
  low: '저예산 (1~3만 원)',
  medium: '적당한 예산 (3~7만 원)',
  high: '넉넉한 예산 (7만 원 이상)',
};
// 카드에 실제로 표시되는 짧은 라벨. BUDGET_MAP은 AI 프롬프트 컨텍스트용으로 금액 detail을 유지한다.
export const BUDGET_LABEL: Record<string, string> = {
  low: '저예산',
  medium: '적당한 예산',
  high: '넉넉한 예산',
};
export const DISTANCE_MAP: Record<string, string> = {
  near: '가까운 곳 (도보/차 10분)',
  any: '거리 상관없음',
  far: '멀리도 가능 (1시간 이내)',
};
export const MOOD_MAP: Record<string, string> = {
  comfortable: '편안하게',
  fun: '재밌고 활기차게',
  romantic: '로맨틱하게',
  quiet: '조용하고 차분하게',
  new: '새롭고 색다르게',
};
export const DURATION_MAP: Record<string, string> = {
  '1h': '약 1시간',
  '2-3h': '2~3시간',
  half_day: '반나절 (4~5시간)',
  full_day: '하루종일',
};
export const AVOID_MAP: Record<string, string> = {
  long_walk: '오래 걷기',
  crowded: '사람 많은 곳',
  outdoor: '야외 활동',
  expensive: '비싼 곳',
  reservation: '복잡한 예약',
};

export const ENERGY_MAP_EN: Record<string, string> = {
  low: 'Low energy / tired',
  medium: 'Okay',
  high: 'High energy',
};
export const BUDGET_MAP_EN: Record<string, string> = {
  low: 'Low budget (about $10-25 per person)',
  medium: 'Moderate budget (about $25-60 per person)',
  high: 'Higher budget (about $60+ per person)',
};
export const BUDGET_LABEL_EN: Record<string, string> = {
  low: 'Low budget',
  medium: 'Moderate budget',
  high: 'Higher budget',
};
export const DISTANCE_MAP_EN: Record<string, string> = {
  near: 'Nearby (walk or 10 minutes by car)',
  any: 'Any distance is fine',
  far: 'Longer travel is okay (within about an hour)',
};
export const MOOD_MAP_EN: Record<string, string> = {
  comfortable: 'Comfortable',
  fun: 'Fun and lively',
  romantic: 'Romantic',
  quiet: 'Quiet and calm',
  new: 'Fresh and new',
};
export const DURATION_MAP_EN: Record<string, string> = {
  '1h': 'About 1 hour',
  '2-3h': '2-3 hours',
  half_day: 'Half day (4-5 hours)',
  full_day: 'All day',
};
export const AVOID_MAP_EN: Record<string, string> = {
  long_walk: 'Long walks',
  crowded: 'Crowded places',
  outdoor: 'Outdoor activities',
  expensive: 'Expensive places',
  reservation: 'Complicated reservations',
};

export const MODE_CONTEXT: Record<string, string> = {
  feeling: '끌리는 분위기만 알고 있는 커플',
  next_meet: '다음 만남을 위해 미리 계획을 세우고 싶은 커플',
  make_course: '아이디어는 있지만 코스로 구체화가 필요한 커플',
};
export const MODE_CONTEXT_EN: Record<string, string> = {
  feeling: 'A couple that only knows the vibe they want',
  next_meet: 'A couple saving ideas for their next meeting',
  make_course: 'A couple with ideas that need to be turned into a plan',
};
export const MODE_EMPHASIS: Record<string, string> = {
  feeling: '\n\n【모드 특별 지침】\n사용자가 남긴 러프한 분위기와 감정을 감성적이고 구체적인 데이트 카드로 변환하세요. 자유 메모의 뉘앙스를 적극 반영하고, 분위기가 살아나는 장면을 그리듯 추천하세요.',
  make_course: '\n\n【모드 특별 지침】\n아이디어를 구체적인 코스로 정리해주세요. 각 카드에 "steps" 배열을 추가하고, 시간 순서대로 3~4개 단계를 [{ "label": "장소/행동 (12자 이내)", "desc": "한 줄 보충 (20자 이내)" }] 형식으로 넣으세요. summary는 한 줄 요약을 유지하고, tags에 준비물, why_recommended에 대체안을 포함하세요.',
};
export const MODE_EMPHASIS_EN: Record<string, string> = {
  feeling: '\n\n【Mode guidance】\nTurn the rough vibe and emotions the user left into a concrete, emotionally resonant date card. Actively reflect the nuance of the free-text note and paint a vivid scene.',
  make_course: '\n\n【Mode guidance】\nTurn the idea into a concrete course. Add a "steps" array to each card with 3-4 ordered steps in the form [{ "label": "place/action (<=12 chars)", "desc": "one-line note (<=20 chars)" }]. Keep summary as a one-line summary, put things to prepare in tags, and a backup plan in why_recommended.',
};

export const PLANNING_STYLE_MAP: Record<string, string> = {
  planner: '자주 계획하는 편',
  together: '같이 정하는 편',
  idea_only: '고르는 건 괜찮지만 계획은 어려운 편',
  passive: '의견 표현이 어려운 편',
  flexible: '그때그때 다름',
};

export const PLANNING_STYLE_MAP_EN: Record<string, string> = {
  planner: 'Usually the planner',
  together: 'We decide together',
  idea_only: 'I can choose, but planning is hard',
  passive: 'I struggle to express my opinion',
  flexible: 'It depends on the day',
};

// 온보딩 mood 선택(요즘 데이트에서 원하는 것) 라벨
export const MOOD_PREF_MAP: Record<string, string> = {
  rest: '편하게 쉬기',
  laugh: '많이 웃기',
  quiet: '조용히 대화',
  new: '새로운 경험',
  photo: '사진 남기기',
  special: '특별한 하루',
};

export const MOOD_PREF_MAP_EN: Record<string, string> = {
  rest: 'Relaxing',
  laugh: 'Lots of laughs',
  quiet: 'Quiet conversation',
  new: 'New experiences',
  photo: 'Taking photos',
  special: 'A special day',
};

export function buildPreferencesBlock(prefs: UserPreferences, language: AppLanguage): string {
  const lines: string[] = [];
  const isEnglish = language === 'en';
  if (prefs.preferred_tags.length > 0) {
    lines.push(isEnglish ? `- Preferred vibes: ${prefs.preferred_tags.join(', ')}` : `- 선호 분위기: ${prefs.preferred_tags.join(', ')}`);
  }
  if (prefs.avoid_tags.length > 0) {
    lines.push(isEnglish ? `- Things to avoid: ${prefs.avoid_tags.join(', ')}` : `- 평소 피하고 싶은 것: ${prefs.avoid_tags.join(', ')}`);
  }
  if (prefs.mood_tags?.length > 0) {
    const moods = prefs.mood_tags.map(m => (isEnglish ? MOOD_PREF_MAP_EN[m] ?? m : MOOD_PREF_MAP[m] ?? m)).join(', ');
    lines.push(isEnglish ? `- Wants from dates lately: ${moods}` : `- 요즘 데이트에서 원하는 것: ${moods}`);
  }
  lines.push(isEnglish ? `- Long-distance couple: ${prefs.is_long_distance ? 'Yes' : 'No'}` : `- 장거리 커플: ${prefs.is_long_distance ? '네' : '아니요'}`);
  if (prefs.planning_style) {
    const planningStyle = isEnglish
      ? PLANNING_STYLE_MAP_EN[prefs.planning_style] ?? prefs.planning_style
      : PLANNING_STYLE_MAP[prefs.planning_style] ?? prefs.planning_style;
    lines.push(isEnglish ? `- Planning style: ${planningStyle}` : `- 계획 성향: ${planningStyle}`);
  }
  if (lines.length === 0) return '';
  return isEnglish
    ? `\n\n【Couple preferences (from onboarding)】\n${lines.join('\n')}`
    : `\n\n【커플 취향 (온보딩 기반)】\n${lines.join('\n')}`;
}

export function buildPrompt(
  input: FeelingInput,
  mode: string,
  prefs?: UserPreferences,
  language: AppLanguage = 'ko',
  placesBlock = '',
): string {
  const isEnglish = language === 'en';
  const hasPlaces = placesBlock.length > 0;
  // 실제 장소가 주입될 때만 카드 JSON 골격에 place 필드를 노출한다.
  const placesSchema = hasPlaces
    ? (isEnglish
      ? `,\n      "place_name": "Real place name from the list",\n      "place_address": "Its address",\n      "map_url": "Its map link"`
      : `,\n      "place_name": "목록의 실제 장소명",\n      "place_address": "그 장소 주소",\n      "map_url": "그 장소 지도 링크"`)
    : '';
  const avoidText = input.avoid.length > 0
    ? (isEnglish
      ? `Things to avoid: ${input.avoid.map(a => AVOID_MAP_EN[a] ?? a).join(', ')}`
      : `피하고 싶은 것: ${input.avoid.map(a => AVOID_MAP[a] ?? a).join(', ')}`)
    : '';
  const freeTextPart = input.freeText ? `\n${isEnglish ? 'Additional note' : '추가 메모'}: ${input.freeText}` : '';
  const modeContext = (isEnglish ? MODE_CONTEXT_EN[mode] : MODE_CONTEXT[mode]) ?? (isEnglish ? 'A couple that needs help planning a date' : '데이트 계획이 필요한 커플');
  const emphasisBlock = (isEnglish ? MODE_EMPHASIS_EN[mode] : MODE_EMPHASIS[mode]) ?? '';
  const prefsBlock = prefs ? buildPreferencesBlock(prefs, language) : '';
  // make_course만 JSON 골격에 steps 배열을 명시해야 모델이 단계를 채운다.
  const stepsSchema = mode === 'make_course'
    ? (isEnglish
      ? `,\n      "steps": [{ "label": "place/action (<=12 chars)", "desc": "one-line note (<=20 chars)" }]`
      : `,\n      "steps": [{ "label": "장소/행동 (12자 이내)", "desc": "한 줄 보충 (20자 이내)" }]`)
    : '';

  if (isEnglish) {
    return `You are an expert at planning dates for couples. Based on the situation below, recommend 3 date ideas.

【Situation】 ${modeContext}
- Energy: ${ENERGY_MAP_EN[input.energy] ?? input.energy}
- Budget: ${BUDGET_MAP_EN[input.budget] ?? input.budget}
- Distance: ${DISTANCE_MAP_EN[input.distance] ?? input.distance}
- Vibe: ${MOOD_MAP_EN[input.mood] ?? input.mood}
- Time available: ${DURATION_MAP_EN[input.duration] ?? input.duration}
${avoidText}${freeTextPart}${emphasisBlock}${prefsBlock}${placesBlock}

Reply with JSON only. Do not include any other text.

{
  "cards": [
    {
      "title": "Date title (within 15 characters)",
      "summary": "One-line summary (within 40 characters)",
      "estimated_time": "Estimated time",
      "estimated_budget": "Estimated cost per person",
      "tags": ["Tag 1", "Tag 2", "Tag 3"],
      "why_recommended": "Why this fits well (within 50 characters, warm tone)"${stepsSchema}${placesSchema}
    }
  ]
}

Tag examples: low travel, good when tired, cheap, low risk, indoor, outdoor, romantic, fun, quiet, good for photos`;
  }

  return `당신은 커플 데이트 계획 전문가입니다. 아래 커플의 상황을 보고 데이트 후보 3개를 추천해주세요.

【상황】 ${modeContext}
- 컨디션: ${ENERGY_MAP[input.energy] ?? input.energy}
- 예산: ${BUDGET_MAP[input.budget] ?? input.budget}
- 이동 거리: ${DISTANCE_MAP[input.distance] ?? input.distance}
- 분위기: ${MOOD_MAP[input.mood] ?? input.mood}
- 가능 시간: ${DURATION_MAP[input.duration] ?? input.duration}
${avoidText}${freeTextPart}${emphasisBlock}${prefsBlock}${placesBlock}

반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트는 출력하지 마세요.

{
  "cards": [
    {
      "title": "데이트 제목 (15자 이내)",
      "summary": "한 줄 설명 (40자 이내)",
      "estimated_time": "예상 소요 시간",
      "estimated_budget": "1인 예상 비용",
      "tags": ["태그1", "태그2", "태그3"],
      "why_recommended": "이 데이트가 잘 맞는 이유 (50자 이내, 따뜻한 말투)"${stepsSchema}${placesSchema}
    }
  ]
}

태그 예시: 이동 적음, 피곤한 날 가능, 돈 적게 듦, 실패 확률 낮음, 실내, 야외, 로맨틱, 재밌음, 조용함, 사진 찍기 좋음`;
}

export type SoftMessageInput = {
  freeText: string;
  tone?: string;
};

// soft-message 탭의 톤 선택("다정하게"/"가볍게"/"솔직하게")을 실제 프롬프트 지침으로 반영한다.
// 선택지에 없는 값이 오면(예: 아직 안 고른 초기 상태) 추가 지침 없이 기본 톤으로 생성한다.
const TONE_GUIDE_MAP: Record<string, string> = {
  '다정하게': '평소보다 더 다정하고 애교 섞인 표현을 적극적으로 사용하세요.',
  '가볍게': '무겁지 않고 캐주얼하게, 가벼운 농담이나 편안한 말투를 섞어서 부담 없이 표현하세요.',
  '솔직하게': '돌려 말하지 않고 담백하고 직설적으로 표현하되, 무례하지 않게 애정은 유지하세요.',
};

const TONE_GUIDE_MAP_EN: Record<string, string> = {
  '다정하게': 'Lean extra warm and affectionate, more than usual.',
  '가볍게': 'Keep it light and casual, maybe a little playful, so it does not feel heavy.',
  '솔직하게': 'Be direct and straightforward rather than roundabout, while staying respectful and caring.',
};

export function buildSoftMessagePrompt(input: SoftMessageInput, language: AppLanguage): string {
  const isEnglish = language === 'en';
  const toneGuide = input.tone ? (isEnglish ? TONE_GUIDE_MAP_EN[input.tone] : TONE_GUIDE_MAP[input.tone]) : undefined;
  const toneRule = toneGuide ? `\n- ${toneGuide}` : '';

  if (isEnglish) {
    return `You are an expert at gently expressing hard-to-say feelings between couples.
Below is a message the user wrote in their own words, meant for their partner. Rewrite it into a warm, gentle version while keeping the original meaning and intent.

【Original message】
${input.freeText}

Reply with JSON only. Do not include any other text.

{
  "message": "A gentle rewrite to send to my partner (2-3 sentences, warm and sincere)"
}

Rules:
- Keep the original meaning and intent unchanged
- Even if it is saying no or setting a boundary, the message should still feel loving
- Include soft language that shows you still care
- Avoid overly formal language and keep it natural, like a couple would speak
- Keep it concise, within 2-3 sentences${toneRule}`;
  }

  return `당신은 커플 사이에서 말하기 어려운 마음을 부드럽게 전달해주는 전문가입니다.
아래는 사용자가 상대방에게 하고 싶은 말을 자신의 표현으로 적은 원문입니다. 의미와 의도는 그대로 유지하면서, 상대방에게 부드럽고 따뜻하게 전달할 수 있는 문장으로 다시 표현해주세요.

【원문】
${input.freeText}

반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트는 출력하지 마세요.

{
  "message": "다시 표현한 부드러운 문장 (2~3문장, 진심이 느껴지는 따뜻한 말투)"
}

규칙:
- 원문의 의미와 의도는 바꾸지 마세요
- 거절이나 부담을 표현하면서도 상대에 대한 애정이 느껴져야 합니다
- "~해서 미안해", "그래도 같이 있고 싶어" 같은 따뜻한 표현을 넣으세요
- 너무 격식체는 피하고, 자연스러운 연인 말투로 작성하세요
- 2~3문장 이내로 간결하게 작성하세요${toneRule}`;
}

export function buildAdjustSoftMessagePrompt(
  currentText: string,
  instruction: 'warmer' | 'shorter',
  language: AppLanguage = 'ko',
): string {
  const isEnglish = language === 'en';

  if (isEnglish) {
    const instructionText = instruction === 'warmer'
      ? 'Rewrite it to sound warmer and more affectionate, while keeping the same meaning.'
      : 'Rewrite it to be shorter and more concise, while keeping the same meaning.';
    return `You are an expert at gently expressing hard-to-say feelings between couples.
Below is a message the user already wrote. ${instructionText}

【Current message】
${currentText}

Reply with JSON only. Do not include any other text.

{
  "message": "The revised message (2-3 sentences, warm and sincere)"
}`;
  }

  const instructionText = instruction === 'warmer'
    ? '원래 의미는 유지하면서 더 다정하게, 따뜻한 말투로 다듬어주세요.'
    : '원래 의미는 유지하면서 더 짧게 줄여주세요.';
  return `당신은 커플 사이에서 말하기 어려운 마음을 부드럽게 전달해주는 전문가입니다.
아래는 사용자가 이미 작성한 문장입니다. ${instructionText}

【현재 문장】
${currentText}

반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트는 출력하지 마세요.

{
  "message": "다듬어진 문장 (2~3문장, 진심이 느껴지는 따뜻한 말투)"
}`;
}
