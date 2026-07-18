import type { RecommendationRequest } from '../shared/recommendation/contracts';

/**
 * Drops one-shot mutation fields from a persisted request before reusing it as
 * the base of a new recommendation call. `latest_request` written by a replace
 * mutation used to carry `replacement`; spreading it into a later add/regenerate
 * request pushed recommend-date into its replacement branch and failed with 422.
 * The server now also strips this at persist time — this is client-side defense.
 */
export function omitOneShotRequestFields(request: RecommendationRequest): Omit<RecommendationRequest, 'replacement'> {
  const { replacement: _oneShotReplacement, ...standing } = request;
  return standing;
}
