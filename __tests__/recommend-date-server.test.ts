import { createRecommendationError } from '../shared/recommendation/errors';
import type { RecommendationRequest } from '../shared/recommendation/schemas';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  handleRecommendDate,
  type RecommendDateDependencies,
} from '../supabase/functions/_shared/recommend-date-handler';
import { RecommendDateDownstreamTimeoutError } from '../supabase/functions/_shared/recommend-date-downstream';
import {
  buildRecommendationPrompt,
  RECOMMEND_DATE_PROMPT_VERSION,
} from '../supabase/functions/_shared/recommendation-prompt';

const request = (language: 'ko' | 'en' = 'ko'): RecommendationRequest => ({
  requestId: `request-${language}`,
  mode: 'course',
  language,
  location: {
    source: 'kakao',
    kakaoPlaceId: 'origin-001',
    label: language === 'ko' ? '서울숲' : 'Seoul Forest',
    address: '서울 성동구',
    latitude: 37.5444,
    longitude: 127.0374,
    kind: 'landmark',
  },
  courseSteps: [
    { id: 'step-meal', category: 'meal', label: language === 'ko' ? '식사' : 'Meal' },
    { id: 'step-cafe', category: 'cafe', label: language === 'ko' ? '카페' : 'Cafe' },
  ],
  maxWalkingMinutes: 10,
  totalBudgetKRW: 70000,
  moods: ['romantic', 'quiet'],
  duration: 'half_day',
  additionalRequest: language === 'ko' ? '야경을 보고 싶어' : 'I would like a night view',
  parsedPreferences: { quietPreferred: true, photoFriendlyPreferred: true },
});

const candidate = (candidateId: string, kakaoPlaceId: string, categoryGroupCode: string, longitude: number) => ({
  candidateId,
  kakaoPlaceId,
  name: `Place ${kakaoPlaceId}`,
  categoryGroupCode,
  categoryGroupName: categoryGroupCode === 'FD6' ? '음식점' : '카페',
  categoryName: categoryGroupCode === 'FD6' ? '음식점 > 한식' : '카페',
  address: '서울 성동구',
  roadAddress: '서울 성동구 왕십리로',
  latitude: 37.5444,
  longitude,
  mapUrl: `https://place.map.kakao.com/${kakaoPlaceId}`,
  distanceFromSearchCenterMeters: 100,
  matchedSearchEvidence: [{ queryId: candidateId, source: 'category' as const, page: 1, categoryCode: categoryGroupCode }],
  score: 60,
  scoreBreakdown: { intent: 40, distance: 20, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
});

const searchResult = {
  candidates: [
    candidate('meal-candidate', 'meal-place', 'FD6', 127.0374),
    candidate('cafe-candidate', 'cafe-place', 'CE7', 127.0380),
  ],
  recallByCategory: { meal: 1, cafe: 1 },
  searchMetadata: {
    requestCount: 2,
    outcomes: [],
    successfulCount: 2,
    failedCount: 0,
    rateLimitedCount: 0,
    timeoutCount: 0,
    allSearchesFailed: false,
  },
};

const validSelection = {
  steps: [
    { stepId: 'step-meal', candidateId: 'meal-candidate' },
    { stepId: 'step-cafe', candidateId: 'cafe-candidate' },
  ],
};

function dependencies(overrides: Partial<RecommendDateDependencies> = {}): RecommendDateDependencies {
  return {
    authenticate: jest.fn(async () => ({ id: 'user-001' })),
    searchCandidates: jest.fn(async () => searchResult),
    generateSelection: jest.fn(async () => validSelection),
    stageAttestation: jest.fn(async () => undefined),
    now: jest.fn(() => '2026-07-14T00:00:00.000Z'),
    ...overrides,
  };
}

describe('recommend-date server prompt', () => {
  it('stages only the server-validated response for the authenticated owner before returning it', async () => {
    const stageAttestation = jest.fn(async () => undefined);
    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer token', body: request() }, dependencies({ stageAttestation }));

    expect(result.status).toBe(200);
    expect(stageAttestation).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: 'user-001',
      request: expect.objectContaining({ requestId: 'request-ko' }),
      response: expect.objectContaining({ requestId: 'request-ko' }),
    }));
  });

  it('reports the attestation boundary when staging a valid course response fails', async () => {
    const onCourseValidationFailure = jest.fn();
    const result = await handleRecommendDate(
      { method: 'POST', authorization: 'Bearer token', body: request() },
      dependencies({
        stageAttestation: jest.fn(async () => { throw new Error('private database detail'); }),
        onCourseValidationFailure,
      } as any),
    );

    expect(result).toEqual({
      status: 422,
      body: { error: { ...createRecommendationError('COURSE_VALIDATION_FAILED'), failureStage: 'stage_attestation' } },
    });
    expect(onCourseValidationFailure).toHaveBeenCalledWith('stage_attestation');
  });

  it.each(['ko', 'en'] as const)('keeps authoritative structured %s constraints on the server', (language) => {
    const prompt = buildRecommendationPrompt(request(language));

    expect(prompt).toContain(`"language": "${language}"`);
    expect(prompt).toContain(`"label": "${request(language).location.label}"`);
    expect(prompt).toContain('"latitude": 37.5444');
    expect(prompt).toContain('"longitude": 127.0374');
    expect(prompt.indexOf('"category": "meal"')).toBeLessThan(prompt.indexOf('"category": "cafe"'));
    expect(prompt).toContain('"maxWalkingMinutes": 10');
    expect(prompt).toContain('"twoPersonTotalBudgetKRW": 70000');
    expect(prompt).toContain('"moods"');
    expect(prompt).toContain('"durationCompatibilityMetadata": "half_day"');
    expect(prompt).toContain('"additionalRequest"');
    expect(prompt).toContain('"parsedPreferences"');
    expect(prompt).toMatch(/authoritative/i);
    expect(prompt).toMatch(/cannot override/i);
    expect(prompt).toMatch(/price|pricing/i);
    expect(prompt).toMatch(/quiet/i);
    expect(prompt).toMatch(/crowd/i);
    expect(prompt).toMatch(/opening hours/i);
  });

  it('uses a prompt version separate from the legacy client prompt version', () => {
    expect(RECOMMEND_DATE_PROMPT_VERSION).toBe('recommend-date-v5-pinned-steps');
  });

  it('step intent가 있으면 resolvedStepIntents 블록과 매칭 후보 id를 포함한다', () => {
    const porkCandidate = {
      ...candidate('pork-candidate', 'pork-place', 'FD6', 127.0374),
      categoryName: '음식점 > 한식 > 육류,고기 > 삼겹살',
    };
    const plainCandidate = candidate('plain-candidate', 'plain-place', 'FD6', 127.0375);

    const prompt = buildRecommendationPrompt(
      { ...request(), additionalRequest: '삼겹살 먹고 싶어' },
      [porkCandidate, plainCandidate],
    );

    expect(prompt).toContain('"resolvedStepIntents"');
    expect(prompt).toContain('삼겹살');
    expect(prompt).toContain(porkCandidate.candidateId);
  });

  it('핀 스텝은 고정으로 표기하고 선택하지 말라고 지시한다', () => {
    const mealCandidate = candidate('meal-candidate', 'pinned-meal', 'CE7', 127.0374);
    const cafeCandidate = candidate('cafe-candidate', 'cafe-place', 'CE7', 127.0380);
    const prompt = buildRecommendationPrompt(
      {
        ...request(),
        courseSteps: [
          { id: 'step-meal', category: 'meal', label: '블루보틀', pinnedKakaoPlaceId: 'pinned-meal', pinnedName: '블루보틀' },
          { id: 'step-cafe', category: 'cafe', label: '카페' },
        ],
      },
      [mealCandidate, cafeCandidate],
    );

    // 핀 스텝은 pinned 표기 + 강제 candidateId, AI는 비핀 스텝만 고른다.
    expect(prompt).toContain('"pinned": true');
    expect(prompt).toContain('meal-candidate');
    expect(prompt).toMatch(/pinned steps are fixed/i);
  });

  it('requires the exact candidate-only JSON shape, step count/order, locks, exclusions, and walking heuristic', () => {
    const prompt = buildRecommendationPrompt({
      ...request(),
      lockedSteps: [{
        stepId: 'step-meal', candidateId: 'meal-candidate', kakaoPlaceId: 'meal-place',
        name: 'Meal Place', address: 'Seoul', roadAddress: 'Seoul road', mapUrl: '', latitude: 37.55, longitude: 127.01,
        locked: true,
      }],
      excludedCategories: ['drinks'],
      excludedPlaceIds: ['blocked-place'],
    }, searchResult.candidates);

    expect(prompt).toContain('{"steps":[{"stepId":"<requested-step-id>","candidateId":"<verified-candidate-id>"}]}');
    expect(prompt).toContain('exactly 2 steps');
    expect(prompt).toContain('exactly the requested stepId order');
    expect(prompt).toContain('Every candidateId and stable Kakao place ID must be unique');
    expect(prompt).toContain('Preserve every locked stepId/candidateId/Kakao place ID tuple exactly');
    expect(prompt).toContain('Never select excluded categories or excluded Kakao place IDs');
    expect(prompt).toContain('80 meters/minute straight-line heuristic');
  });
});

describe('recommend-date Deno source boundary', () => {
  it('resolves every local TypeScript import in the transitive Edge graph with explicit extensions', () => {
    const entry = join(process.cwd(), 'supabase/functions/recommend-date/index.ts');
    const pending = [entry];
    const visited = new Set<string>();
    const invalidImports: string[] = [];

    while (pending.length > 0) {
      const file = pending.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);

      const source = readFileSync(file, 'utf8');
      const relativeImports = [
        ...source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.[^'"]+)\1/g),
      ].map((match) => match[2]);

      for (const specifier of relativeImports) {
        const explicitPath = resolve(dirname(file), specifier);
        const inferredPath = existsSync(explicitPath) ? explicitPath : `${explicitPath}.ts`;
        if (!specifier.endsWith('.ts') || !existsSync(explicitPath)) {
          invalidImports.push(`${file}: ${specifier}`);
        }
        if (existsSync(inferredPath) && inferredPath.endsWith('.ts')) pending.push(inferredPath);
      }
    }

    expect(visited.size).toBeGreaterThan(3);
    expect(invalidImports).toEqual([]);

    const denoConfig = JSON.parse(readFileSync(
      join(process.cwd(), 'supabase/functions/recommend-date/deno.json'),
      'utf8',
    ));
    expect(denoConfig.imports.zod).toBe('npm:zod@4.4.3');
  });

  it('wires the bounded downstream helper into the Edge adapter', () => {
    const source = readFileSync(
      join(process.cwd(), 'supabase/functions/recommend-date/index.ts'),
      'utf8',
    );

    expect(source).toContain("import { invokeGenerateAiSelection } from '../_shared/recommend-date-downstream.ts'");
    expect(source).toContain('generateSelection: (input) => invokeGenerateAiSelection({');
  });
});

describe('recommend-date dependency-injected handler', () => {
  it('handles OPTIONS without authentication and rejects unsupported methods', async () => {
    const deps = dependencies();

    await expect(handleRecommendDate({ method: 'OPTIONS', body: undefined }, deps)).resolves.toEqual({
      status: 204,
      body: null,
    });
    await expect(handleRecommendDate({ method: 'GET', body: undefined }, deps)).resolves.toEqual({
      status: 405,
      body: { error: createRecommendationError('INVALID_INPUT') },
    });
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it('returns typed AUTH_EXPIRED for a missing Authorization header', async () => {
    const deps = dependencies();

    await expect(handleRecommendDate({ method: 'POST', body: request() }, deps)).resolves.toEqual({
      status: 401,
      body: { error: createRecommendationError('AUTH_EXPIRED') },
    });
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it('returns typed AUTH_EXPIRED when auth.getUser-equivalent authentication fails', async () => {
    const deps = dependencies({ authenticate: jest.fn(async () => null) });

    const result = await handleRecommendDate({
      method: 'POST',
      authorization: 'Bearer expired',
      body: request(),
    }, deps);

    expect(result).toEqual({ status: 401, body: { error: createRecommendationError('AUTH_EXPIRED') } });
    expect(deps.generateSelection).not.toHaveBeenCalled();
  });

  it('returns typed INVALID_INPUT without exposing Zod issues or submitted input', async () => {
    const deps = dependencies();
    const invalidBody = { ...request(), systemPrompt: 'leak-me' };

    const result = await handleRecommendDate({
      method: 'POST',
      authorization: 'Bearer valid',
      body: invalidBody,
    }, deps);

    expect(result).toEqual({ status: 400, body: { error: createRecommendationError('INVALID_INPUT') } });
    expect(JSON.stringify(result)).not.toContain('leak-me');
    expect(JSON.stringify(result)).not.toContain('issues');
    expect(deps.generateSelection).not.toHaveBeenCalled();
  });

  it.each(['ko', 'en'] as const)('authenticates and preserves requestId for a valid %s request', async (language) => {
    const deps = dependencies();
    const input = request(language);

    const result = await handleRecommendDate({
      method: 'POST',
      authorization: 'Bearer original-user-token',
      body: input,
    }, deps);

    expect(deps.authenticate).toHaveBeenCalledWith('Bearer original-user-token');
    expect(deps.generateSelection).toHaveBeenCalledWith({
      authorization: 'Bearer original-user-token',
      prompt: expect.any(String),
      promptVersion: RECOMMEND_DATE_PROMPT_VERSION,
    });
    const prompt = (deps.generateSelection as jest.Mock).mock.calls[0][0].prompt as string;
    expect(prompt).toContain(`"language": "${language}"`);
    expect(prompt).toContain(`"additionalRequest": "${input.additionalRequest}"`);
    expect(prompt).not.toContain('"photoFriendlyPreferred": true');
    expect(result).toMatchObject({
      status: 200,
      body: { requestId: input.requestId, course: { requestId: input.requestId }, metadata: { fallbackUsed: false } },
    });
  });

  it.each([
    ['downstream failure', jest.fn(async () => { throw new Error('private downstream detail'); })],
    ['non-timeout abort', jest.fn(async () => {
      const error = new Error('external cancellation');
      error.name = 'AbortError';
      throw error;
    })],
    ['empty selection', jest.fn(async () => ({ steps: [] }))],
    ['invalid selection', jest.fn(async () => ({ cards: [{ title: 'legacy shape' }] }))],
  ])('uses sanitized candidate fallback for %s', async (_case, generateSelection) => {
    const deps = dependencies({ generateSelection });

    const result = await handleRecommendDate({
      method: 'POST',
      authorization: 'Bearer valid',
      body: request(),
    }, deps);

    expect(result).toMatchObject({ status: 200, body: { metadata: { fallbackUsed: true } } });
    expect(JSON.stringify(result)).not.toContain('private downstream detail');
  });

  it('recovers the dedicated downstream timeout with candidate-only fallback', async () => {
    const deps = dependencies({
      generateSelection: jest.fn(async () => {
        throw new RecommendDateDownstreamTimeoutError();
      }),
    });

    const result = await handleRecommendDate({
      method: 'POST',
      authorization: 'Bearer valid',
      body: request(),
    }, deps);

    expect(result).toMatchObject({
      status: 200,
      body: { metadata: { fallbackUsed: true, selectionReason: 'ai_timeout' } },
    });
  });
});
