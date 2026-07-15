import { RecommendationSessionCacheError } from '../lib/recommendation-session-cache';
import { isPreparedRequestExpiredError } from '../lib/recommend-date';

describe('prepared recommendation request expiry classification', () => {
  it('identifies a missing in-memory prepared request as an expired request', () => {
    const error = new RecommendationSessionCacheError(
      'missing_prepared_request',
      'The prepared recommendation request is no longer in memory.',
    );

    expect(isPreparedRequestExpiredError(error)).toBe(true);
  });

  it('does not classify other cache error codes as an expired request', () => {
    const error = new RecommendationSessionCacheError('identity_mismatch', 'Cached request identity does not match the route.');

    expect(isPreparedRequestExpiredError(error)).toBe(false);
  });

  it('does not classify unrelated errors as an expired request', () => {
    expect(isPreparedRequestExpiredError(new Error('network down'))).toBe(false);
  });
});
