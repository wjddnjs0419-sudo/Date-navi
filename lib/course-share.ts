export const COURSE_SHARE_WEB_BASE = 'https://date-navi.vercel.app';

export type CourseShareStep = {
  label: string;
  desc?: string;
  place_name?: string;
};

export type CourseShareDto = {
  title: string;
  summary: string;
  estimated_time: string;
  estimated_budget: string;
  steps: CourseShareStep[];
};

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

export function normalizeCourseShareToken(value?: string | string[] | null): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string') return null;
  const token = first.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function buildCourseShareUrl(token: string): string {
  const normalized = normalizeCourseShareToken(token);
  if (!normalized) return '';
  return `${COURSE_SHARE_WEB_BASE}/course/${normalized}`;
}

export function parseCourseShareTokenFromUrl(url?: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/course\/([^/]+)\/?$/);
    return match ? normalizeCourseShareToken(decodeURIComponent(match[1])) : null;
  } catch {
    return null;
  }
}

export function resolveCourseShareRoute(url?: string | null): string | null {
  const token = parseCourseShareTokenFromUrl(url);
  return token ? `/course/${token}` : null;
}

export function parseCourseShareDto(value: unknown): CourseShareDto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const title = readText(record.title);
  if (!title) return null;

  const steps = Array.isArray(record.steps)
    ? record.steps.flatMap((item): CourseShareStep[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const step = item as Record<string, unknown>;
      const label = readText(step.label);
      if (!label) return [];
      const next: CourseShareStep = { label };
      const desc = readText(step.desc);
      const placeName = readText(step.place_name);
      if (desc) next.desc = desc;
      if (placeName) next.place_name = placeName;
      return [next];
    })
    : [];

  return {
    title,
    summary: readText(record.summary) ?? '',
    estimated_time: readText(record.estimated_time) ?? '',
    estimated_budget: readText(record.estimated_budget) ?? '',
    steps,
  };
}

export function buildCourseShareMessage(
  dto: CourseShareDto,
  token: string,
  language: 'ko' | 'en' = 'ko',
): string {
  const url = buildCourseShareUrl(token);
  if (!url) throw new Error('Cannot build a course share message without a valid token.');

  const places = dto.steps
    .map((step) => step.place_name ?? step.label)
    .filter((place): place is string => place.trim().length > 0)
    .map((place, index) => `${index + 1}. ${place}`)
    .join('\n');
  const callToAction = language === 'en'
    ? 'View the full course in Date Navi'
    : 'Date Navi에서 전체 코스 보기';

  return `${dto.title}\n\n${places || dto.summary}\n\n${callToAction}\n${url}`;
}
