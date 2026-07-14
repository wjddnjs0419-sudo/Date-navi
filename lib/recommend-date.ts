import { supabase } from './supabase';
import type { AppLanguage } from './i18n';
import type { StructuredCourseInput } from './course-draft';
import {
  recommendDateResponseSchema,
  recommendationRequestSchema,
  validateRecommendDateResponseForRequest,
  type RecommendDateCard,
  type RecommendationRequest,
} from '../shared/recommendation/schemas';

export function buildRecommendationRequest(
  courseDraft: StructuredCourseInput,
  requestId: string,
  language: AppLanguage,
): RecommendationRequest {
  return recommendationRequestSchema.parse({
    ...courseDraft,
    requestId,
    mode: 'course',
    language,
  });
}

export async function requestRecommendationCards(
  request: RecommendationRequest,
): Promise<RecommendDateCard[]> {
  const response = await requestRecommendationResponse(request);
  return response.cards;
}

export async function requestRecommendationResponse(
  request: RecommendationRequest,
  options: { signal?: AbortSignal } = {},
): Promise<import('../shared/recommendation/schemas').RecommendDateResponse> {
  if (typeof supabase.rpc === 'function') {
    const { error: consentError } = await supabase.rpc('record_ai_data_processing_consent');
    if (consentError) throw consentError;
  }
  const { data, error } = await supabase.functions.invoke('recommend-date', {
    body: request,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (error) throw error;

  const response = recommendDateResponseSchema.parse(data);
  validateRecommendDateResponseForRequest(request, response);
  return response;
}
