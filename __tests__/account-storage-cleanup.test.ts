import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  USER_STORAGE_BUCKETS,
  removeUserStorageObjects,
  type UserStorageClient,
} from '../supabase/functions/_shared/account-storage-cleanup';

function fakeStorage(filesByBucket: Record<string, string[]>, calls: Array<{ bucket: string; paths: string[] }>): UserStorageClient {
  return {
    from: (bucket: string) => ({
      list: async (_prefix: string) => ({
        data: (filesByBucket[bucket] ?? []).map((name) => ({ name })),
        error: null,
      }),
      remove: async (paths: string[]) => {
        calls.push({ bucket, paths });
        return { error: null };
      },
    }),
  };
}

describe('removeUserStorageObjects (탈퇴 시 uid 폴더 청소)', () => {
  it('avatars·memories 두 버킷의 uid 폴더 파일을 일괄 삭제한다', async () => {
    expect([...USER_STORAGE_BUCKETS]).toEqual(['avatars', 'memories']);

    const calls: Array<{ bucket: string; paths: string[] }> = [];
    const storage = fakeStorage(
      { avatars: ['avatar_1.jpg', 'avatar_2.jpg'], memories: ['memory_1.jpg'] },
      calls,
    );

    await removeUserStorageObjects(storage, 'u1');

    expect(calls).toEqual([
      { bucket: 'avatars', paths: ['u1/avatar_1.jpg', 'u1/avatar_2.jpg'] },
      { bucket: 'memories', paths: ['u1/memory_1.jpg'] },
    ]);
  });

  it('파일이 없는 버킷은 remove를 호출하지 않는다', async () => {
    const calls: Array<{ bucket: string; paths: string[] }> = [];
    await removeUserStorageObjects(fakeStorage({}, calls), 'u1');
    expect(calls).toEqual([]);
  });

  it('한 버킷의 실패가 다른 버킷 청소를 막지 않는다', async () => {
    const calls: Array<{ bucket: string; paths: string[] }> = [];
    const storage: UserStorageClient = {
      from: (bucket: string) => ({
        list: async () => {
          if (bucket === 'avatars') throw new Error('boom');
          return { data: [{ name: 'memory_1.jpg' }], error: null };
        },
        remove: async (paths: string[]) => {
          calls.push({ bucket, paths });
          return { error: null };
        },
      }),
    };

    await expect(removeUserStorageObjects(storage, 'u1')).resolves.toBeUndefined();
    expect(calls).toEqual([{ bucket: 'memories', paths: ['u1/memory_1.jpg'] }]);
  });
});

describe('delete-account 배선', () => {
  it('deleteUser 성공 확인 후에 storage 청소를 호출한다 (deleteUser 실패 시 사진이 먼저 날아가면 안 된다)', () => {
    const src = readFileSync(join(__dirname, '../supabase/functions/delete-account/index.ts'), 'utf8');
    const deleteAt = src.indexOf('deleteUser');
    const errorGuardAt = src.indexOf('if (deleteError)');
    const cleanupAt = src.indexOf('removeUserStorageObjects(');
    expect(deleteAt).toBeGreaterThan(0);
    expect(errorGuardAt).toBeGreaterThan(deleteAt);
    expect(cleanupAt).toBeGreaterThan(errorGuardAt);
  });
});
