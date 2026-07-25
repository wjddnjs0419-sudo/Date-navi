import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

// 초대코드 정규화 — 앱의 normalizeInviteCode 와 동일한 규칙(대문자화, DN- 접두사·비영숫자 제거).
export function normalizeCode(raw: string | null | undefined): string {
  if (!raw) return '';
  const body = raw.trim().toUpperCase().replace(/\s/g, '').replace(/^DN-?/, '');
  const clean = body.replace(/[^A-Z0-9]/g, '');
  return clean ? `DN-${clean}` : '';
}

// 초대코드로 초대자 display_name 만 조회한다(공개 RPC). 없거나 실패하면 null.
export async function fetchInviterName(code: string): Promise<string | null> {
  const normalized = normalizeCode(code);
  if (!normalized) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_invite_inviter`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ invite_code: normalized }),
      // 이름은 자주 안 바뀌므로 잠깐 캐시.
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const value = (await res.json()) as string | null;
    const name = typeof value === 'string' ? value.trim() : '';
    return name || null;
  } catch {
    return null;
  }
}
