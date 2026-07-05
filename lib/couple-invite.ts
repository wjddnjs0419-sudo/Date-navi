export const PENDING_INVITE_CODE_KEY = 'datemate.pendingInviteCode';

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
