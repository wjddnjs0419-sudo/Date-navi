import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PARSE_STEP_INTENTS_SCHEMA } from './parse-step-intents-schema.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const CARDS_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          // estimated_time/budget은 앱이 결정론적으로 채운다 (V2 §11) — Claude 미생성.
          tags: { type: 'array', items: { type: 'string' } },
          why_recommended: { type: 'string' },
          // 카카오 로컬 실제 장소 (location 입력 시에만 채워짐 — optional)
          place_name: { type: 'string' },
          place_address: { type: 'string' },
          map_url: { type: 'string' },
          // make_course 모드 전용 동선 단계 (optional — required 미포함이라 다른 모드는 생략 가능)
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                desc: { type: 'string' },
              },
              required: ['label'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'summary', 'tags', 'why_recommended'],
        additionalProperties: false,
      },
    },
  },
  required: ['cards'],
  additionalProperties: false,
};

const SOFT_MESSAGE_SCHEMA = {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message'],
  additionalProperties: false,
};

// V2 §10 — Claude는 후보 candidate_id를 선택하고 설명만 생성한다. 장소·estimated 미생성.
const FEELING_SELECT_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          candidate_id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          why_recommended: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['candidate_id', 'title', 'summary', 'why_recommended', 'tags'],
        additionalProperties: false,
      },
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
};

// make_course — steps[] (순서 보존). 장소 단계는 candidate_id, 행동 단계는 label/desc만 (§16).
const COURSE_SELECT_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          why_recommended: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                candidate_id: { type: 'string' },
                label: { type: 'string' },
                desc: { type: 'string' },
              },
              required: ['label'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'summary', 'why_recommended', 'tags', 'steps'],
        additionalProperties: false,
      },
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
};

// recommend-date 전용: 장소 사실은 서버 후보에서만 조립하며 Claude는 ID만 선택한다.
const RECOMMEND_DATE_SELECT_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stepId: { type: 'string' },
          candidateId: { type: 'string' },
        },
        required: ['stepId', 'candidateId'],
        additionalProperties: false,
      },
    },
  },
  required: ['steps'],
  additionalProperties: false,
};

// recommend-date의 "이 단계 교체" 전용: 대상 스텝 하나에 대한 검증된 candidateId만 최대 10개 순서대로 선택.
const REPLACEMENT_SELECT_SCHEMA = {
  type: 'object',
  properties: {
    candidateIds: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['candidateIds'],
  additionalProperties: false,
};

// logged: 프롬프트/응답 로깅 대상 여부 — soft_message(초대·거절 메시지)는 추천 품질과 무관하므로 제외.
const ACTION_CONFIG: Record<string, { schema: object; maxTokens: number; temperature: number; logged: boolean }> = {
  cards: { schema: CARDS_SCHEMA, maxTokens: 2048, temperature: 0.8, logged: true },
  soft_message: { schema: SOFT_MESSAGE_SCHEMA, maxTokens: 256, temperature: 0.9, logged: false },
  feeling_select: { schema: FEELING_SELECT_SCHEMA, maxTokens: 1536, temperature: 0.7, logged: true },
  course_select: { schema: COURSE_SELECT_SCHEMA, maxTokens: 2048, temperature: 0.7, logged: true },
  recommend_date_select: { schema: RECOMMEND_DATE_SELECT_SCHEMA, maxTokens: 512, temperature: 0, logged: true },
  replacement_select: { schema: REPLACEMENT_SELECT_SCHEMA, maxTokens: 256, temperature: 0, logged: true },
  parse_step_intents: { schema: PARSE_STEP_INTENTS_SCHEMA, maxTokens: 512, temperature: 0, logged: true },
};

const MODEL = 'claude-haiku-4-5';

// ACTION_CONFIG의 logged 플래그에서 도출 — 로깅 대상 액션을 손으로 다시 나열하지 않는다(단일 소스).
const LOGGED_ACTIONS = new Set(
  Object.entries(ACTION_CONFIG).filter(([, cfg]) => cfg.logged).map(([key]) => key),
);

type LogParams = {
  userId: string;
  action: string;
  promptVersion: string;
  prompt: string;
  model: string;
  status: 'success' | 'error';
  responseJson?: unknown;
  errorMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
};

// 로깅 실패가 원래 응답 흐름을 절대 막지 않도록 호출부에서 await하되 에러는 여기서 삼킨다.
async function logRecommendation(adminClient: ReturnType<typeof createClient<any>>, params: LogParams) {
  if (!LOGGED_ACTIONS.has(params.action)) return;
  try {
    const { error } = await adminClient.from('ai_recommendation_logs').insert({
      user_id: params.userId,
      action: params.action,
      prompt_version: params.promptVersion,
      model: params.model,
      prompt: params.prompt,
      status: params.status,
      response_json: params.responseJson ?? null,
      error_message: params.errorMessage ?? null,
      input_tokens: params.inputTokens ?? null,
      output_tokens: params.outputTokens ?? null,
      latency_ms: params.latencyMs,
    });
    if (error) console.error('ai_recommendation_logs insert failed', error);
  } catch (err) {
    console.error('ai_recommendation_logs insert threw', err);
  }
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

    const { action, prompt, prompt_version } = await req.json();
    const config = typeof action === 'string' ? ACTION_CONFIG[action] : undefined;
    if (!config || typeof prompt !== 'string' || !prompt) {
      return json({ error: 'Invalid request' }, 400);
    }
    const promptVersion = typeof prompt_version === 'string' && prompt_version ? prompt_version : 'unknown';

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'AI key not configured' }, 500);

    // 로깅 전용 admin 클라이언트 — RLS를 우회해 ai_recommendation_logs에 쓰기 위함.
    // action/prompt 검증 이후에 만들어서, 검증 실패나 soft_message처럼 로깅이 필요 없는
    // 요청까지 SUPABASE_SERVICE_ROLE_KEY 존재 여부에 발목 잡히지 않게 한다.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const baseLog = { userId: user.id, action, promptVersion, prompt, model: MODEL };

    const startedAt = Date.now();
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'structured-outputs-2025-11-13',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        output_config: { format: { type: 'json_schema', schema: config.schema } },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      console.error('Anthropic error', aiResponse.status, detail);
      await logRecommendation(adminClient, {
        ...baseLog,
        status: 'error', errorMessage: `Anthropic ${aiResponse.status}: ${detail.slice(0, 500)}`,
        latencyMs: Date.now() - startedAt,
      });
      return json({ error: 'AI request failed' }, 502);
    }

    const data = await aiResponse.json();
    const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
    const text: string = textBlock?.text ?? '';
    if (!text) {
      console.error('generate-ai empty AI response');
      await logRecommendation(adminClient, {
        ...baseLog,
        status: 'error', errorMessage: 'Empty AI response',
        latencyMs: Date.now() - startedAt,
      });
      return json({ error: 'Empty AI response' }, 502);
    }

    // 구조화 출력이라 스키마에 맞는 JSON 보장 → 그대로 파싱해 반환. usage는 계측용으로 첨부 (§7·§18).
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      console.error('generate-ai JSON parse failed', parseErr);
      await logRecommendation(adminClient, {
        ...baseLog,
        status: 'error', errorMessage: `JSON parse failed: ${String(parseErr)}`,
        latencyMs: Date.now() - startedAt,
      });
      return json({ error: 'Invalid AI response' }, 502);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      await logRecommendation(adminClient, {
        ...baseLog,
        status: 'error', errorMessage: 'Structured response was not an object',
        latencyMs: Date.now() - startedAt,
      });
      return json({ error: 'Invalid AI response' }, 502);
    }

    await logRecommendation(adminClient, {
      ...baseLog,
      status: 'success', responseJson: parsed,
      inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens,
      latencyMs: Date.now() - startedAt,
    });

    if (action === 'recommend_date_select' || action === 'replacement_select' || action === 'parse_step_intents') return json(parsed);
    return json({ ...parsed, _usage: { input_tokens: data.usage?.input_tokens, output_tokens: data.usage?.output_tokens } });
  } catch (err) {
    console.error('generate-ai error', err);
    return json({ error: 'Internal error' }, 500);
  }
});
