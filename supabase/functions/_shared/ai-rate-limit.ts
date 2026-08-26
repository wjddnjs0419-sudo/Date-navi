type RpcResult = { data: unknown; error: unknown };

export type RateLimitRpcClient = {
  rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<RpcResult>;
};

export type LockResult =
  | { acquired: true }
  | { acquired: false; retryAfterSeconds: number };

export type QuotaResult =
  | { allowed: true; consumptionId?: number }
  | { allowed: false; limitType: 'burst'; retryAfterSeconds: number }
  | { allowed: false; limitType: 'daily'; resetsAt: string };

type CourseGenerationInput = { userId: string; requestId?: string; now?: string };
type LockInput = CourseGenerationInput & { requestId: string };
type RateLimitEvent = 'lock_conflict' | 'burst_rejected' | 'daily_rejected';

function throwRpcError(error: unknown): never {
  throw error instanceof Error ? error : new Error(String(error));
}

function firstRow(data: unknown): Record<string, unknown> {
  if (!Array.isArray(data) || data.length !== 1 || typeof data[0] !== 'object' || data[0] === null) {
    throw new Error('AI rate-limit RPC returned malformed data');
  }
  return data[0] as Record<string, unknown>;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('AI rate-limit RPC returned an invalid retry value');
  }
  return value;
}

function isoTimestamp(value: unknown): string {
  if (typeof value !== 'string') throw new Error('AI rate-limit RPC returned an invalid reset timestamp');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  const year = match ? Number(match[1]) : Number.NaN;
  const month = match ? Number(match[2]) : Number.NaN;
  const day = match ? Number(match[3]) : Number.NaN;
  const hour = match ? Number(match[4]) : Number.NaN;
  const minute = match ? Number(match[5]) : Number.NaN;
  const second = match ? Number(match[6]) : Number.NaN;
  const daysInMonth = Number.isNaN(year) || Number.isNaN(month) ? Number.NaN : new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!match || month < 1 || month > 12 || day < 1 || day > daysInMonth
    || hour > 23 || minute > 59 || second > 59 || Number.isNaN(Date.parse(value))) {
    throw new Error('AI rate-limit RPC returned an invalid reset timestamp');
  }
  return value;
}

export async function acquireCourseGenerationLock(client: RateLimitRpcClient, input: LockInput): Promise<LockResult> {
  const { data, error } = await client.rpc('acquire_ai_request_lock', {
    p_user_id: input.userId,
    p_action: 'course_generate',
    p_request_id: input.requestId,
    ...(input.now ? { p_now: input.now } : {}),
  });
  if (error) throwRpcError(error);
  const row = firstRow(data);
  if (row.acquired === true) return { acquired: true };
  if (row.acquired === false) return { acquired: false, retryAfterSeconds: positiveInteger(row.retry_after_seconds) };
  throw new Error('AI rate-limit RPC returned an invalid lock result');
}

export async function releaseCourseGenerationLock(client: RateLimitRpcClient, input: LockInput): Promise<void> {
  const { error } = await client.rpc('release_ai_request_lock', {
    p_user_id: input.userId,
    p_action: 'course_generate',
    p_request_id: input.requestId,
  });
  if (error) throwRpcError(error);
}

export async function consumeCourseGenerationQuota(client: RateLimitRpcClient, input: CourseGenerationInput): Promise<QuotaResult> {
  const parameters: Record<string, unknown> = {
    p_user_id: input.userId,
    p_action: 'course_generate',
    ...(input.requestId ? { p_request_id: input.requestId } : {}),
    ...(input.now ? { p_now: input.now } : {}),
  };
  const { data, error } = await client.rpc('consume_ai_quota', {
    ...parameters,
  });
  if (error) throwRpcError(error);
  const row = firstRow(data);
  if (row.allowed === true) {
    if (row.consumption_id === undefined || row.consumption_id === null) return { allowed: true };
    if (typeof row.consumption_id !== 'number' || !Number.isInteger(row.consumption_id) || row.consumption_id < 1) {
      throw new Error('AI rate-limit RPC returned an invalid consumption id');
    }
    return { allowed: true, consumptionId: row.consumption_id };
  }
  if (row.allowed !== false) throw new Error('AI rate-limit RPC returned an invalid quota result');
  if (row.limit_type === 'burst') {
    return { allowed: false, limitType: 'burst', retryAfterSeconds: positiveInteger(row.retry_after_seconds) };
  }
  if (row.limit_type === 'daily') {
    return { allowed: false, limitType: 'daily', resetsAt: isoTimestamp(row.resets_at) };
  }
  throw new Error('AI rate-limit RPC returned an unknown limit type');
}

export async function releaseCourseGenerationQuota(
  client: RateLimitRpcClient,
  input: { userId: string; consumptionId: number },
): Promise<void> {
  const { error } = await client.rpc('release_ai_quota', {
    p_user_id: input.userId,
    p_action: 'course_generate',
    p_consumption_id: input.consumptionId,
  });
  if (error) throwRpcError(error);
}

export async function recordAiRateLimitEvent(
  client: RateLimitRpcClient,
  input: { userId: string; eventType: RateLimitEvent },
): Promise<void> {
  const { error } = await client.rpc('record_ai_rate_limit_event', {
    p_user_id: input.userId,
    p_action: 'course_generate',
    p_event_type: input.eventType,
  });
  if (error) throwRpcError(error);
}
