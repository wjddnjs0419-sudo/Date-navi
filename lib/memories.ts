export type MemoryScope = { column: 'couple_id' | 'user_id'; value: string };

// 커플 연동 후엔 상대방이 남긴 추억도 함께 보이도록 couple_id로, 솔로 상태엔 user_id로 스코프를 좁힌다.
export function resolveMemoryScope(coupleId: string | null | undefined, userId: string): MemoryScope {
  return coupleId ? { column: 'couple_id', value: coupleId } : { column: 'user_id', value: userId };
}
