import { saveAppleFullNameIfMissing } from '../lib/appleProfile';
import { supabase } from '../lib/supabase';

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

function mockProfileTable(profile: { display_name: string | null } | null) {
  const upsert = jest.fn().mockResolvedValue({ error: null });
  const maybeSingle = jest.fn().mockResolvedValue({ data: profile, error: null });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  mockFrom.mockReturnValue({ select, eq, maybeSingle, upsert });
  return { upsert, select };
}

describe('saveAppleFullNameIfMissing', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('애플이 이름을 안 줬으면 DB를 건드리지 않는다', async () => {
    await saveAppleFullNameIfMissing(null);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('프로필에 이미 이름이 있으면 덮어쓰지 않는다', async () => {
    const { upsert } = mockProfileTable({ display_name: '기존닉네임' });

    await saveAppleFullNameIfMissing('김정원');

    expect(upsert).not.toHaveBeenCalled();
  });

  it('프로필의 이름이 비어 있으면 애플 이름을 저장한다', async () => {
    const { upsert } = mockProfileTable({ display_name: '   ' });

    await saveAppleFullNameIfMissing('김정원');

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', user_id: 'user-1', display_name: '김정원' }),
      { onConflict: 'user_id' },
    );
  });

  it('프로필 row 자체가 없으면 애플 이름으로 만든다', async () => {
    const { upsert } = mockProfileTable(null);

    await saveAppleFullNameIfMissing('Jane Doe');

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'Jane Doe' }),
      { onConflict: 'user_id' },
    );
  });

  it('세션 사용자가 없으면 조용히 넘어간다', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockProfileTable(null);

    await saveAppleFullNameIfMissing('Jane Doe');

    expect(mockFrom).not.toHaveBeenCalled();
  });

  // 이름 저장은 부가 기능이라, 실패해도 이미 성공한 로그인을 에러로 뒤집으면 안 된다.
  it('DB 조회가 실패해도 예외를 던지지 않는다', async () => {
    mockFrom.mockImplementation(() => { throw new Error('network down'); });

    await expect(saveAppleFullNameIfMissing('Jane Doe')).resolves.toBeUndefined();
  });
});
