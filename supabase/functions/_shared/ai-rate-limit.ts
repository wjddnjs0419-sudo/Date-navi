type RpcResult = { data: unknown; error: unknown };

export type RateLimitRpcClient = {
  rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<RpcResult>;
};

export type LockResult =
  | { acquired: true }
  | { acquired: false; retryAfterSeconds: number };

export type QuotaResult =
  | { allowed: true }
  | { allowed: false; limitType: 'burst'; retryAfterSeconds: number }
  | { allowed: false; limitType: 'daily'; resetsAt: string };

type CourseGenerationInput = { userId: string; now?: string };
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
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
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
  const { data, error } = await client.rpc('consume_ai_quota', {
    p_user_id: input.userId,
    p_action: 'course_generate',
    ...(input.now ? { p_now: input.now } : {}),
  });
  if (error) throwRpcError(error);
  const row = firstRow(data);
  if (row.allowed === true) return { allowed: true };
  if (row.allowed !== false) throw new Error('AI rate-limit RPC returned an invalid quota result');
  if (row.limit_type === 'burst') {
    return { allowed: false, limitType: 'burst', retryAfterSeconds: positiveInteger(row.retry_after_seconds) };
  }
  if (row.limit_type === 'daily') {
    return { allowed: false, limitType: 'daily', resetsAt: isoTimestamp(row.resets_at) };
  }
  throw new Error('AI rate-limit RPC returned an unknown limit type');
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
