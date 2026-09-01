import {
  handleLocationAutocomplete,
  LocationAutocompleteProviderError,
  type LocationDocument,
  type LocationSearchFetcher,
} from '../_shared/location-autocomplete-handler.ts';
import { rankLocationDocuments } from '../../../shared/recommendation/location-autocomplete.ts';
import {
  consumeWebDemoLocationQuota,
  WebDemoRateLimitError,
  type WebDemoRateLimitRpcClient,
} from '../_shared/web-demo-rate-limit.ts';
import { hasValidWebDemoToken, isWebDemoHash } from '../_shared/web-demo-auth.ts';
import { allowedWebDemoOrigin } from '../_shared/web-demo-cors.ts';

export type { LocationDocument } from '../_shared/location-autocomplete-handler.ts';

type WebDemoLocationQuota = (input: { visitorHash: string; networkHash: string }) => Promise<void>;
type WebDemoLocationSearch = (query: string) => Promise<LocationDocument[]>;

export type LocationAutocompleteDemoDependencies = {
  expectedToken: string;
  quota: WebDemoLocationQuota;
  search: WebDemoLocationSearch;
  allowedOrigin?: string;
};

const corsHeaders = (request: Request, allowedOrigin?: string): Record<string, string> => {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'content-type, x-web-demo-internal-token, x-web-demo-visitor, x-web-demo-network',
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

function quotaResponse(request: Request, error: WebDemoRateLimitError, allowedOrigin?: string): Response {
  const retryAfter = error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds };
  const resetsAt = error.resetsAt === undefined ? {} : { resetsAt: error.resetsAt };
  return json(request, { error: { code: error.code, ...retryAfter, ...resetsAt } }, 429, allowedOrigin);
}

function parseBody(raw: string): { query: string } | { tooLarge: true } | null {
  if (new TextEncoder().encode(raw).byteLength > 1024) return { tooLarge: true };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== 'query') || typeof body.query !== 'string') return null;
  const query = body.query.trim();
  const length = Array.from(query).length;
  if (length < 2 || length > 80) return null;
  return { query };
}

export function createLocationAutocompleteDemoHandler(
  dependencies: LocationAutocompleteDemoDependencies,
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

    const body = parseBody(await request.text());
    if (!body) return json(request, { error: 'Invalid request' }, 400, allowedOrigin);
    if ('tooLarge' in body) return json(request, { error: 'Request too large' }, 413, allowedOrigin);

    try {
      await dependencies.quota({ visitorHash, networkHash });
      const documents = rankLocationDocuments(body.query, await dependencies.search(body.query));
      return json(request, { documents }, 200, allowedOrigin);
    } catch (error) {
      if (error instanceof WebDemoRateLimitError) {
        if (error.code === 'WEB_DEMO_DAILY_LIMIT'
          || error.code === 'WEB_DEMO_NETWORK_LIMIT'
          || error.code === 'WEB_DEMO_GLOBAL_LIMIT') {
          return quotaResponse(request, error, allowedOrigin);
        }
        return json(request, { error: { code: error.code } }, 503, allowedOrigin);
      }
      if (error instanceof LocationAutocompleteProviderError) {
        return json(request, { error: 'Location search failed' }, 502, allowedOrigin);
      }
      console.error('location-autocomplete-demo error', error);
      return json(request, { error: 'Internal error' }, 500, allowedOrigin);
    }
  };
}

type DenoLike = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const deno = (globalThis as typeof globalThis & { Deno?: DenoLike }).Deno;
if (deno) {
  deno.serve(async (request) => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const admin = createClient(
      deno.env.get('SUPABASE_URL') ?? '',
      deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    ) as WebDemoRateLimitRpcClient;
    const expectedToken = deno.env.get('WEB_DEMO_INTERNAL_TOKEN') ?? '';
    const allowedOrigin = deno.env.get('WEB_DEMO_SITE_ORIGIN') ?? deno.env.get('NEXT_PUBLIC_SITE_ORIGIN');
    const dependencies: LocationAutocompleteDemoDependencies = {
      expectedToken,
      allowedOrigin,
      quota: (input) => consumeWebDemoLocationQuota(admin, input),
      search: (query) => handleLocationAutocomplete(
        query,
        fetch as LocationSearchFetcher,
        deno.env.get('KAKAO_REST_API_KEY') ?? '',
      ),
    };
    return createLocationAutocompleteDemoHandler(dependencies)(request);
  });
}
