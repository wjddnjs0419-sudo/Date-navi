export type DateModeId = 'feeling' | 'make_course' | 'next_meet';

export const DATE_MODE_IDS: DateModeId[] = ['feeling', 'make_course', 'next_meet'];

export const DATE_MODE_ROUTES: Record<DateModeId, string> = {
  feeling: '/mode-flow/feeling',
  make_course: '/mode-flow/course',
  next_meet: '/mode-flow/bucketlist',
};
