export type RelativeTimeLabels = {
  justNow: string;
  minutes: string;
  hours: string;
  yesterday: string;
  days: string;
};

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
