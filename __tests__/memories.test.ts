import { resolveMemoryScope } from '../lib/memories';

describe('resolveMemoryScope', () => {
  it('커플 연동 상태면 couple_id 기준으로 스코프 지정 (상대방 추억도 포함되도록)', () => {
    expect(resolveMemoryScope('couple-1', 'user-1')).toEqual({ column: 'couple_id', value: 'couple-1' });
  });
  it('커플 미연동(솔로) 상태면 user_id 기준으로 스코프 지정', () => {
    expect(resolveMemoryScope(null, 'user-1')).toEqual({ column: 'user_id', value: 'user-1' });
  });
  it('couple_id가 undefined여도 솔로로 취급', () => {
    expect(resolveMemoryScope(undefined, 'user-1')).toEqual({ column: 'user_id', value: 'user-1' });
  });
});
