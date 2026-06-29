import { supabase } from './supabase';
import type { AppLanguage } from './i18n';
import { buildPrompt } from './prompt';
import type { CourseStep } from './course';
export type { CourseStep };

// AI 호출은 Supabase Edge Function(generate-ai)이 대행한다.
// Anthropic 키는 함수 시크릿으로만 존재하며 클라이언트 번들에 노출되지 않는다.
async function invokeAI(action: 'cards' | 'soft_message', prompt: string): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('generate-ai', {
    body: { action, prompt },
  });
  if (error) throw error;
  return data;
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
  steps?: CourseStep[];
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
    const data = (await invokeAI('soft_message', prompt)) as { message?: string };
    if (!data?.message) throw new Error('No message in response');

    return data.message;
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
    const data = (await invokeAI('cards', prompt)) as { cards?: DateCard[] };
    if (!Array.isArray(data?.cards) || data.cards.length === 0) {
      throw new Error('No cards in response');
    }

    return data.cards.slice(0, 3);
  } catch {
    return FALLBACK_CARDS_BY_LANGUAGE[language];
  }
}
