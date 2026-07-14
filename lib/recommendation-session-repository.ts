import { z } from 'zod';

import { supabase } from './supabase';
import {
  recommendDateResponseSchema,
  recommendationRequestSchema,
  validateRecommendDateResponseForRequest,
  type RecommendDateResponse,
  type RecommendationRequest,
} from '../shared/recommendation/schemas';

const nonEmpty = z.string().trim().min(1);
// PostgreSQL serializes timestamptz JSON with a numeric offset (`+00:00`),
// while API/Edge payloads may use the equivalent trailing `Z` form.
const timestamp = z.string().datetime({ offset: true });

const sessionRowSchema = z.object({
  id: nonEmpty,
  request_id: nonEmpty,
  original_request_id: nonEmpty.optional(),
  owner_user_id: z.string().uuid(),
  couple_id: z.string().nullable(),
  original_request: z.unknown(),
  latest_request: z.unknown().optional(),
  current_course: z.unknown(),
  cards: z.unknown(),
  metadata: z.unknown(),
  confirmed_card_id: nonEmpty.nullable().optional(),
  status: z.enum(['draft', 'confirmed', 'archived', 'failed']),
  created_at: timestamp,
  updated_at: timestamp,
}).passthrough();

const stepRowSchema = z.object({
  session_id: nonEmpty,
  step_id: nonEmpty,
  step_order: z.number().int().min(1).max(4),
  category: nonEmpty,
  label: nonEmpty,
  original_candidate_id: nonEmpty,
  original_kakao_place_id: nonEmpty,
  current_candidate_id: nonEmpty,
  current_kakao_place_id: nonEmpty,
  place_name: nonEmpty,
  address: z.string(),
  road_address: z.string(),
  map_url: z.string(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  reason: nonEmpty,
  locked: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
}).passthrough();

const payloadSchema = z.object({
  session: sessionRowSchema,
  steps: z.array(stepRowSchema).min(2).max(4),
}).strict();

export type RecommendationSessionStep = {
  sessionId: string;
  stepId: string;
  order: number;
  category: string;
  label: string;
  originalCandidateId: string;
  originalKakaoPlaceId: string;
  currentCandidateId: string;
  currentKakaoPlaceId: string;
  placeName: string;
  address: string;
  roadAddress: string;
  mapUrl: string;
  latitude: number;
  longitude: number;
  reason: string;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RecommendationSessionSnapshot = {
  sessionId: string;
  requestId: string;
  originalRequestId: string;
  ownerUserId: string;
  coupleId: string | null;
  request: RecommendationRequest;
  originalRequest: RecommendationRequest;
  confirmedCardId?: string;
  response: RecommendDateResponse;
  steps: RecommendationSessionStep[];
  status: 'draft' | 'confirmed' | 'archived' | 'failed';
  createdAt: string;
  updatedAt: string;
};

export type RecommendationSessionRepositoryErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'malformed'
  | 'persist_failed'
  | 'hydrate_failed'
  | 'missing' | 'unauthorized_edit' | 'stale' | 'confirmed' | 'min_steps' | 'max_steps'
  | 'locked' | 'duplicate' | 'invalid_order' | 'invalid_candidate' | 'constraint_violation'
  | 'operation_failed';

export class RecommendationSessionRepositoryError extends Error {
  constructor(
    public readonly code: RecommendationSessionRepositoryErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'RecommendationSessionRepositoryError';
  }
}

type RpcError = { code?: string; message?: string; status?: number };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcClient = {
  rpc: (functionName: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

function malformed(message: string, cause?: unknown): RecommendationSessionRepositoryError {
  return new RecommendationSessionRepositoryError('malformed', message, { cause });
}

function isUnauthorized(error: RpcError): boolean {
  const message = error.message?.toLowerCase() ?? '';
  return error.code === '42501'
    || error.code === 'PGRST301'
    || error.status === 401
    || error.status === 403
    || message.includes('not authenticated')
    || message.includes('permission denied');
}

const editCodes = new Set<RecommendationSessionRepositoryErrorCode>([
  'missing', 'unauthorized_edit', 'stale', 'confirmed', 'min_steps', 'max_steps',
  'locked', 'duplicate', 'invalid_order', 'invalid_candidate', 'constraint_violation',
]);

function mapEditError(error: RpcError): RecommendationSessionRepositoryError {
  if (isUnauthorized(error)) return new RecommendationSessionRepositoryError('unauthorized_edit', 'Session edit is unavailable.', { cause: error });
  const code = (error.message ?? '').trim().toLowerCase() as RecommendationSessionRepositoryErrorCode;
  return new RecommendationSessionRepositoryError(editCodes.has(code) ? code : 'operation_failed', 'Could not apply recommendation edit.', { cause: error });
}

export function mapRecommendationSessionPayload(input: unknown): RecommendationSessionSnapshot {
  try {
    const payload = payloadSchema.parse(input);
    const originalRequest = recommendationRequestSchema.parse(payload.session.original_request);
    const request = recommendationRequestSchema.parse(payload.session.latest_request ?? payload.session.original_request);
    const response = recommendDateResponseSchema.parse({
      requestId: payload.session.request_id,
      course: payload.session.current_course,
      cards: payload.session.cards,
      metadata: payload.session.metadata,
    });
    validateRecommendDateResponseForRequest(request, response);

    if (payload.session.id !== response.course.sessionId
      || payload.session.request_id !== request.requestId
      || payload.session.request_id !== response.requestId) {
      throw new Error('session/request identity mismatch');
    }

    const steps = payload.steps.map((row, index): RecommendationSessionStep => {
      const courseStep = response.course.steps[index];
      if (row.session_id !== payload.session.id
        || row.step_order !== index + 1
        || !courseStep
        || row.step_id !== courseStep.stepId
        || row.category !== courseStep.category
        || row.label !== courseStep.label
        || row.current_candidate_id !== courseStep.candidateId
        || row.current_kakao_place_id !== courseStep.kakaoPlaceId
        || row.place_name !== courseStep.name
        || row.address !== courseStep.address
        || row.road_address !== courseStep.roadAddress
        || row.map_url !== courseStep.mapUrl
        || row.latitude !== courseStep.latitude
        || row.longitude !== courseStep.longitude
        || row.reason !== courseStep.reason
        || row.locked !== courseStep.locked) {
        throw new Error(`course step row ${index} does not match current course`);
      }
      return {
        sessionId: row.session_id,
        stepId: row.step_id,
        order: row.step_order,
        category: row.category,
        label: row.label,
        originalCandidateId: row.original_candidate_id,
        originalKakaoPlaceId: row.original_kakao_place_id,
        currentCandidateId: row.current_candidate_id,
        currentKakaoPlaceId: row.current_kakao_place_id,
        placeName: row.place_name,
        address: row.address,
        roadAddress: row.road_address,
        mapUrl: row.map_url,
        latitude: row.latitude,
        longitude: row.longitude,
        reason: row.reason,
        locked: row.locked,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    if (steps.length !== response.course.steps.length) {
      throw new Error('normalized step count does not match current course');
    }

    return {
      sessionId: payload.session.id,
      requestId: payload.session.request_id,
      originalRequestId: payload.session.original_request_id ?? originalRequest.requestId,
      ownerUserId: payload.session.owner_user_id,
      coupleId: payload.session.couple_id,
      request,
      originalRequest,
      ...(payload.session.confirmed_card_id ? { confirmedCardId: payload.session.confirmed_card_id } : {}),
      response,
      steps,
      status: payload.session.status,
      createdAt: payload.session.created_at,
      updatedAt: payload.session.updated_at,
    };
  } catch (error) {
    if (error instanceof RecommendationSessionRepositoryError) throw error;
    throw malformed('Malformed recommendation session payload.', error);
  }
}

const defaultRpcClient: RpcClient = {
  rpc: async (functionName, args) => {
    const result = await supabase.rpc(functionName as never, args as never);
    return result as RpcResult;
  },
};

export function createRecommendationSessionRepository(client: RpcClient = defaultRpcClient) {
  return {
    async persist(requestId: string): Promise<RecommendationSessionSnapshot> {
      if (requestId.trim() === '') throw malformed('A request ID is required.');
      const { data, error } = await client.rpc('persist_recommendation_session', {
        p_request_id: requestId,
      });
      if (error) {
        if (isUnauthorized(error)) {
          throw new RecommendationSessionRepositoryError('unauthorized', 'Authentication is required.', { cause: error });
        }
        throw new RecommendationSessionRepositoryError('persist_failed', 'Could not persist recommendation session.', { cause: error });
      }
      return mapRecommendationSessionPayload(data);
    },

    async hydrate(sessionId: string): Promise<RecommendationSessionSnapshot> {
      if (sessionId.trim() === '') throw malformed('A session ID is required.');
      const { data, error } = await client.rpc('get_recommendation_session', {
        p_session_id: sessionId,
      });
      if (error) {
        if (isUnauthorized(error)) {
          throw new RecommendationSessionRepositoryError('unauthorized', 'Session is unavailable for this user.', { cause: error });
        }
        throw new RecommendationSessionRepositoryError('hydrate_failed', 'Could not load recommendation session.', { cause: error });
      }
      if (data === null || data === undefined) {
        throw new RecommendationSessionRepositoryError('not_found', 'Recommendation session was not found.');
      }
      return mapRecommendationSessionPayload(data);
    },

    async mutate(
      sessionId: string,
      action: 'lock' | 'unlock' | 'reorder' | 'replace' | 'add' | 'delete' | 'regenerate' | 'confirm',
      payload: Record<string, unknown>,
    ): Promise<RecommendationSessionSnapshot> {
      if (sessionId.trim() === '') throw malformed('A session ID is required.');
      const { data, error } = await client.rpc('apply_recommendation_session_mutation', {
        p_session_id: sessionId,
        p_action: action,
        p_payload: payload,
      });
      if (error) throw mapEditError(error);
      return mapRecommendationSessionPayload(data);
    },
  };
}

export const recommendationSessionRepository = createRecommendationSessionRepository();
