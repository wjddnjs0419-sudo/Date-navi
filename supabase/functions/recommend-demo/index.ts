import {
  toRecommendationRequest,
  webDemoRecommendationRequestSchema,
  type WebDemoRecommendationRequest,
} from '../../../shared/recommendation/web-demo-contracts.ts';
import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import {
  handleRecommendDate,
  type RecommendDateHandlerResult,
} from '../_shared/recommend-date-handler.ts';
import {
  acquireWebDemoPermit,
  finishWebDemoPermit,
  WebDemoRateLimitError,
  type WebDemoPermit,
  type WebDemoPermitInput,
  type WebDemoRateLimitRpcClient,
} from '../_shared/web-demo-rate-limit.ts';
import { hasValidWebDemoToken, isWebDemoHash } from '../_shared/web-demo-auth.ts';
import { invokeGenerateAiSelection } from '../_shared/recommend-date-downstream.ts';
import { createRecommendationRuntime, runtimeOptionsFromEnv } from '../_shared/recommend-date-runtime.ts';
import { allowedWebDemoOrigin } from '../_shared/web-demo-cors.ts';

export type RecommendDemoRecommendationResult = RecommendDateHandlerResult;

type RecommendDemoRecommendation = (input: {
  authorization: string;
  request: RecommendationRequest;
}) => Promise<RecommendDemoRecommendationResult>;

export type RecommendDemoDependencies = {
  expectedToken: string;
  acquire: (input: WebDemoPermitInput) => Promise<WebDemoPermit>;
  finish: (permitId: string, ownerToken: string, outcome: 'success' | 'failure') => Promise<void>;
  recommend: RecommendDemoRecommendation;
  requestIdFactory?: () => string;
  allowedOrigin?: string;
};

const MAX_BODY_BYTES = 32 * 1024;

const corsHeaders = (request: Request, allowedOrigin?: string): Record<string, string> => {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'content-type, x-web-demo-attempt, x-web-demo-internal-token, x-web-demo-visitor, x-web-demo-network',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (allowedWebDemoOrigin(origin, allowedOrigin)) headers['Access-Control-Allow-Origin'] = origin!;
  return headers;
};

const json = (request: Request, body: unknown, status = 200, allowedOrigin?: string) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(request, allowedOrigin), 'Content-Type': 'application/json' },
});

function errorResponse(request: Request, error: WebDemoRateLimitError, allowedOrigin?: string): Response {
  if (error.code === 'WEB_DEMO_DAILY_LIMIT'
    || error.code === 'WEB_DEMO_NETWORK_LIMIT'
    || error.code === 'WEB_DEMO_GLOBAL_LIMIT') {
    return json(request, {
      error: {
        code: error.code,
        ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }),
        ...(error.resetsAt === undefined ? {} : { resetsAt: error.resetsAt }),
      },
    }, 429, allowedOrigin);
  }
  if (error.code === 'WEB_DEMO_ALREADY_RUNNING') {
    return json(request, { error: { code: error.code } }, 409, allowedOrigin);
  }
  return json(request, { error: { code: error.code } }, error.code === 'WEB_DEMO_INVALID_INPUT' ? 400 : 503, allowedOrigin);
}

async function parseWebRequest(request: Request): Promise<
  { kind: 'ok'; value: WebDemoRecommendationRequest; attempt: 0 | 1 }
  | { kind: 'too_large' }
  | { kind: 'invalid' }
> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return { kind: 'too_large' };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'invalid' };
    const body = value as Record<string, unknown>;
    const attempt = body.attempt === undefined ? 0 : body.attempt === 0 || body.attempt === 1 ? body.attempt : undefined;
    if (attempt === undefined) return { kind: 'invalid' };
    const { attempt: _attempt, ...webRequest } = body;
    const parsed = webDemoRecommendationRequestSchema.safeParse(webRequest);
    return parsed.success ? { kind: 'ok', value: parsed.data, attempt } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

function responseWithRetryContext(
  result: RecommendDemoRecommendationResult,
  attempt: 0 | 1,
): RecommendDemoRecommendationResult {
  if (result.status !== 200 || !result.body || typeof result.body !== 'object' || Array.isArray(result.body)) return result;
  return {
    ...result,
    body: { ...(result.body as Record<string, unknown>), retryContext: { attempt } },
  };
}

export function createRecommendDemoHandler(
  dependencies: RecommendDemoDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const allowedOrigin = dependencies.allowedOrigin;
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, allowedOrigin) });
    }
    if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405, allowedOrigin);

    if (!hasValidWebDemoToken(
      request.headers.get('x-web-demo-internal-token'),
      dependencies.expectedToken,
    )) return json(request, { error: 'Unauthorized' }, 401, allowedOrigin);

    const visitorHash = request.headers.get('x-web-demo-visitor');
    const networkHash = request.headers.get('x-web-demo-network');
    if (!isWebDemoHash(visitorHash) || !isWebDemoHash(networkHash)) {
      return json(request, { error: 'Unauthorized' }, 401, allowedOrigin);
    }

    const parsed = await parseWebRequest(request);
    if (parsed.kind === 'too_large') return json(request, { error: 'Request too large' }, 413, allowedOrigin);
    if (parsed.kind === 'invalid') return json(request, { error: 'Invalid request' }, 400, allowedOrigin);

    let normalized: RecommendationRequest;
    try {
      normalized = toRecommendationRequest(parsed.value, dependencies.requestIdFactory);
    } catch {
      return json(request, { error: 'Invalid request' }, 400, allowedOrigin);
    }

    let permit: WebDemoPermit;
    try {
      permit = await dependencies.acquire({ visitorHash, networkHash, requestId: normalized.requestId, attempt: parsed.attempt });
    } catch (error) {
      if (error instanceof WebDemoRateLimitError) return errorResponse(request, error, allowedOrigin);
      console.error('recommend-demo permit acquire failed', error);
      return json(request, { error: { code: 'WEB_DEMO_LIMIT_UNAVAILABLE' } }, 503, allowedOrigin);
    }

    const authorization = `Bearer web-demo:${visitorHash}`;
    let result: RecommendDemoRecommendationResult = { status: 500, body: { error: { code: 'INTERNAL_ERROR' } } };
    try {
      result = responseWithRetryContext(await dependencies.recommend({ authorization, request: normalized }), parsed.attempt);
    } catch (error) {
      console.error('recommend-demo recommendation failed', error);
    } finally {
      try {
        await dependencies.finish(permit.permitId, permit.ownerToken, result.status < 400 ? 'success' : 'failure');
      } catch (error) {
        console.error('recommend-demo permit finish failed', error);
      }
    }
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { ...corsHeaders(request, allowedOrigin), 'Content-Type': 'application/json' },
    });
  };
}

type DenoLike = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const deno = (globalThis as typeof globalThis & { Deno?: DenoLike }).Deno;
if (deno) {
  deno.serve(async (request) => {
    const { createClient } = await import('npm:@supabase/supabase-js@2.106.1');
    const rateLimitClient = createClient(
      deno.env.get('SUPABASE_URL') ?? '',
      deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    ) as WebDemoRateLimitRpcClient;
    const expectedToken = deno.env.get('WEB_DEMO_INTERNAL_TOKEN') ?? '';
    const visitorHash = request.headers.get('x-web-demo-visitor') ?? '';
    const internalToken = deno.env.get('INTERNAL_AI_TOKEN') ?? '';
    const configuredGlobalLimit = Number.parseInt(deno.env.get('WEB_DEMO_GLOBAL_DAILY_LIMIT') ?? '500', 10);
    const globalLimit = Number.isInteger(configuredGlobalLimit) && configuredGlobalLimit > 0 ? configuredGlobalLimit : 500;
    const runtime = createRecommendationRuntime(runtimeOptionsFromEnv({
      mode: 'web-demo',
      createClient,
      env: deno.env,
      authenticate: async (authorization) => authorization === `Bearer web-demo:${visitorHash}`
        ? { id: `web-demo:${visitorHash}` }
        : null,
      generateSelection: (input) => invokeGenerateAiSelection({
        ...input,
        supabaseUrl: deno.env.get('SUPABASE_URL') ?? '',
        anonKey: deno.env.get('SUPABASE_ANON_KEY') ?? '',
        internalAiToken: internalToken,
        aiPrincipal: 'web-demo',
      }),
    }));
    return createRecommendDemoHandler({
      expectedToken,
      allowedOrigin: deno.env.get('WEB_DEMO_SITE_ORIGIN') ?? deno.env.get('NEXT_PUBLIC_SITE_ORIGIN'),
      acquire: (input) => acquireWebDemoPermit(rateLimitClient, { ...input, globalLimit }),
      finish: (permitId, ownerToken, outcome) => finishWebDemoPermit(rateLimitClient, permitId, ownerToken, outcome),
      recommend: ({ authorization, request: normalized }) => handleRecommendDate({
        method: request.method,
        authorization,
        body: normalized,
      }, runtime),
    })(request);
  });
}
