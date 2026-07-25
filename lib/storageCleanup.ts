import { supabase } from './supabase';

// DB에는 스토리지 경로가 아니라 public URL 전체가 저장된다.
// 형식: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
export function parseStorageObjectFromPublicUrl(
  url?: string | null,
): { bucket: string; path: string } | null {
  if (!url) return null;

  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx < 0) return null;

  const rest = url.slice(idx + marker.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;

  const bucket = rest.slice(0, slash);
  const path = decodeURIComponent(rest.slice(slash + 1).split('?')[0]);
  if (!path) return null;

  return { bucket, path };
}

// 베스트 에포트 삭제. 파일 정리 실패가 본 작업(추억 삭제·프로필 저장 등)을 막으면 안 된다.
export async function removeStorageObjectByUrl(url?: string | null): Promise<void> {
  const parsed = parseStorageObjectFromPublicUrl(url);
  if (!parsed) return;

  try {
    await supabase.storage.from(parsed.bucket).remove([parsed.path]);
  } catch {
    // 고아 파일은 남지만 사용자 흐름은 계속 진행한다.
  }
}
