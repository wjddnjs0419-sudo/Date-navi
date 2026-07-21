export type RelativeTimeLabels = {
  justNow: string;
  minutes: string;
  hours: string;
  yesterday: string;
  days: string;
};

export function daysUntilIso(iso: string | null, now: number = Date.now()): number {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86400000);
}

export function relativeTime(iso: string, labels: RelativeTimeLabels, now: number = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return labels.justNow;
  if (min < 60) return `${min}${labels.minutes}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}${labels.hours}`;
  const day = Math.floor(hr / 24);
  if (day === 1) return labels.yesterday;
  return `${day}${labels.days}`;
}
