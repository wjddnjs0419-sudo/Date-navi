import { DATE_MODE_IDS, DATE_MODE_ROUTES } from '../lib/dateModes';

describe('date mode 목록/라우트 동기화', () => {
  it('정확히 3개 모드만 남아있다 (pick_for_me, light 제거됨)', () => {
    expect(DATE_MODE_IDS).toEqual(['feeling', 'make_course', 'next_meet']);
  });

  it('모든 모드가 라우트를 갖는다', () => {
    DATE_MODE_IDS.forEach((id) => {
      expect(DATE_MODE_ROUTES[id]).toBeTruthy();
    });
  });

  it('DATE_MODE_ROUTES에 목록에 없는 모드가 섞여있지 않다', () => {
    expect(Object.keys(DATE_MODE_ROUTES).sort()).toEqual([...DATE_MODE_IDS].sort());
  });
});
