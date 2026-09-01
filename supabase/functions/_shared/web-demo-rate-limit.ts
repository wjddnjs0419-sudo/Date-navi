export type WebDemoRateLimitRpcResult = {
  data: unknown;
  error: unknown;
};

export type WebDemoRateLimitRpcClient = {
  rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<WebDemoRateLimitRpcResult>;
};

export type WebDemoPermit = {
  permitId: string;
  ownerToken: string;
};

export type WebDemoPermitInput = {
  visitorHash: string;
  networkHash: string;
  requestId: string;
  attempt?: 0 | 1;
  globalLimit?: number;
  now?: string;
};

export type WebDemoLocationQuotaInput = {
  visitorHash: string;
  networkHash: string;
  globalLimit?: number;
  now?: string;
};

export type WebDemoRateLimitErrorCode =
  | 'WEB_DEMO_DAILY_LIMIT'
  | 'WEB_DEMO_NETWORK_LIMIT'
  | 'WEB_DEMO_GLOBAL_LIMIT'
  | 'WEB_DEMO_ALREADY_RUNNING'
  | 'WEB_DEMO_LIMIT_UNAVAILABLE'
  | 'WEB_DEMO_INVALID_INPUT';

export class WebDemoRateLimitError extends Error {
  constructor(
    public readonly code: WebDemoRateLimitErrorCode,
    public readonly retryAfterSeconds?: number,
    public readonly resetsAt?: string,
  ) {
    super(code);
    this.name = 'WebDemoRateLimitError';
  }
}

export const WEB_DEMO_LIMITS = {
  visitorPerDay: 3,
  networkPerDay: 30,
  globalDefaultPerDay: 500,
  staleAfterSeconds: 120,
} as const;

export const WEB_DEMO_HASH_PATTERN = /^[a-f0-9]{64}$/;

function invalidInput(): never {
  throw new WebDemoRateLimitError('WEB_DEMO_INVALID_INPUT');
}

function assertHash(value: string): void {
  if (!WEB_DEMO_HASH_PATTERN.test(value)) invalidInput();
}

function assertRequestId(value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 120) invalidInput();
}

function firstRow(data: unknown): Record<string, unknown> {
  const row = Array.isArray(data) ? data.length === 1 ? data[0] : undefined : data;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new WebDemoRateLimitError('WEB_DEMO_LIMIT_UNAVAILABLE');
  }
  return row as Record<string, unknown>;
}

function rpcFailure(error: unknown): never {
  // Keep the original error out of the public message: some Supabase errors
  // contain query parameters or other sensitive request context.
  void error;
  throw new WebDemoRateLimitError('WEB_DEMO_LIMIT_UNAVAILABLE');
}

function positiveLimit(value: number | undefined): number {
  const limit = value ?? WEB_DEMO_LIMITS.globalDefaultPerDay;
  if (!Number.isInteger(limit) || limit < 1) invalidInput();
  return limit;
}

function parsePermit(row: Record<string, unknown>): WebDemoPermit {
  if (row.allowed !== true) {
    const limitType = row.limit_type;
    if (limitType === 'visitor' || limitType === 'daily') {
      throw new WebDemoRateLimitError('WEB_DEMO_DAILY_LIMIT', numeric(row.retry_after_seconds), stringValue(row.resets_at));
    }
    if (limitType === 'network') throw new WebDemoRateLimitError('WEB_DEMO_NETWORK_LIMIT', numeric(row.retry_after_seconds), stringValue(row.resets_at));
    if (limitType === 'global') throw new WebDemoRateLimitError('WEB_DEMO_GLOBAL_LIMIT', numeric(row.retry_after_seconds), stringValue(row.resets_at));
    if (limitType === 'already_running') throw new WebDemoRateLimitError('WEB_DEMO_ALREADY_RUNNING', numeric(row.retry_after_seconds), stringValue(row.resets_at));
    throw new WebDemoRateLimitError('WEB_DEMO_LIMIT_UNAVAILABLE');
  }
  if (typeof row.permit_id !== 'string' || row.permit_id.length === 0
    || typeof row.owner_token !== 'string' || row.owner_token.length === 0) {
    throw new WebDemoRateLimitError('WEB_DEMO_LIMIT_UNAVAILABLE');
  }
  return { permitId: row.permit_id, ownerToken: row.owner_token };
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function acquireWebDemoPermit(
  client: WebDemoRateLimitRpcClient,
  input: WebDemoPermitInput,
): Promise<WebDemoPermit> {
  assertHash(input.visitorHash);
  assertHash(input.networkHash);
  assertRequestId(input.requestId);
  if (input.attempt !== undefined && input.attempt !== 0 && input.attempt !== 1) invalidInput();
  const attempt = input.attempt ?? 0;
  const globalLimit = positiveLimit(input.globalLimit);
  const { data, error } = await client.rpc('acquire_web_demo_permit', {
    p_visitor_hash: input.visitorHash,
    p_network_hash: input.networkHash,
    p_request_id: input.requestId,
    p_attempt: attempt,
    p_count_visitor: attempt === 0,
    p_count_network: attempt === 0,
    p_count_global: true,
    p_visitor_limit: WEB_DEMO_LIMITS.visitorPerDay,
    p_network_limit: WEB_DEMO_LIMITS.networkPerDay,
    p_global_limit: globalLimit,
    p_stale_after_seconds: WEB_DEMO_LIMITS.staleAfterSeconds,
    ...(input.now ? { p_now: input.now } : {}),
  });
  if (error) rpcFailure(error);
  return parsePermit(firstRow(data));
}

export async function finishWebDemoPermit(
  client: WebDemoRateLimitRpcClient,
  permitId: string,
  ownerToken: string,
  outcome: 'success' | 'failure' = 'success',
): Promise<void> {
  if (!permitId || !ownerToken || (outcome !== 'success' && outcome !== 'failure')) invalidInput();
  const { error } = await client.rpc('finish_web_demo_permit', {
    p_permit_id: permitId,
    p_owner_token: ownerToken,
    p_outcome: outcome,
  });
  if (error) rpcFailure(error);
}

export async function consumeWebDemoLocationQuota(
  client: WebDemoRateLimitRpcClient,
  input: WebDemoLocationQuotaInput,
): Promise<void> {
  assertHash(input.visitorHash);
  assertHash(input.networkHash);
  const globalLimit = positiveLimit(input.globalLimit ?? 3000);
  const { data, error } = await client.rpc('consume_web_demo_location_quota', {
    p_visitor_hash: input.visitorHash,
    p_network_hash: input.networkHash,
    p_visitor_limit: 60,
    p_network_limit: 300,
    p_global_limit: globalLimit,
    ...(input.now ? { p_now: input.now } : {}),
  });
  if (error) rpcFailure(error);
  const row = firstRow(data);
  if (row.allowed === true) return;
  const limitType = row.limit_type;
  const details = [numeric(row.retry_after_seconds), stringValue(row.resets_at)] as const;
  if (limitType === 'visitor') throw new WebDemoRateLimitError('WEB_DEMO_DAILY_LIMIT', ...details);
  if (limitType === 'network') throw new WebDemoRateLimitError('WEB_DEMO_NETWORK_LIMIT', ...details);
  if (limitType === 'global') throw new WebDemoRateLimitError('WEB_DEMO_GLOBAL_LIMIT', ...details);
  throw new WebDemoRateLimitError('WEB_DEMO_LIMIT_UNAVAILABLE');
}

export function createWebDemoRateLimitAdapter(client: WebDemoRateLimitRpcClient, globalLimit?: number) {
  return {
    acquireWebDemoPermit: (input: Omit<WebDemoPermitInput, 'globalLimit'>) => (
      acquireWebDemoPermit(client, { ...input, ...(globalLimit === undefined ? {} : { globalLimit }) })
    ),
    finishWebDemoPermit: (
      permitId: string,
      ownerToken: string,
      outcome: 'success' | 'failure' = 'success',
    ) => finishWebDemoPermit(client, permitId, ownerToken, outcome),
    consumeWebDemoLocationQuota: (input: Omit<WebDemoLocationQuotaInput, 'globalLimit'>) => (
      consumeWebDemoLocationQuota(client, { ...input, ...(globalLimit === undefined ? {} : { globalLimit }) })
    ),
  };
}
