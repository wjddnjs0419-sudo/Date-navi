import type { AppLanguage } from './i18n';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_AI_STUDIO_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export type UserPreferences = {
  preferred_tags: string[];
  avoid_tags: string[];
  is_long_distance: boolean;
  planning_style: string;
};

export type FeelingInput = {
  energy: string;
  budget: string;
  distance: string;
  mood: string;
  duration: string;
  avoid: string[];
  freeText?: string;
};

export type DateCard = {
  title: string;
  summary: string;
  estimated_time: string;
  estimated_budget: string;
  tags: string[];
  why_recommended: string;
};

const ENERGY_MAP: Record<string, string> = {
  low: '피곤함',
  medium: '보통',
  high: '에너지 넘침',
};
const BUDGET_MAP: Record<string, string> = {
  low: '저예산 (1~3만 원)',
  medium: '적당한 예산 (3~7만 원)',
  high: '넉넉한 예산 (7만 원 이상)',
};
const DISTANCE_MAP: Record<string, string> = {
  near: '가까운 곳 (도보/차 10분)',
  any: '거리 상관없음',
  far: '멀리도 가능 (1시간 이내)',
};
const MOOD_MAP: Record<string, string> = {
  comfortable: '편안하게',
  fun: '재밌고 활기차게',
  romantic: '로맨틱하게',
};
const DURATION_MAP: Record<string, string> = {
  '1h': '약 1시간',
  '2-3h': '2~3시간',
  half_day: '반나절 (4~5시간)',
  full_day: '하루종일',
};
const AVOID_MAP: Record<string, string> = {
  long_walk: '오래 걷기',
  crowded: '사람 많은 곳',
  outdoor: '야외 활동',
  expensive: '비싼 곳',
  reservation: '복잡한 예약',
};

const ENERGY_MAP_EN: Record<string, string> = {
  low: 'Low energy / tired',
  medium: 'Okay',
  high: 'High energy',
};
const BUDGET_MAP_EN: Record<string, string> = {
  low: 'Low budget (about $10-25 per person)',
  medium: 'Moderate budget (about $25-60 per person)',
  high: 'Higher budget (about $60+ per person)',
};
const DISTANCE_MAP_EN: Record<string, string> = {
  near: 'Nearby (walk or 10 minutes by car)',
  any: 'Any distance is fine',
  far: 'Longer travel is okay (within about an hour)',
};
const MOOD_MAP_EN: Record<string, string> = {
  comfortable: 'Comfortable',
  fun: 'Fun and lively',
  romantic: 'Romantic',
};
const DURATION_MAP_EN: Record<string, string> = {
  '1h': 'About 1 hour',
  '2-3h': '2-3 hours',
  half_day: 'Half day (4-5 hours)',
  full_day: 'All day',
};
const AVOID_MAP_EN: Record<string, string> = {
  long_walk: 'Long walks',
  crowded: 'Crowded places',
  outdoor: 'Outdoor activities',
  expensive: 'Expensive places',
  reservation: 'Complicated reservations',
};

const MODE_CONTEXT: Record<string, string> = {
  pick_for_me: '계획이 귀찮아서 앱이 대신 골라주길 원하는 커플',
  feeling_only: '끌리는 분위기만 알고 있는 커플',
  light_date: '피곤하고 부담 없이 가볍게 하고 싶은 커플',
  low_risk: '실패 없는 무난하고 안정적인 데이트를 원하는 커플',
  special_date: '기념일이나 특별한 날을 위한 데이트를 원하는 커플',
  next_time: '다음 만남을 위해 미리 계획을 세우고 싶은 커플',
  make_course: '아이디어는 있지만 코스로 구체화가 필요한 커플',
};

const MODE_CONTEXT_EN: Record<string, string> = {
  pick_for_me: 'A couple that wants the app to pick because planning feels tiring',
  feeling_only: 'A couple that only knows the vibe they want',
  light_date: 'A couple that wants something easy and light',
  low_risk: 'A couple that wants a safe, reliable date',
  special_date: 'A couple planning for an anniversary or a special day',
  next_time: 'A couple saving ideas for their next meeting',
  make_course: 'A couple with ideas that need to be turned into a plan',
};

const MODE_EMPHASIS: Record<string, string> = {
  light_date: '\n\n【모드 특별 지침】\n저예산, 근거리, 짧은 시간, 체력 소모가 적은 데이트를 우선 추천하세요. 이동 거리가 짧고 특별한 준비 없이도 즐길 수 있는 가볍고 편안한 후보를 강조하세요.',
  special_date: '\n\n【모드 특별 지침】\n기념일이나 특별한 날에 어울리는 감성적이고 특별한 데이트를 추천하세요. 로맨틱하고 기억에 남을 경험, 특별한 레스토랑이나 야경 같은 요소를 강조하세요.',
  low_risk: '\n\n【모드 특별 지침】\n실패 확률이 낮고 무난하며 안정적인 데이트를 추천하세요. 특별한 준비 없이도 즐길 수 있고, 둘 다 만족할 가능성이 높으며 쉽게 실행 가능한 후보를 우선으로 하세요.',
  make_course: '\n\n【모드 특별 지침】\n아이디어를 구체적인 코스로 정리해주세요. summary 필드에 "1단계: … → 2단계: … → 3단계: …" 형식의 단계별 동선을 포함하고, tags에 준비할 것을 넣고, why_recommended에 대체안을 포함하세요.',
};

const MODE_EMPHASIS_EN: Record<string, string> = {
  light_date: '\n\n【Mode guidance】\nPrioritize low-budget, nearby, short, low-effort dates. Suggest options that require no special preparation and are easy on the body.',
  special_date: '\n\n【Mode guidance】\nSuggest romantic, memorable dates for anniversaries or special occasions. Emphasize special restaurants, scenic views, or experiences worth remembering.',
  low_risk: '\n\n【Mode guidance】\nPrioritize safe, reliable, easy-to-enjoy dates. Focus on options that require no preparation, are highly likely to satisfy both people, and are simple to execute.',
  make_course: '\n\n【Mode guidance】\nTurn the idea into a concrete step-by-step course. In the summary field, include steps like "Step 1: … → Step 2: … → Step 3: …", put things to prepare in tags, and include a backup plan in why_recommended.',
};

const PLANNING_STYLE_MAP: Record<string, string> = {
  planner: '자주 계획하는 편',
  together: '같이 정하는 편',
  idea_only: '고르는 건 괜찮지만 계획은 어려운 편',
  passive: '의견 표현이 어려운 편',
  flexible: '그때그때 다름',
};

const PLANNING_STYLE_MAP_EN: Record<string, string> = {
  planner: 'Usually the planner',
  together: 'We decide together',
  idea_only: 'I can choose, but planning is hard',
  passive: 'I struggle to express my opinion',
  flexible: 'It depends on the day',
};

function buildPreferencesBlock(prefs: UserPreferences, language: AppLanguage): string {
  const lines: string[] = [];
  const isEnglish = language === 'en';
  if (prefs.preferred_tags.length > 0) {
    lines.push(isEnglish ? `- Preferred vibes: ${prefs.preferred_tags.join(', ')}` : `- 선호 분위기: ${prefs.preferred_tags.join(', ')}`);
  }
  if (prefs.avoid_tags.length > 0) {
    lines.push(isEnglish ? `- Things to avoid: ${prefs.avoid_tags.join(', ')}` : `- 평소 피하고 싶은 것: ${prefs.avoid_tags.join(', ')}`);
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

function buildPrompt(input: FeelingInput, mode: string, prefs?: UserPreferences, language: AppLanguage = 'ko'): string {
  const isEnglish = language === 'en';
  const avoidText = input.avoid.length > 0
    ? (isEnglish
      ? `Things to avoid: ${input.avoid.map(a => AVOID_MAP_EN[a] ?? a).join(', ')}`
      : `피하고 싶은 것: ${input.avoid.map(a => AVOID_MAP[a] ?? a).join(', ')}`)
    : '';
  const freeTextPart = input.freeText ? `\n${isEnglish ? 'Additional note' : '추가 메모'}: ${input.freeText}` : '';
  const modeContext = (isEnglish ? MODE_CONTEXT_EN[mode] : MODE_CONTEXT[mode]) ?? (isEnglish ? 'A couple that needs help planning a date' : '데이트 계획이 필요한 커플');
  const emphasisBlock = (isEnglish ? MODE_EMPHASIS_EN[mode] : MODE_EMPHASIS[mode]) ?? '';
  const prefsBlock = prefs ? buildPreferencesBlock(prefs, language) : '';

  if (isEnglish) {
    return `You are an expert at planning dates for couples. Based on the situation below, recommend 3 date ideas.

【Situation】 ${modeContext}
- Energy: ${ENERGY_MAP_EN[input.energy] ?? input.energy}
- Budget: ${BUDGET_MAP_EN[input.budget] ?? input.budget}
- Distance: ${DISTANCE_MAP_EN[input.distance] ?? input.distance}
- Vibe: ${MOOD_MAP_EN[input.mood] ?? input.mood}
- Time available: ${DURATION_MAP_EN[input.duration] ?? input.duration}
${avoidText}${freeTextPart}${emphasisBlock}${prefsBlock}

Reply with JSON only. Do not include any other text.

{
  "cards": [
    {
      "title": "Date title (within 15 characters)",
      "summary": "One-line summary (within 40 characters)",
      "estimated_time": "Estimated time",
      "estimated_budget": "Estimated cost per person",
      "tags": ["Tag 1", "Tag 2", "Tag 3"],
      "why_recommended": "Why this fits well (within 50 characters, warm tone)"
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
${avoidText}${freeTextPart}${emphasisBlock}${prefsBlock}

반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트는 출력하지 마세요.

{
  "cards": [
    {
      "title": "데이트 제목 (15자 이내)",
      "summary": "한 줄 설명 (40자 이내)",
      "estimated_time": "예상 소요 시간",
      "estimated_budget": "1인 예상 비용",
      "tags": ["태그1", "태그2", "태그3"],
      "why_recommended": "이 데이트가 잘 맞는 이유 (50자 이내, 따뜻한 말투)"
    }
  ]
}

태그 예시: 이동 적음, 피곤한 날 가능, 돈 적게 듦, 실패 확률 낮음, 실내, 야외, 로맨틱, 재밌음, 조용함, 사진 찍기 좋음`;
}

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

export type SoftMessageInput = {
  reasons: string[];
  freeText?: string;
};

const REASON_MAP: Record<string, string> = {
  tired: '피곤해요',
  budget: '예산이 부담돼요',
  far: '멀리 가기 싫어요',
  sorry: '거절하기 미안해요',
  near: '가까운 곳이 좋아요',
  crowded: '사람 많은 곳은 싫어요',
  time: '시간이 촉박해요',
  weather: '날씨가 맞지 않아요',
};

const REASON_MAP_EN: Record<string, string> = {
  tired: 'I am tired',
  budget: 'Budget feels tight',
  far: 'I do not want to travel far',
  sorry: 'I feel bad saying no',
  near: 'A nearby place is better',
  crowded: 'Crowded places are not my thing',
  time: 'I am short on time',
  weather: 'The weather is not great',
};

function buildSoftMessagePrompt(input: SoftMessageInput, language: AppLanguage): string {
  const isEnglish = language === 'en';
  const reasonText = input.reasons.map(r => (isEnglish ? REASON_MAP_EN[r] ?? r : REASON_MAP[r] ?? r)).join(', ');
  const freeTextPart = input.freeText ? `\n${isEnglish ? 'Additional note' : '추가 메모'}: ${input.freeText}` : '';

  if (isEnglish) {
    return `You are an expert at gently expressing hard-to-say feelings between couples.
Please write a warm, gentle message based on the situation below.

【Situation】
- What I want to say: ${reasonText}${freeTextPart}

Reply with JSON only. Do not include any other text.

{
  "message": "A gentle message to send to my partner (2-3 sentences, warm and sincere)"
}

Rules:
- Even if you are saying no or setting a boundary, the message should still feel loving
- Include soft language that shows you still care
- Avoid overly formal language and keep it natural, like a couple would speak
- Keep it concise, within 2-3 sentences`;
  }

  return `당신은 커플 사이에서 말하기 어려운 마음을 부드럽게 전달해주는 전문가입니다.
아래 상황을 보고, 상대방에게 부드럽고 따뜻하게 전달할 수 있는 문장을 만들어주세요.

【상황】
- 전달하고 싶은 마음: ${reasonText}${freeTextPart}

반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트는 출력하지 마세요.

{
  "message": "상대방에게 보낼 부드러운 문장 (2~3문장, 진심이 느껴지는 따뜻한 말투)"
}

규칙:
- 거절이나 부담을 표현하면서도 상대에 대한 애정이 느껴져야 합니다
- "~해서 미안해", "그래도 같이 있고 싶어" 같은 따뜻한 표현을 넣으세요
- 너무 격식체는 피하고, 자연스러운 연인 말투로 작성하세요
- 2~3문장 이내로 간결하게 작성하세요`;
}

const SOFT_MESSAGE_FALLBACKS: Record<AppLanguage, Record<string, string>> = {
  ko: {
    tired: '오늘은 조금 피곤해서 멀리 가기보다 가까운 곳에서 편하게 보내고 싶어. 그래도 너랑 시간 보내는 건 좋아 😊',
    budget: '이거 진짜 좋아 보이는데, 이번 주는 예산이 조금 부담돼서 다음에 더 여유 있을 때 가면 좋을 것 같아.',
    far: '오늘은 멀리 가기가 좀 힘들 것 같아. 가까운 데서 만나면 더 편하게 시간 보낼 수 있을 것 같아!',
    sorry: '제안해줘서 좋았는데, 이번엔 조금 부담이 돼서. 다음 번엔 꼭 같이 가자!',
    default: '오늘은 조금 쉬고 싶어. 가까운 데서 편하게 보내는 건 어때? 그래도 같이 있고 싶어 😊',
  },
  en: {
    tired: 'I am a little tired today, so I would rather keep it close and comfortable. I still love spending time with you 😊',
    budget: 'This sounds really nice, but this week is a bit tight for me. Maybe we can do it when I have a little more room.',
    far: 'Traveling far feels a bit hard for me today. It would be much nicer if we could meet somewhere nearby!',
    sorry: 'I really appreciate the idea, but it feels a little heavy for me this time. Let’s definitely go together next time!',
    default: 'I would like to rest a bit today. How about something comfortable nearby? I still want to be with you 😊',
  },
};

export async function generateSoftMessage(input: SoftMessageInput, language: AppLanguage = 'ko'): Promise<string> {
  try {
    const prompt = buildSoftMessagePrompt(input, language);
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 256 },
      }),
    });

    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.message) throw new Error('No message in response');

    return parsed.message as string;
  } catch {
    const firstReason = input.reasons[0];
    return SOFT_MESSAGE_FALLBACKS[language][firstReason] ?? SOFT_MESSAGE_FALLBACKS[language].default;
  }
}

export async function generateDateCards(
  input: FeelingInput,
  mode: string,
  prefs?: UserPreferences,
  language: AppLanguage = 'ko',
): Promise<DateCard[]> {
  try {
    const prompt = buildPrompt(input, mode, prefs, language);
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 1024 },
      }),
    });

    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.cards) || parsed.cards.length === 0) {
      throw new Error('No cards in response');
    }

    return parsed.cards.slice(0, 3) as DateCard[];
  } catch {
    return FALLBACK_CARDS_BY_LANGUAGE[language];
  }
}
