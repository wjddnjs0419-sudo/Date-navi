import {
  getDefaultMeetingDate,
  getMeetingTimeOptions,
  MEETING_TIME_OPTIONS,
} from '../components/recommendation/course-time-selector';

describe('course meeting time options', () => {
  it('offers the full day in 30-minute increments for a future date', () => {
    const now = new Date(2026, 7, 26, 12, 0, 0);
    const futureDate = new Date(2026, 7, 27, 12, 0, 0);

    expect(getMeetingTimeOptions(futureDate, now)).toHaveLength(48);
    expect(getMeetingTimeOptions(futureDate, now)[0]).toBe(0);
    expect(getMeetingTimeOptions(futureDate, now).at(-1)).toBe(23 * 60 + 30);
    expect(MEETING_TIME_OPTIONS).toHaveLength(48);
  });

  it('does not offer past slots for today and rounds the default to the next half hour', () => {
    const now = new Date(2026, 7, 26, 12, 1, 2);
    const today = new Date(2026, 7, 26, 12, 0, 0);

    expect(getMeetingTimeOptions(today, now)[0]).toBe(12 * 60 + 30);
    expect(getDefaultMeetingDate(now)).toEqual(new Date(2026, 7, 26, 12, 30, 0));
  });
});
