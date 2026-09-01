import {
  createRecommendDemoHandler,
  type RecommendDemoRecommendationResult,
} from './index';
import { WebDemoRateLimitError } from '../_shared/web-demo-rate-limit';

const visitorHash = 'a'.repeat(64);
const networkHash = 'b'.repeat(64);

const input = {
  courseSteps: [
    { id: 'meal', category: 'meal', intentTags: ['한식'] },
    { id: 'cafe', category: 'cafe' },
  ],
  location: {
    source: 'kakao' as const,
    label: '강남역',
    latitude: 37.4979,
    longitude: 127.0276,
    kakaoPlaceId: '123',
  },
  meetingTime: '2026-09-01T19:00:00+09:00',
  moods: ['대화'],
  language: 'ko' as const,
};

const request = (body: unknown, overrides: Record<string, string> = {}) => new Request(
  'https://supabase.example/functions/v1/recommend-demo',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-web-demo-internal-token': 'internal-secret',
      'x-web-demo-visitor': visitorHash,
      'x-web-demo-network': networkHash,
      ...overrides,
    },
    body: JSON.stringify(body),
  },
);

const recommendation = (overrides: Partial<RecommendDemoRecommendationResult> = {}): RecommendDemoRecommendationResult => ({
  status: 200,
  body: {
    requestId: 'request-1',
    course: {
      requestId: 'request-1',
      sessionId: 'session-1',
      steps: [],
      relaxedConstraints: [],
      generatedAt: '2026-09-01T10:00:00.000Z',
    },
    cards: [],
    retryContext: { attempt: 0 },
  },
  ...overrides,
});

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    expectedToken: 'internal-secret',
    requestIdFactory: () => 'request-1',
    acquire: jest.fn(async () => ({ permitId: 'permit-1', ownerToken: 'owner-1' })),
    finish: jest.fn(async () => undefined),
    recommend: jest.fn(async () => recommendation()),
    ...overrides,
  } as Parameters<typeof createRecommendDemoHandler>[0];
}

describe('loginless recommend-demo', () => {
  it.each([
    ['missing token', { 'x-web-demo-internal-token': '' }],
    ['wrong token', { 'x-web-demo-internal-token': 'wrong' }],
    ['invalid visitor hash', { 'x-web-demo-visitor': 'raw-ip' }],
    ['invalid network hash', { 'x-web-demo-network': 'raw-ip' }],
  ])('rejects %s before quota or recommendation', async (_label, headers) => {
    const deps = dependencies();
    const handler = createRecommendDemoHandler(deps);

    await expect(handler(request(input, headers))).resolves.toMatchObject({ status: 401 });
    expect(deps.acquire).not.toHaveBeenCalled();
    expect(deps.recommend).not.toHaveBeenCalled();
  });

  it('rejects invalid web input without invoking quota', async () => {
    const deps = dependencies();
    const handler = createRecommendDemoHandler(deps);

    await expect(handler(request({ ...input, extra: true }))).resolves.toMatchObject({ status: 400 });
    await expect(handler(request({ ...input, courseSteps: Array.from({ length: 5 }, (_, index) => ({ id: String(index), category: 'meal' })) })))
      .resolves.toMatchObject({ status: 400 });
    await expect(handler(request({ ...input, attempt: 2 }))).resolves.toMatchObject({ status: 400 });
    expect(deps.acquire).not.toHaveBeenCalled();
  });

  it('maps anonymous permit exhaustion to 429', async () => {
    const deps = dependencies({
      acquire: jest.fn(async () => {
        throw new WebDemoRateLimitError('WEB_DEMO_DAILY_LIMIT', 30, '2026-09-02T00:00:00.000Z');
      }),
    });
    const result = await createRecommendDemoHandler(deps)(request(input));

    expect(result.status).toBe(429);
    expect(await result.json()).toMatchObject({
      error: { code: 'WEB_DEMO_DAILY_LIMIT', retryAfterSeconds: 30 },
    });
    expect(deps.recommend).not.toHaveBeenCalled();
  });

  it('adapts the web request, counts the initial permit, and returns retry context', async () => {
    const deps = dependencies();
    const result = await createRecommendDemoHandler(deps)(request(input));

    expect(result.status).toBe(200);
    expect(deps.acquire).toHaveBeenCalledWith({
      visitorHash,
      networkHash,
      requestId: 'request-1',
      attempt: 0,
    });
    expect(deps.recommend).toHaveBeenCalledWith(expect.objectContaining({
      authorization: `Bearer web-demo:${visitorHash}`,
      request: expect.objectContaining({
        requestId: 'request-1',
        mode: 'course',
        location: expect.objectContaining({ kind: 'place' }),
      }),
    }));
    expect(deps.finish).toHaveBeenCalledWith('permit-1', 'owner-1', 'success');
    expect(await result.json()).toMatchObject({ retryContext: { attempt: 0 } });
  });

  it('generates a request ID when the production adapter does not inject one', async () => {
    const deps = dependencies();
    const handler = createRecommendDemoHandler(deps);
    const result = await handler(request(input));

    expect(result.status).toBe(200);
    expect(deps.acquire).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String) }));
  });

  it('attempt 1 is forwarded as a retry and always releases the permit', async () => {
    const deps = dependencies({
      requestIdFactory: () => 'request-retry',
      recommend: jest.fn(async () => ({ status: 504, body: { error: { code: 'PLACE_SEARCH_TIMEOUT' } } })),
    });
    const result = await createRecommendDemoHandler(deps)(request({ ...input, attempt: 1 }));

    expect(result.status).toBe(504);
    expect(deps.acquire).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }));
    expect(deps.finish).toHaveBeenCalledWith('permit-1', 'owner-1', 'failure');
  });

  it('only reflects the configured web origin in CORS', async () => {
    const deps = dependencies({ allowedOrigin: 'https://date-navi.vercel.app' });
    const handler = createRecommendDemoHandler(deps);

    const allowed = await handler(new Request(request(input), { headers: { ...Object.fromEntries(request(input).headers), Origin: 'https://date-navi.vercel.app' } }));
    const unrelated = await handler(new Request(request(input), { headers: { ...Object.fromEntries(request(input).headers), Origin: 'https://evil.example' } }));

    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://date-navi.vercel.app');
    expect(unrelated.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('allows the production origin and a matching Vercel preview host', async () => {
    const deps = dependencies();
    const handler = createRecommendDemoHandler(deps);
    const makeOriginRequest = (Origin: string) => new Request(request(input), { headers: {
      ...Object.fromEntries(request(input).headers),
      Origin,
    } });

    const production = await handler(makeOriginRequest('https://date-navi.vercel.app'));
    expect(production.headers.get('Access-Control-Allow-Origin')).toBe('https://date-navi.vercel.app');
    const preview = await handler(makeOriginRequest('https://date-navi-web-feature-abc.vercel.app'));
    expect(preview.headers.get('Access-Control-Allow-Origin')).toBe('https://date-navi-web-feature-abc.vercel.app');
  });
});
