import {
  DATE_MODE_IDS,
  DATE_MODE_ROUTES,
  ENABLED_DATE_MODE_IDS,
  PRIMARY_DATE_MODE_ROUTE,
  isDateModeEnabled,
} from '../lib/dateModes';

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

describe('MVP 활성 모드 (ENABLED_DATE_MODE_IDS)', () => {
  it('MVP에서는 make_course만 활성이다', () => {
    expect(ENABLED_DATE_MODE_IDS).toEqual(['make_course']);
  });

  it('활성 모드는 전체 모드 목록의 부분집합이다', () => {
    ENABLED_DATE_MODE_IDS.forEach((id) => {
      expect(DATE_MODE_IDS).toContain(id);
    });
  });

  it('모든 활성 모드가 라우트를 갖는다', () => {
    ENABLED_DATE_MODE_IDS.forEach((id) => {
      expect(DATE_MODE_ROUTES[id]).toBeTruthy();
    });
  });

  it('PRIMARY_DATE_MODE_ROUTE는 코스 만들기 화면이다', () => {
    expect(PRIMARY_DATE_MODE_ROUTE).toBe('/mode-flow/course');
  });

  it('isDateModeEnabled가 활성 여부를 정확히 판별한다', () => {
    expect(isDateModeEnabled('make_course')).toBe(true);
    expect(isDateModeEnabled('feeling')).toBe(false);
    expect(isDateModeEnabled('next_meet')).toBe(false);
  });
});
