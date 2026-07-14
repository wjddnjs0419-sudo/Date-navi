import { z } from 'zod';

const idOnlyCourseResultParamsSchema = z.object({
  requestId: z.string().trim().min(1).max(120),
  sessionId: z.string().trim().min(1).max(120),
}).strict();

export type StructuredCourseResultParams = z.infer<typeof idOnlyCourseResultParamsSchema>;

export function buildStructuredGeneratingParams(requestId: string): { requestId: string } {
  return { requestId: z.string().trim().min(1).max(120).parse(requestId) };
}

export function buildStructuredCourseResultParams(
  requestId: string,
  sessionId: string,
): StructuredCourseResultParams {
  return idOnlyCourseResultParamsSchema.parse({ requestId, sessionId });
}

export function parseStructuredCourseResultParams(input: unknown): StructuredCourseResultParams {
  return idOnlyCourseResultParamsSchema.parse(input);
}

type LegacyResultParams = {
  mode: string;
  input: string;
  cards: string;
  sessionId?: string;
};

export function buildLegacyResultParams(params: LegacyResultParams): LegacyResultParams {
  return { ...params };
}
