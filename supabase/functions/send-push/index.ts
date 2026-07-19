import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type NotifType = 'reaction' | 'new_card' | 'soft_message';

const REACTION_LABELS: Record<string, string> = {
  love: '완전 끌려',
  like: '느낌은 좋아',
  burden: '오늘은 부담돼',
  next_time: '다음에',
};

function buildMessage(type: NotifType, payload: Record<string, unknown>): { title: string; body: string } {
  if (type === 'reaction') {
    const label = REACTION_LABELS[String(payload.reaction_type)] ?? '';
    const cardTitle = String(payload.card_title ?? '');
    return { title: '상대가 반응을 남겼어요', body: [label, cardTitle].filter(Boolean).join(' · ') };
  }
  // new_card = 데이트 제안(카드 + 문구). legacy soft_message도 동일하게 처리한다.
  const cardTitle = String(payload.card_title ?? '');
  const preview = String(payload.message ?? '').slice(0, 60);
  return { title: '데이트 제안이 도착했어요', body: cardTitle || preview };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const secret = req.headers.get('X-Internal-Secret');
    if (!secret || secret !== Deno.env.get('INTERNAL_PUSH_SECRET')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { user_id, type, payload } = await req.json();
    if (!user_id || !type) return json({ error: 'Invalid request' }, 400);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: tokenRow } = await adminClient
      .from('push_tokens')
      .select('expo_push_token')
      .eq('user_id', user_id)
      .maybeSingle();

    if (!tokenRow?.expo_push_token) return json({ skipped: true });

    const { title, body } = buildMessage(type as NotifType, (payload ?? {}) as Record<string, unknown>);

    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: tokenRow.expo_push_token,
        title,
        body,
        data: { type, card_id: (payload as Record<string, unknown> | null)?.card_id },
      }),
    });

    const pushResult = await pushRes.json();
    const ticket = pushResult?.data;
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      await adminClient.from('push_tokens').delete().eq('user_id', user_id);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
