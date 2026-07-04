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
          estimated_time: { type: 'string' },
          estimated_budget: { type: 'string' },
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
        required: ['title', 'summary', 'estimated_time', 'estimated_budget', 'tags', 'why_recommended'],
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

const ACTION_CONFIG: Record<string, { schema: object; maxTokens: number; temperature: number }> = {
  cards: { schema: CARDS_SCHEMA, maxTokens: 2048, temperature: 0.8 },
  soft_message: { schema: SOFT_MESSAGE_SCHEMA, maxTokens: 256, temperature: 0.9 },
};

const MODEL = 'claude-haiku-4-5';

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

    const { action, prompt } = await req.json();
    const config = typeof action === 'string' ? ACTION_CONFIG[action] : undefined;
    if (!config || typeof prompt !== 'string' || !prompt) {
      return json({ error: 'Invalid request' }, 400);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'AI key not configured' }, 500);

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
      return json({ error: 'AI request failed' }, 502);
    }

    const data = await aiResponse.json();
    const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
    const text: string = textBlock?.text ?? '';
    if (!text) return json({ error: 'Empty AI response' }, 502);

    // 구조화 출력이라 스키마에 맞는 JSON 보장 → 그대로 파싱해 반환
    return json(JSON.parse(text));
  } catch (err) {
    console.error('generate-ai error', err);
    return json({ error: 'Internal error' }, 500);
  }
});
