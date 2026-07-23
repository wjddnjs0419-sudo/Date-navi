export const PENDING_INVITE_CODE_KEY = 'datenavi.pendingInviteCode';

export function isCoupleRowLinked(
  row?: { status: string; partner_user_id: string | null } | null,
): boolean {
  return !!row && row.status === 'linked' && !!row.partner_user_id;
}

export function normalizeInviteCode(value?: string | string[] | null) {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return '';

  const compact = String(first).trim().toUpperCase().replace(/\s/g, '');
  if (!compact) return '';

  const body = compact.startsWith('DN-')
    ? compact.slice(3)
    : compact.replace(/^DN/, '').replace(/^-/, '');

  const clean = body.replace(/[^A-Z0-9]/g, '');
  return clean ? `DN-${clean}` : '';
}

export function inviteCodeBody(value?: string | null) {
  return normalizeInviteCode(value).replace('DN-', '');
}

export function formatInviteCode(value?: string | null) {
  if (!value) return '';
  return normalizeInviteCode(value.startsWith('DN-') ? value : `DN-${value}`);
}

export function parseInviteCodeFromUrl(url?: string | null) {
  if (!url) return '';

  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    if (code) return normalizeInviteCode(code);
  } catch {
    // Fall back to a tiny query parser for non-standard native URLs.
  }

  const match = /[?&]code=([^&]+)/.exec(url);
  return match ? normalizeInviteCode(decodeURIComponent(match[1])) : '';
}

type ConnectionStatus = 'none' | 'waiting' | 'linked';

// 연결 완료 감지 시 이동할 목적지. 온보딩 중 + linked + 파트너 있을 때만 이동.
export function resolveCoupleConnectDestination(input: {
  status: ConnectionStatus;
  partnerUserId: string | null;
  onboardingCompleted: boolean;
}): 'connected' | null {
  if (input.onboardingCompleted) return null;
  if (input.status !== 'linked') return null;
  if (!input.partnerUserId) return null;
  return 'connected';
}
