export const PENDING_INVITE_CODE_KEY = 'datenavi.pendingInviteCode';

// 공유 링크는 커스텀 스킴(datenavi://) 대신 공개 웹 랜딩을 가리킨다. 랜딩이 OG 프리뷰를
// 띄우고, 앱이 있으면 유니버설 링크로 바로 열고, 없으면 스토어로 안내한다.
export const INVITE_WEB_BASE = 'https://date-navi.vercel.app';

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

// 공유용 초대 링크. 코드는 정규화하고, 초대자 언어(l)를 실어 랜딩·OG가 그 언어로 렌더한다.
export function buildInviteUrl(code: string | null, language: 'ko' | 'en') {
  const normalized = formatInviteCode(code);
  if (!normalized) return '';
  return `${INVITE_WEB_BASE}/invite?code=${normalized}&l=${language}`;
}

// 공유 시트에 넘길 페이로드. URL은 message 텍스트에만 싣는다 — 실기기 확인 결과(2026-07-26):
// 카카오는 텍스트 안 URL만 프리뷰하고 별도 url 아이템은 무시(url만 주면 OG 카드 없음),
// WhatsApp 익스텐션은 url 아이템만 프리뷰. 기본 공유 시트로는 양립 불가라 주 타깃인
// 카카오를 택했다(WhatsApp은 프리뷰 없이 링크만 동작). 양쪽에 다 실으면 카카오 카드 2개.
// 완벽 해결은 카카오 SDK 네이티브 공유 — 출시 후 개선 항목.
export function buildInviteShareContent(
  code: string | null,
  language: 'ko' | 'en',
  shareMessage: string,
): { title: string; message: string } | null {
  const url = buildInviteUrl(code, language);
  if (!url) return null;
  return { title: 'Date Navi', message: `${shareMessage}\n\n${url}` };
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
