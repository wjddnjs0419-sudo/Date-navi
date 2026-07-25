// 탈퇴 시 사용자 스토리지 청소. auth.admin.deleteUser는 DB row만 cascade하고
// storage 오브젝트는 지우지 않으므로, 삭제 전에 uid 폴더를 직접 비운다.
// 두 버킷 모두 경로 규칙이 `${userId}/<file>` 1단계다.
export const USER_STORAGE_BUCKETS = ['avatars', 'memories'] as const;

export type UserStorageClient = {
  from(bucket: string): {
    list(
      prefix: string,
      options?: { limit?: number },
    ): Promise<{ data: Array<{ name: string }> | null; error: unknown }>;
    remove(paths: string[]): Promise<{ error: unknown }>;
  };
};

// 베스트 에포트: 한 버킷이 실패해도 나머지는 청소하고, 실패가 탈퇴 자체를 막지 않는다.
export async function removeUserStorageObjects(
  storage: UserStorageClient,
  userId: string,
): Promise<void> {
  for (const bucket of USER_STORAGE_BUCKETS) {
    try {
      const { data } = await storage.from(bucket).list(userId, { limit: 1000 });
      const paths = (data ?? []).map((file) => `${userId}/${file.name}`);
      if (paths.length === 0) continue;
      await storage.from(bucket).remove(paths);
    } catch (err) {
      console.error(`storage cleanup failed for bucket=${bucket}`, err);
    }
  }
}
