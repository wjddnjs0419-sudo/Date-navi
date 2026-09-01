import type { RecommendDateDependencies } from './recommend-date-handler.ts';
import { createSupabaseKakaoSearchCacheStore } from './kakao-search-cache.ts';
import { searchAndRankRecommendation } from './recommendation-search-pipeline.ts';
import { normalizeKakaoPlace } from './place-provider.ts';
import { resolveKakaoPlaceLinkDetailed, searchKakaoPlacesForLinkDetailed } from './kakao-place-link.ts';
import { fetchNaverLocalPlaces, fetchNaverLocalPlacesWithStatus } from './providers/naver-place-provider.ts';
import { createNaverSearchCache } from './naver-search-cache.ts';
import { discoverProviderNeutralCandidates, type StepDiscoveryAttempt } from './provider-neutral-discovery-pipeline.ts';
import {
  naverShadowQueries,
  naverStepQueries,
  providerNeutralSessionPersistenceEnabled,
  resolveRecommendationDiscoveryStrategy,
  type RecommendationDiscoveryStrategy,
} from './recommendation-discovery-strategy.ts';
import {
  createSupabaseRecommendationHistoryQueryAdapter,
  loadRecommendationHistoryAssignmentScope,
  loadRecommendationHistory,
} from './recommendation-history.ts';
import { lookupPlacePrices, recordPlaceKnowledge } from './place-ledger.ts';
import {
  persistedHistoryExperimentVariant,
  type HistoryExperimentMode,
} from '../../../shared/recommendation/history-experiment.ts';
import {
  acquireCourseGenerationLock,
  consumeCourseGenerationQuota,
  recordAiRateLimitEvent,
  releaseCourseGenerationQuota,
  releaseCourseGenerationLock,
} from './ai-rate-limit.ts';
import {
  buildPlacePriceEstimationPrompt,
  parsePlacePriceEstimate,
  PLACE_PRICE_PROMPT_VERSION,
} from './place-price-prompt.ts';

type RuntimeSupabaseClient = {
  from: (...args: any[]) => any;
  rpc: (...args: any[]) => Promise<any>;
  auth?: { getUser: () => Promise<any> };
};

type RuntimeCreateClient = (
  url: string,
  key: string,
  options?: { global?: { headers?: Record<string, string> } },
) => RuntimeSupabaseClient;

export type RecommendationRuntimeOptions = {
  mode: 'mobile' | 'web-demo';
  createClient: RuntimeCreateClient;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  kakaoRestApiKey: string;
  naverClientId: string;
  naverClientSecret: string;
  discoveryStrategy?: RecommendationDiscoveryStrategy;
  providerPersistenceReady?: boolean;
  experimentMode?: HistoryExperimentMode;
  rateLimitClient?: RuntimeSupabaseClient;
  authorizationForPrice?: string;
  generatePriceEstimation?: (input: {
    authorization: string;
    prompt: string;
    promptVersion: string;
  }) => Promise<unknown>;
  authenticate?: RecommendDateDependencies['authenticate'];
  generateSelection: RecommendDateDependencies['generateSelection'];
  fetcher?: typeof fetch;
};

const PLACE_PRICE_ESTIMATE_MODEL = 'claude-haiku-4-5';
const naverSearchCache = createNaverSearchCache();

function historyExperimentMode(value: string | undefined): HistoryExperimentMode {
  return value === 'ab50' || value === 'treatment' ? value : 'off';
}

const serviceClient = (options: RecommendationRuntimeOptions): RuntimeSupabaseClient => (
  options.createClient(options.supabaseUrl, options.serviceRoleKey)
);

export function createRecommendationRuntime(
  options: RecommendationRuntimeOptions,
): RecommendDateDependencies {
  const fetcher = options.fetcher ?? fetch;
  const strategy = options.discoveryStrategy ?? 'kakao_only';
  const persistenceReady = options.providerPersistenceReady ?? false;
  const authenticate = options.authenticate ?? (async (authorization: string) => {
    const userClient = options.createClient(options.supabaseUrl, options.anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error } = await userClient.auth!.getUser();
    return error || !user ? null : { id: user.id };
  });

  const dependencies: RecommendDateDependencies = {
    ...(options.mode === 'mobile' && options.rateLimitClient ? {
      rateLimit: {
        acquire: async ({ userId, requestId }) => acquireCourseGenerationLock(options.rateLimitClient!, { userId, requestId }),
        release: async ({ userId, requestId }) => releaseCourseGenerationLock(options.rateLimitClient!, { userId, requestId }),
        consume: async ({ userId, requestId }) => consumeCourseGenerationQuota(options.rateLimitClient!, { userId, requestId }),
        releaseQuota: async ({ userId, consumptionId }) => releaseCourseGenerationQuota(options.rateLimitClient!, { userId, consumptionId }),
        recordEvent: async ({ userId, eventType }) => recordAiRateLimitEvent(options.rateLimitClient!, { userId, eventType }),
      },
    } : {}),
    authenticate,
    searchCandidates: async (input, history) => {
      const startedAt = Date.now();
      if (strategy === 'naver_shadow') {
        const queries = naverShadowQueries({
          locationLabel: input.location.label,
          locationSource: input.location.source,
          stepCategories: input.courseSteps.map((step) => step.category),
          stepIds: input.courseSteps.map((step) => step.id),
          stepIntents: (input as typeof input & { resolvedStepIntents?: { stepId: string; canonicalTerm: string; kakaoSearchTerms?: readonly string[] }[] }).resolvedStepIntents,
        });
        const shadow = Promise.all(queries.map((query) => fetchNaverLocalPlacesWithStatus({
          query,
          clientId: options.naverClientId,
          clientSecret: options.naverClientSecret,
          fetcher,
          cache: naverSearchCache,
        }))).then((results) => {
          const outcomes = results.reduce<Record<string, number>>((counts, result) => {
            counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
            return counts;
          }, {});
          const httpStatusCodes = [...new Set(results.flatMap((result) => result.statusCode === undefined ? [] : [result.statusCode]))];
          console.error(JSON.stringify({
            event: 'recommend_date_naver_shadow',
            queryCount: queries.length,
            resultCount: results.reduce((count, result) => count + result.places.length, 0),
            outcomes,
            httpStatusCodes,
            elapsedMs: Date.now() - startedAt,
          }));
        }).catch(() => undefined);
        const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
        edgeRuntime?.waitUntil?.(shadow);
      }
      const cacheMetrics = { hits: 0, misses: 0, kakaoCalls: 0 };
      const client = serviceClient(options);
      const result = await searchAndRankRecommendation(input, {
        kakaoRestApiKey: options.kakaoRestApiKey,
        fetcher,
        cacheStore: createSupabaseKakaoSearchCacheStore(client),
        cacheMetrics,
        history,
        priceLookup: (ids) => lookupPlacePrices({ client: client as never, kakaoPlaceIds: ids }),
      });
      console.error(JSON.stringify({
        event: 'kakao_cache_lookup',
        fn: options.mode === 'web-demo' ? 'recommend-demo' : 'recommend-date',
        ...cacheMetrics,
        searchTotalMs: Date.now() - startedAt,
      }));
      return result;
    },
    ...(strategy === 'naver_primary_with_kakao_fallback' && persistenceReady ? {
      searchProviderNeutralCandidates: async (input, history) => {
        const client = serviceClient(options);
        const semanticQueries = naverStepQueries({
          locationLabel: input.location.label,
          locationSource: input.location.source,
          stepCategories: input.courseSteps.map((step) => step.category),
          stepIds: input.courseSteps.map((step) => step.id),
          stepIntents: (input as typeof input & { resolvedStepIntents?: { stepId: string; canonicalTerm: string; kakaoSearchTerms?: readonly string[] }[] }).resolvedStepIntents,
        });
        const primaryAttempts: StepDiscoveryAttempt[] = semanticQueries.map(({ stepId, query, querySource }) => ({
          stepId,
          provider: 'naver' as const,
          querySource,
          run: () => fetchNaverLocalPlaces({
            query,
            clientId: options.naverClientId,
            clientSecret: options.naverClientSecret,
            fetcher,
            cache: naverSearchCache,
          }),
        }));
        if (input.replacement) {
          const replacementStep = input.courseSteps.find((step) => step.id === input.replacement?.stepId);
          if (replacementStep) {
            primaryAttempts.unshift({
              stepId: replacementStep.id,
              provider: 'kakao' as const,
              run: async () => {
                const replacement = await searchAndRankRecommendation({
                  ...input,
                  courseSteps: [replacementStep],
                }, {
                  kakaoRestApiKey: options.kakaoRestApiKey,
                  fetcher,
                  cacheStore: createSupabaseKakaoSearchCacheStore(client),
                  cacheMetrics: { hits: 0, misses: 0, kakaoCalls: 0 },
                  history,
                });
                return replacement.candidates
                  .filter((candidate) => candidate.kakaoPlaceId === input.replacement?.kakaoPlaceId)
                  .map(normalizeKakaoPlace);
              },
            });
          }
        }
        const fallbackAttempts: StepDiscoveryAttempt[] = input.courseSteps.map((step) => ({
          stepId: step.id,
          provider: 'kakao' as const,
          run: async () => {
            const cacheMetrics = { hits: 0, misses: 0, kakaoCalls: 0 };
            const fallback = await searchAndRankRecommendation({
              ...input,
              courseSteps: [step],
            }, {
              kakaoRestApiKey: options.kakaoRestApiKey,
              fetcher,
              cacheStore: createSupabaseKakaoSearchCacheStore(client),
              cacheMetrics,
              history,
            });
            console.error(JSON.stringify({
              event: 'recommend_date_kakao_fallback',
              requestId: input.requestId,
              stepId: step.id,
              strategy,
              ...cacheMetrics,
            }));
            return fallback.candidates.map(normalizeKakaoPlace);
          },
        }));
        const result = await discoverProviderNeutralCandidates({
          request: input,
          primaryAttempts: [],
          fallbackAttempts: [],
          minQualifiedCandidates: 2,
          stepAttempts: { primary: primaryAttempts, fallback: fallbackAttempts },
          history,
        });
        console.error(JSON.stringify({
          event: 'recommend_date_provider_discovery',
          requestId: input.requestId,
          strategy,
          attemptsRun: result.discovery.attemptsRun,
          fallbackUsed: result.discovery.fallbackUsed,
          fewerResults: result.discovery.fewerResults,
          candidateCount: result.candidates.length,
          qualifiedByCategory: result.candidates.reduce<Record<string, number>>((counts, candidate) => {
            const category = candidate.place.category.normalized;
            counts[category] = (counts[category] ?? 0) + 1;
            return counts;
          }, {}),
          qualifiedByProvider: result.candidates.reduce<Record<string, number>>((counts, candidate) => {
            const provider = candidate.place.identity.provider;
            counts[provider] = (counts[provider] ?? 0) + 1;
            return counts;
          }, {}),
          steps: result.diagnostics?.steps?.map((step) => ({
            ...step,
            minimumSelectableCandidates: 2,
            fallbackProvider: step.fallbackAttemptsRun > 0 ? 'kakao' : null,
          })),
          diagnostics: result.diagnostics,
        }));
        return result;
      },
      resolveProviderNeutralKakaoLinks: async ({ requestId, candidates: selected }) => {
        const cache = new Map<string, Promise<Awaited<ReturnType<typeof searchKakaoPlacesForLinkDetailed>>>>();
        const searchKakao = (query: string) => {
          const existing = cache.get(query);
          if (existing) return existing;
          const pending = searchKakaoPlacesForLinkDetailed({
            query,
            kakaoRestApiKey: options.kakaoRestApiKey,
            fetcher,
          });
          cache.set(query, pending);
          return pending;
        };
        const resolved = await Promise.all(selected.map(async (candidate) => ({
          candidate,
          resolution: await resolveKakaoPlaceLinkDetailed(candidate.place, searchKakao, { includeDiagnostics: true }),
        })));
        const links = new Map<string, { kakaoPlaceId: string; mapUrl: string }>();
        const failureReasons = resolved.reduce<Record<string, number>>((counts, entry) => {
          if (entry.resolution.link) {
            links.set(entry.candidate.candidateId, entry.resolution.link);
            return counts;
          }
          const reason = entry.resolution.reason ?? 'no_eligible_candidate';
          counts[reason] = (counts[reason] ?? 0) + 1;
          return counts;
        }, {});
        console.error(JSON.stringify({
          event: 'recommend_date_kakao_link_resolution',
          requestId,
          selectedNaverCount: selected.length,
          linkedCount: links.size,
          failureReasons,
          perCandidate: resolved.map(({ candidate, resolution }) => ({
            candidateId: candidate.candidateId,
            name: candidate.place.name,
            ...(resolution.reason ? { reason: resolution.reason } : {}),
            diagnostics: resolution.diagnostics,
          })),
        }));
        return links;
      },
    } : {}),
    generateSelection: options.generateSelection,
    ...(options.mode === 'mobile' ? {
      loadHistory: async ({ authenticatedUserId, request }) => loadRecommendationHistory({
        authenticatedUserId,
        currentLocation: request.location,
        activeSessionId: request.sessionId,
        queries: createSupabaseRecommendationHistoryQueryAdapter(serviceClient(options)),
      }),
      historyExperiment: {
        mode: options.experimentMode ?? historyExperimentMode(undefined),
        resolveAssignmentContext: async ({ authenticatedUserId, request }) => {
          const client = serviceClient(options);
          const queries = createSupabaseRecommendationHistoryQueryAdapter(client);
          const scope = await loadRecommendationHistoryAssignmentScope({ authenticatedUserId, queries });
          if (!request.sessionId) {
            return { ...scope, ...(scope.status === 'failed' ? { assignmentScopeFailed: true } : {}) };
          }
          const { data: session, error } = await client
            .from('recommendation_sessions')
            .select('owner_user_id,metadata')
            .eq('id', request.sessionId)
            .maybeSingle();
          const persistedAssignedVariant = !error && session?.owner_user_id === authenticatedUserId
            ? persistedHistoryExperimentVariant(session.metadata)
            : undefined;
          return {
            ...scope,
            ...(scope.status === 'failed' ? { assignmentScopeFailed: true } : {}),
            ...(persistedAssignedVariant ? { persistedAssignedVariant } : {}),
          };
        },
      },
      loadReplacementCandidateRank: async ({
        authenticatedUserId, sessionId, targetStepId, kakaoPlaceId, candidateListAttestationId,
      }) => {
        const client = serviceClient(options);
        const { data: attestation, error } = await client
          .from('recommendation_generation_attestations')
          .select('session_id,owner_user_id,request_json,response_json,created_at,consumed_at')
          .eq('request_id', candidateListAttestationId)
          .maybeSingle();
        const { data: session, error: sessionError } = await client
          .from('recommendation_sessions')
          .select('request_id')
          .eq('id', sessionId)
          .maybeSingle();
        if (error || !attestation || attestation.session_id !== sessionId
          || attestation.consumed_at !== null || sessionError || !session
          || attestation.owner_user_id !== authenticatedUserId
          || attestation.request_json?.type !== 'replacement_candidate_list'
          || attestation.request_json?.baseRequestId !== session.request_id
          || attestation.request_json?.targetStepId !== targetStepId
          || Date.now() - Date.parse(attestation.created_at) > 15 * 60 * 1000) return undefined;
        const rank = attestation.response_json?.candidateRanks?.find((candidate: unknown) => (
          typeof candidate === 'object' && candidate !== null
          && (candidate as { kakaoPlaceId?: unknown }).kakaoPlaceId === kakaoPlaceId
        ))?.displayRank;
        return Number.isInteger(rank) && rank >= 1 && rank <= 15 ? rank : undefined;
      },
      stageAttestation: async ({ ownerUserId, request, response }) => {
        const client = serviceClient(options);
        const sessionId = response.course.sessionId;
        const existingAttestationResponse = async () => {
          const { data: existing, error } = await client
            .from('recommendation_generation_attestations')
            .select('session_id,owner_user_id,request_json,response_json')
            .eq('request_id', request.requestId)
            .maybeSingle();
          if (error || !existing) return undefined;
          if (existing.session_id !== sessionId || existing.owner_user_id !== ownerUserId
            || existing.request_json?.requestId !== request.requestId) {
            throw new Error('attestation request ownership mismatch');
          }
          return existing.response_json;
        };
        const existing = await existingAttestationResponse();
        if (existing) return existing;
        if (sessionId !== request.requestId) {
          const { data: session, error: sessionError } = await client
            .from('recommendation_sessions')
            .select('id, owner_user_id, request_id')
            .eq('id', sessionId)
            .maybeSingle();
          if (sessionError || !session || session.owner_user_id !== ownerUserId
            || request.baseRequestId !== session.request_id) {
            throw new Error('session owner or version mismatch');
          }
        }
        const { error } = await client.from('recommendation_generation_attestations').insert({
          request_id: request.requestId,
          session_id: sessionId,
          owner_user_id: ownerUserId,
          request_json: request,
          response_json: response,
        });
        if (!error) return undefined;
        if (error.code === '23505') {
          const raced = await existingAttestationResponse();
          if (raced) return raced;
        }
        throw error;
      },
      recordPlaceKnowledge: ({ places }) => {
        const generatePriceEstimation = options.generatePriceEstimation;
        if (!generatePriceEstimation) return;
        const client = serviceClient(options);
        const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
        const authorization = options.authorizationForPrice ?? '';
        edgeRuntime?.waitUntil?.(recordPlaceKnowledge({
          client: client as never,
          places,
          model: PLACE_PRICE_ESTIMATE_MODEL,
          estimate: async (place) => {
            const raw = await generatePriceEstimation({
              authorization,
              prompt: buildPlacePriceEstimationPrompt({
                placeName: place.name,
                categoryName: place.categoryName,
                address: place.address,
              }),
              promptVersion: PLACE_PRICE_PROMPT_VERSION,
            });
            return parsePlacePriceEstimate(raw);
          },
        }));
      },
    } : {}),
  };
  return dependencies;
}

export function runtimeOptionsFromEnv(
  input: Omit<RecommendationRuntimeOptions, 'mode' | 'createClient' | 'supabaseUrl' | 'anonKey' | 'serviceRoleKey' | 'kakaoRestApiKey' | 'naverClientId' | 'naverClientSecret' | 'discoveryStrategy' | 'providerPersistenceReady' | 'experimentMode'> & {
    mode: 'mobile' | 'web-demo';
    createClient: RuntimeCreateClient;
    env: { get(name: string): string | undefined };
  },
): RecommendationRuntimeOptions {
  return {
    ...input,
    supabaseUrl: input.env.get('SUPABASE_URL') ?? '',
    anonKey: input.env.get('SUPABASE_ANON_KEY') ?? '',
    serviceRoleKey: input.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    kakaoRestApiKey: input.env.get('KAKAO_REST_API_KEY') ?? '',
    naverClientId: input.env.get('NAVER_CLIENT_ID') ?? '',
    naverClientSecret: input.env.get('NAVER_CLIENT_SECRET') ?? '',
    discoveryStrategy: resolveRecommendationDiscoveryStrategy(input.env.get('RECOMMENDATION_DISCOVERY_STRATEGY')),
    providerPersistenceReady: providerNeutralSessionPersistenceEnabled(input.env.get('RECOMMENDATION_PROVIDER_SESSION_PERSISTENCE')),
    experimentMode: historyExperimentMode(input.env.get('RECOMMENDATION_HISTORY_EXPERIMENT')),
  };
}

export { historyExperimentLogKey } from '../../../shared/recommendation/history-experiment.ts';
