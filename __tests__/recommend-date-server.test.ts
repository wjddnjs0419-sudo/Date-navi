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
  buildParseStepIntentsPrompt,
  RECOMMEND_DATE_PROMPT_VERSION,
} from '../supabase/functions/_shared/recommendation-prompt';
import { retrieveGeneratedFoodIntents } from '../supabase/functions/_shared/food-intent-dictionary';

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
  it('uses the provider-neutral Naver-first result for a fresh unpinned course', async () => {
    const providerSearch = jest.fn(async () => ({
      candidates: [
        {
          candidateId: 'naver-meal', distanceFromSearchCenterMeters: 100, popularityBonus: 0,
          place: { identity: { provider: 'naver' as const, providerPlaceId: 'https://map.naver.com/p/meal' }, name: '네이버 식당', category: { normalized: 'meal' as const }, coordinates: { latitude: 37.5444, longitude: 127.0374 }, evidence: { provider: 'naver' as const, searchTerms: ['서울숲 식사'] } },
        },
        {
          candidateId: 'naver-cafe', distanceFromSearchCenterMeters: 100, popularityBonus: 0,
          place: { identity: { provider: 'naver' as const, providerPlaceId: 'https://map.naver.com/p/cafe' }, name: '네이버 카페', category: { normalized: 'cafe' as const }, coordinates: { latitude: 37.5444, longitude: 127.0374 }, evidence: { provider: 'naver' as const, searchTerms: ['서울숲 카페'] } },
        },
      ],
      discovery: { places: [], attemptsRun: 1, fallbackUsed: false, fewerResults: false },
    }));
    const result = await handleRecommendDate(
      { method: 'POST', authorization: 'Bearer token', body: request() },
      dependencies({
        searchProviderNeutralCandidates: providerSearch,
        generateSelection: jest.fn(async () => ({ steps: [
          { stepId: 'step-meal', candidateId: 'naver-meal' },
          { stepId: 'step-cafe', candidateId: 'naver-cafe' },
        ] })),
      }),
    );

    expect(result.status).toBe(200);
    expect(providerSearch).toHaveBeenCalledTimes(1);
    const body = result.body as { course: { steps: Array<{ placeIdentity?: unknown; kakaoPlaceId?: unknown }> }; candidatePool?: Array<{ placeIdentity?: unknown }> };
    expect(body.course.steps[0]).toMatchObject({ placeIdentity: { provider: 'naver', providerPlaceId: 'https://map.naver.com/p/meal' } });
    expect(body.course.steps[0].kakaoPlaceId).toBeUndefined();
    expect(body.candidatePool?.[0]).toMatchObject({ placeIdentity: { provider: 'naver', providerPlaceId: 'https://map.naver.com/p/meal' } });
  });

  it('adds a Kakao map link only after selecting a Naver place, without changing its identity', async () => {
    const providerSearch = jest.fn(async () => ({
      candidates: [
        {
          candidateId: 'naver-meal', distanceFromSearchCenterMeters: 100, popularityBonus: 0,
          place: { identity: { provider: 'naver' as const, providerPlaceId: 'naver-meal-id' }, name: '네이버 식당', category: { normalized: 'meal' as const }, coordinates: { latitude: 37.5444, longitude: 127.0374 }, evidence: { provider: 'naver' as const, searchTerms: ['서울숲 식사'] } },
        },
        {
          candidateId: 'naver-cafe', distanceFromSearchCenterMeters: 100, popularityBonus: 0,
          place: { identity: { provider: 'naver' as const, providerPlaceId: 'naver-cafe-id' }, name: '네이버 카페', category: { normalized: 'cafe' as const }, coordinates: { latitude: 37.5444, longitude: 127.0374 }, evidence: { provider: 'naver' as const, searchTerms: ['서울숲 카페'] } },
        },
      ], discovery: { places: [], attemptsRun: 1, fallbackUsed: false, fewerResults: false },
    }));
    const resolveLinks = jest.fn(async () => new Map([
      ['naver-meal', { kakaoPlaceId: 'kakao-confirmed', mapUrl: 'https://place.map.kakao.com/kakao-confirmed' }],
    ]));
    const result = await handleRecommendDate(
      { method: 'POST', authorization: 'Bearer token', body: request() },
      dependencies({ searchProviderNeutralCandidates: providerSearch, resolveProviderNeutralKakaoLinks: resolveLinks }),
    );

    expect(result.status).toBe(200);
    expect(resolveLinks).toHaveBeenCalledWith([expect.objectContaining({ candidateId: 'naver-meal' }), expect.objectContaining({ candidateId: 'naver-cafe' })]);
    const body = result.body as { course: { steps: Array<Record<string, unknown>> }; cards: Array<{ steps: Array<Record<string, unknown>> }> };
    expect(body.course.steps[0]).toMatchObject({ placeIdentity: { provider: 'naver', providerPlaceId: 'naver-meal-id' }, kakaoPlaceId: 'kakao-confirmed', mapUrl: 'https://place.map.kakao.com/kakao-confirmed' });
    expect(body.cards[0].steps[0]).toMatchObject({ candidateId: 'naver-meal', kakaoPlaceId: 'kakao-confirmed', map_url: 'https://place.map.kakao.com/kakao-confirmed' });
  });

  it('falls back to the deterministic qualified selection when AI swaps provider-neutral categories', async () => {
    const providerSearch = jest.fn(async () => ({
      candidates: [
        {
          candidateId: 'naver-meal', distanceFromSearchCenterMeters: 100, popularityBonus: 0,
          place: { identity: { provider: 'naver' as const, providerPlaceId: 'naver-meal-id' }, name: '네이버 식당', category: { normalized: 'meal' as const }, coordinates: { latitude: 37.5444, longitude: 127.0374 }, evidence: { provider: 'naver' as const, searchTerms: ['서울숲 식사'] } },
        },
        {
          candidateId: 'naver-cafe', distanceFromSearchCenterMeters: 100, popularityBonus: 0,
          place: { identity: { provider: 'naver' as const, providerPlaceId: 'naver-cafe-id' }, name: '네이버 카페', category: { normalized: 'cafe' as const }, coordinates: { latitude: 37.5444, longitude: 127.0374 }, evidence: { provider: 'naver' as const, searchTerms: ['서울숲 카페'] } },
        },
      ],
      discovery: { places: [], attemptsRun: 1, fallbackUsed: false, fewerResults: false },
    }));
    const result = await handleRecommendDate(
      { method: 'POST', authorization: 'Bearer token', body: request() },
      dependencies({
        searchProviderNeutralCandidates: providerSearch,
        generateSelection: jest.fn(async () => ({ steps: [
          { stepId: 'step-meal', candidateId: 'naver-cafe' },
          { stepId: 'step-cafe', candidateId: 'naver-meal' },
        ] })),
      }),
    );

    expect(result).toMatchObject({
      status: 200,
      body: {
        metadata: { fallbackUsed: true, selectionReason: 'ai_invalid_selection' },
        course: { steps: [{ candidateId: 'naver-meal' }, { candidateId: 'naver-cafe' }] },
      },
    });
  });

  it('limits generated-food fallback context to request-local matches', () => {
    const prompt = buildParseStepIntentsPrompt({ ...request(), additionalRequest: '라떼와 닭갈비 먹고 싶어' });
    const generatedSection = prompt.split('Request-local generated food candidates:')[1]!.split('Ordered course steps:')[0]!;

    expect(generatedSection).toContain('"라떼"');
    expect(generatedSection).toContain('"닭갈비"');
    expect(generatedSection).not.toContain('"가래떡"');
    expect((generatedSection.match(/"canonicalTerm"/g) ?? [])).toHaveLength(2);
  });

  it('caps generated-food retrieval at 20 even when a caller requests more', () => {
    const candidates = retrieveGeneratedFoodIntents('가래떡 가오리찜 가오리콩나물찜 가오리회무침 가자미 매운탕 가자미구이 가자미식해 가자미조림 가자미찜 가자미튀김 가죽나물무침 가지김치 가지나물 가지냉국 가지볶음 가지전 가지찜 가지탕수 갈비 갈비구이 갈비찜', 99);
    expect(candidates).toHaveLength(20);
  });

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

    expect({ status: result.status, body: result.body }).toEqual({
      status: 422,
      body: { error: { ...createRecommendationError('COURSE_VALIDATION_FAILED'), failureStage: 'stage_attestation' } },
    });
    expect(onCourseValidationFailure).toHaveBeenCalledWith('stage_attestation');
  });

  it('returns an existing server-attested response when a retry reuses the same request ID', async () => {
    const stageAttestation = jest.fn(async ({ response }: { response: any }) => ({
      ...response,
      metadata: {
        ...response.metadata,
        search: { ...response.metadata.search, candidateCount: 3 },
      },
    }));

    const result = await handleRecommendDate(
      { method: 'POST', authorization: 'Bearer token', body: request() },
      dependencies({ stageAttestation }),
    );

    expect(result.status).toBe(200);
    expect((result.body as any).metadata.search.candidateCount).toBe(3);
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
    expect(prompt).toContain('"supplementaryAdditionalRequest"');
    expect(prompt).toContain('"selectedStepTags"');
    expect(prompt).not.toContain('"parsedPreferences"');
    expect(prompt).toMatch(/authoritative/i);
    expect(prompt).toMatch(/cannot override/i);
    expect(prompt).toMatch(/price|pricing/i);
    expect(prompt).toMatch(/quiet/i);
    expect(prompt).toMatch(/crowd/i);
    expect(prompt).toMatch(/opening hours/i);
  });

  it('uses a prompt version separate from the legacy client prompt version', () => {
    expect(RECOMMEND_DATE_PROMPT_VERSION).toBe('recommend-date-v6-step-tags');
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

  it('keeps Naver shadow separate from the Naver-primary session-persistence gate', () => {
    const source = readFileSync(
      join(process.cwd(), 'supabase/functions/recommend-date/index.ts'),
      'utf8',
    );

    expect(source).toContain("discoveryStrategy === 'naver_shadow'");
    expect(source).toContain("event: 'recommend_date_naver_shadow'");
    expect(source).toContain("discoveryStrategy === 'naver_primary_with_kakao_fallback' && providerPersistenceReady");
  });

  // 세션 행이 없는 최초 생성 실패도 arm별 실패율에 잡히려면, sessionKey join이 아니라
  // 로그 자체의 experiment-active marker로 집계 대상을 판별할 수 있어야 한다.
  it('marks every history-outcome log with whether the experiment was resolved for the request', () => {
    const source = readFileSync(
      join(process.cwd(), 'supabase/functions/recommend-date/index.ts'),
      'utf8',
    );

    expect(source).toContain('experimentActive: Boolean(historyMetadata)');
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
    expect(prompt).toContain(`"supplementaryAdditionalRequest": "${input.additionalRequest}"`);
    expect(prompt).not.toContain('"photoFriendlyPreferred": true');
    expect(result).toMatchObject({
      status: 200,
      body: { requestId: input.requestId, course: { requestId: input.requestId }, metadata: { fallbackUsed: false } },
    });
  });

  it('holds one course-generation lock and consumes quota immediately before Claude selection', async () => {
    const calls: string[] = [];
    const deps = dependencies({
      rateLimit: {
        acquire: jest.fn(async () => { calls.push('acquire'); return { acquired: true as const }; }),
        consume: jest.fn(async () => { calls.push('consume'); return { allowed: true as const }; }),
        release: jest.fn(async () => { calls.push('release'); }),
        recordEvent: jest.fn(async () => undefined),
      },
      searchCandidates: jest.fn(async () => { calls.push('search'); return searchResult; }),
      generateSelection: jest.fn(async () => { calls.push('select'); return validSelection; }),
    });

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, deps);

    expect(result.status).toBe(200);
    expect(calls).toEqual(['acquire', 'search', 'consume', 'select', 'release']);
    expect(deps.rateLimit!.acquire).toHaveBeenCalledWith({ userId: 'user-001', requestId: 'request-ko' });
  });

  it('returns distinct lock, burst, and daily limit responses without calling Claude', async () => {
    const scenarios = [
      { lock: { acquired: false as const, retryAfterSeconds: 12 }, status: 409, code: 'AI_REQUEST_ALREADY_RUNNING' },
      { quota: { allowed: false as const, limitType: 'burst' as const, retryAfterSeconds: 30 }, status: 429, code: 'AI_RATE_LIMITED' },
      { quota: { allowed: false as const, limitType: 'daily' as const, resetsAt: '2026-07-15T00:00:00+09:00' }, status: 429, code: 'AI_DAILY_LIMIT_REACHED' },
    ];
    for (const scenario of scenarios) {
      const deps = dependencies({
        rateLimit: {
          acquire: jest.fn(async () => scenario.lock ?? { acquired: true as const }),
          consume: jest.fn(async () => scenario.quota ?? { allowed: true as const }),
          release: jest.fn(async () => undefined),
          recordEvent: jest.fn(async () => undefined),
        },
      });
      const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, deps);
      expect(result).toMatchObject({
        status: scenario.status,
        body: {
          error: {
            code: scenario.code,
            ...(scenario.quota?.limitType === 'burst' ? { limitType: 'burst', retryAfterSeconds: 30 } : {}),
            ...(scenario.quota?.limitType === 'daily' ? { limitType: 'daily', resetsAt: '2026-07-15T00:00:00+09:00' } : {}),
          },
        },
      });
      expect(deps.generateSelection).not.toHaveBeenCalled();
      if (scenario.lock) expect(deps.rateLimit!.release).not.toHaveBeenCalled();
      else expect(deps.rateLimit!.release).toHaveBeenCalledTimes(1);
    }
  });

  it('does not consume quota for an all-pinned deterministic course', async () => {
    const rateLimit = {
      acquire: jest.fn(async () => ({ acquired: true as const })),
      consume: jest.fn(async () => ({ allowed: true as const })),
      release: jest.fn(async () => undefined),
      recordEvent: jest.fn(async () => undefined),
    };
    const input = request();
    input.courseSteps = [
      { ...input.courseSteps[0], pinnedKakaoPlaceId: 'meal-place', pinnedName: 'Place meal-place' },
      { ...input.courseSteps[1], pinnedKakaoPlaceId: 'cafe-place', pinnedName: 'Place cafe-place' },
    ];
    const deps = dependencies({ rateLimit });

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: input }, deps);

    expect(result.status).toBe(200);
    expect(rateLimit.consume).not.toHaveBeenCalled();
    expect(deps.generateSelection).not.toHaveBeenCalled();
    expect(rateLimit.release).toHaveBeenCalledTimes(1);
  });

  it('does not consume quota when Kakao candidate search fails, but releases the request lock', async () => {
    const rateLimit = {
      acquire: jest.fn(async () => ({ acquired: true as const })),
      consume: jest.fn(async () => ({ allowed: true as const })),
      release: jest.fn(async () => undefined),
      recordEvent: jest.fn(async () => undefined),
    };
    const deps = dependencies({ rateLimit, searchCandidates: jest.fn(async () => { throw new Error('kakao unavailable'); }) });

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, deps);

    expect(result).toMatchObject({ status: 504, body: { error: { code: 'PLACE_SEARCH_TIMEOUT' } } });
    expect(rateLimit.consume).not.toHaveBeenCalled();
    expect(deps.generateSelection).not.toHaveBeenCalled();
    expect(rateLimit.release).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the quota RPC fails and does not call Claude', async () => {
    const rateLimit = {
      acquire: jest.fn(async () => ({ acquired: true as const })),
      consume: jest.fn(async () => { throw new Error('quota unavailable'); }),
      release: jest.fn(async () => undefined),
      recordEvent: jest.fn(async () => undefined),
    };
    const deps = dependencies({ rateLimit });

    const result = await handleRecommendDate({ method: 'POST', authorization: 'Bearer valid', body: request() }, deps);

    expect(result).toMatchObject({ status: 503, body: { error: { code: 'AI_LIMIT_UNAVAILABLE' } } });
    expect(deps.generateSelection).not.toHaveBeenCalled();
    expect(rateLimit.release).toHaveBeenCalledTimes(1);
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

describe('recommend-date 장소 원장 기록', () => {
  it('성공 생성 후 선정된 스텝 장소들의 전체 카카오 필드로 recordPlaceKnowledge를 호출한다', async () => {
    const recorded: { places: { kakaoPlaceId: string; categoryName: string }[] }[] = [];
    const result = await handleRecommendDate(
      { method: 'POST', authorization: 'Bearer token', body: request() },
      dependencies({ recordPlaceKnowledge: (input) => { recorded.push(input); } }),
    );

    expect(result.status).toBe(200);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].places.map((place) => place.kakaoPlaceId).sort()).toEqual(['cafe-place', 'meal-place']);
    // 원장은 Kakao 세분 카테고리를 필요로 한다 — 응답 스텝에는 없고 후보 풀에만 있다.
    expect(recorded[0].places.every((place) => typeof place.categoryName === 'string' && place.categoryName.length > 0)).toBe(true);
  });

  it('recordPlaceKnowledge가 던져도 응답은 성공한다 — 부가 기록이 원본 흐름을 막지 않는다', async () => {
    const result = await handleRecommendDate(
      { method: 'POST', authorization: 'Bearer token', body: request() },
      dependencies({ recordPlaceKnowledge: () => { throw new Error('boom'); } }),
    );

    expect(result.status).toBe(200);
  });

  it('dep이 없으면 아무 일도 일어나지 않는다 — 기존 호출자 호환', async () => {
    const result = await handleRecommendDate(
      { method: 'POST', authorization: 'Bearer token', body: request() },
      dependencies(),
    );

    expect(result.status).toBe(200);
  });
});
