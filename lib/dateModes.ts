export type DateModeId = 'feeling' | 'make_course' | 'next_meet';

export const DATE_MODE_IDS: DateModeId[] = ['feeling', 'make_course', 'next_meet'];

export const DATE_MODE_ROUTES: Record<DateModeId, string> = {
  feeling: '/mode-flow/feeling',
  make_course: '/mode-flow/course',
  next_meet: '/mode-flow/bucketlist',
};

// MVP: 코스 모드만 노출. feeling/next_meet 복원 시 이 배열에 다시 추가하면
// 모드 탭/홈 카드/후보 필터의 숨김 분기가 전부 자동 복원된다.
export const ENABLED_DATE_MODE_IDS: DateModeId[] = ['make_course'];

// DB의 date_cards.mode는 CHECK 없는 text라 'manual' 등 임의 값이 올 수 있어 string을 받는다.
export function isDateModeEnabled(id: DateModeId | string): boolean {
  return (ENABLED_DATE_MODE_IDS as string[]).includes(id);
}

export const PRIMARY_DATE_MODE_ROUTE = DATE_MODE_ROUTES[ENABLED_DATE_MODE_IDS[0]];
