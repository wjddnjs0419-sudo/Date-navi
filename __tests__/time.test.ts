import { relativeTime, daysUntilIso } from '../lib/time';

const labels = { justNow: '방금', minutes: '분 전', hours: '시간 전', yesterday: '어제', days: '일 전' };
const NOW = new Date('2026-07-08T12:00:00Z').getTime();

describe('relativeTime', () => {
  it('1분 미만이면 "방금"', () => {
    expect(relativeTime(new Date(NOW - 30 * 1000).toISOString(), labels, NOW)).toBe('방금');
  });

  it('59분이면 "59분 전"', () => {
    expect(relativeTime(new Date(NOW - 59 * 60 * 1000).toISOString(), labels, NOW)).toBe('59분 전');
  });

  it('1시간이면 "1시간 전"', () => {
    expect(relativeTime(new Date(NOW - 60 * 60 * 1000).toISOString(), labels, NOW)).toBe('1시간 전');
  });

  it('23시간이면 "23시간 전"', () => {
    expect(relativeTime(new Date(NOW - 23 * 60 * 60 * 1000).toISOString(), labels, NOW)).toBe('23시간 전');
  });

  it('정확히 1일 지나면 "어제"', () => {
    expect(relativeTime(new Date(NOW - 24 * 60 * 60 * 1000).toISOString(), labels, NOW)).toBe('어제');
  });

  it('2일이면 "2일 전"', () => {
    expect(relativeTime(new Date(NOW - 48 * 60 * 60 * 1000).toISOString(), labels, NOW)).toBe('2일 전');
  });
});

describe('daysUntilIso', () => {
  const TODAY = new Date(2026, 6, 21, 9, 0, 0).getTime();

  it('오늘 날짜면 0', () => {
    expect(daysUntilIso('2026-07-21', TODAY)).toBe(0);
  });

  it('미래 날짜면 양수', () => {
    expect(daysUntilIso('2026-07-25', TODAY)).toBe(4);
  });

  it('과거 날짜면 음수', () => {
    expect(daysUntilIso('2026-07-18', TODAY)).toBe(-3);
  });

  it('null이면 0', () => {
    expect(daysUntilIso(null, TODAY)).toBe(0);
  });
});
