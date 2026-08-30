import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

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

export async function fetchPublicCourse(token: string): Promise<CourseShareDto | null> {
  const normalized = normalizeCourseShareToken(token);
  if (!normalized) return null;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_shared_course`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_share_token: normalized }),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return parseCourseShareDto(await response.json());
  } catch {
    return null;
  }
}
