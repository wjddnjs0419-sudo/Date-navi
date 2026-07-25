import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockRemove = jest.fn();
const mockStorageFrom = jest.fn((_bucket: string) => ({ remove: mockRemove }));
jest.mock('../lib/supabase', () => ({
  supabase: { storage: { from: (bucket: string) => mockStorageFrom(bucket) } },
}));

import { parseStorageObjectFromPublicUrl, removeStorageObjectByUrl } from '../lib/storageCleanup';

const BASE = 'https://abc.supabase.co/storage/v1/object/public';

describe('parseStorageObjectFromPublicUrl', () => {
  it('public URL에서 버킷과 경로를 파싱한다', () => {
    expect(parseStorageObjectFromPublicUrl(`${BASE}/memories/u1/memory_123.jpg`))
      .toEqual({ bucket: 'memories', path: 'u1/memory_123.jpg' });
    expect(parseStorageObjectFromPublicUrl(`${BASE}/avatars/u1/avatar_9.jpg`))
      .toEqual({ bucket: 'avatars', path: 'u1/avatar_9.jpg' });
  });

  it('스토리지 public URL이 아니면 null', () => {
    expect(parseStorageObjectFromPublicUrl('https://example.com/x.jpg')).toBeNull();
    expect(parseStorageObjectFromPublicUrl('')).toBeNull();
    expect(parseStorageObjectFromPublicUrl(null)).toBeNull();
    expect(parseStorageObjectFromPublicUrl(`${BASE}/memories/`)).toBeNull();
  });
});

describe('removeStorageObjectByUrl', () => {
  beforeEach(() => jest.clearAllMocks());

  it('파싱된 버킷·경로로 remove를 호출한다', async () => {
    mockRemove.mockResolvedValue({ error: null });

    await removeStorageObjectByUrl(`${BASE}/memories/u1/memory_123.jpg`);

    expect(mockStorageFrom).toHaveBeenCalledWith('memories');
    expect(mockRemove).toHaveBeenCalledWith(['u1/memory_123.jpg']);
  });

  it('스토리지 URL이 아니면 아무것도 안 한다', async () => {
    await removeStorageObjectByUrl('https://example.com/x.jpg');
    await removeStorageObjectByUrl(null);
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('remove 실패는 조용히 무시한다 (파일 정리는 본 작업을 막지 않는다)', async () => {
    mockRemove.mockRejectedValue(new Error('network'));
    await expect(removeStorageObjectByUrl(`${BASE}/memories/u1/m.jpg`)).resolves.toBeUndefined();
  });
});

describe('스토리지 정리 배선 (업로드만 있고 삭제가 0곳이던 버그)', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('추억 삭제 시 사진 오브젝트도 지운다 (목록·상세 양쪽)', () => {
    for (const p of ['app/(tabs)/memories.tsx', 'app/card/memory/[id].tsx']) {
      const src = read(p);
      expect(src).toMatch(/\.delete\(\)\.eq\('id',[^)]*\)\.select\('id, photo_url'\)/);
      expect(src).toMatch(/removeStorageObjectByUrl/);
    }
  });

  it('추억 사진 교체 저장 시 옛 사진을 지운다', () => {
    const src = read('app/card/memory/edit/[id].tsx');
    expect(src).toMatch(/removeStorageObjectByUrl/);
  });

  it('아바타 교체 시 옛 아바타를 지운다 (온보딩·프로필 수정)', () => {
    for (const p of ['app/account/edit-profile.tsx', 'app/onboarding/photo.tsx']) {
      expect(read(p)).toMatch(/removeStorageObjectByUrl/);
    }
  });

  it('신규 추억·리뷰 작성 중 사진 재선택 시 이전 업로드를 지운다 (저장 전이라 DB 참조 없음 → 항상 안전)', () => {
    for (const p of ['app/card/memory/new.tsx', 'app/card/review.tsx']) {
      expect(read(p)).toMatch(/removeStorageObjectByUrl/);
    }
  });
});
