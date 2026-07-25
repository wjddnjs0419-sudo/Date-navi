// 배포 환경 값. Supabase anon/publishable 키는 RLS로 보호되는 공개 키라 노출돼도 안전하다.
// Vercel 환경변수로 덮어쓸 수 있고, 없으면 아래 기본값을 쓴다.
export const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://wqjguifsmtblgrhdfnji.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_uZwrAV6AMwyD43FiDJ9VrA_QGxnYG1z';

// 공유 링크가 사는 원본 도메인.
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://date-navi.vercel.app';

// 앱 딥링크 커스텀 스킴(유니버설 링크가 안 걸렸을 때의 2차 시도).
export const APP_SCHEME = 'datenavi';

// 스토어 링크. 아직 정식 출시 전이면 비워 둔다 → 랜딩이 "곧 출시" 안내로 폴백.
// 출시 후 App Store URL 한 줄만 넣으면 앱 재배포 없이 반영된다.
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL ?? '';
export const TESTFLIGHT_URL = process.env.NEXT_PUBLIC_TESTFLIGHT_URL ?? '';
