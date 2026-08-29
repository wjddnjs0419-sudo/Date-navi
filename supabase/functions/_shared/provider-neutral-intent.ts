import type { NormalizedPlace } from './place-provider.ts';
import { normalizeRecommendationCategory } from './recommendation-category.ts';
import { placeMatchesStepIntent, type ParsedStepIntent } from './step-intent.ts';

const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase();

export type ProviderNeutralIntentMatchOptions = {
  allowProviderSearchEvidence?: boolean;
};

export type ProviderNeutralIntentEvidenceSource = 'provider_metadata' | 'provider_search';

/**
 * Provider-neutral candidates do not use the Kakao PlaceCandidate evidence shape.
 * Keep metadata proof and provider-search relevance as separate evidence sources
 * so callers can opt into search evidence without changing legacy strict gates.
 */
export function providerNeutralStepIntentEvidenceSource(
  place: NormalizedPlace,
  intent: ParsedStepIntent,
  options: ProviderNeutralIntentMatchOptions = {},
): ProviderNeutralIntentEvidenceSource | undefined {
  const metadataMatches = placeMatchesStepIntent({
    name: place.name,
    categoryName: place.category.providerRaw ?? '',
    matchedSearchEvidence: [],
  }, intent);
  if (metadataMatches) return 'provider_metadata';
  if (options.allowProviderSearchEvidence && providerNeutralStepIntentSearchLevel(place, intent) === 0) {
    return 'provider_search';
  }
  return undefined;
}

export function providerNeutralPlaceMatchesStepIntent(
  place: NormalizedPlace,
  intent: ParsedStepIntent,
  options: ProviderNeutralIntentMatchOptions = {},
): boolean {
  return providerNeutralStepIntentEvidenceSource(place, intent, options) !== undefined;
}

/**
 * Search evidence is usable as a soft preference signal, but never as proof
 * for a hard intent. Return the first matching search-term level so callers
 * can give exact queries more weight than broadened queries.
 */
export function providerNeutralStepIntentSearchLevel(
  place: NormalizedPlace,
  intent: ParsedStepIntent,
): 0 | 1 | 2 | undefined {
  const canonicalTerm = normalize(intent.canonicalTerm);
  const searchTerms = [canonicalTerm, ...intent.kakaoSearchTerms.map(normalize).filter((term) => term !== canonicalTerm)].slice(0, 3);
  const matchedLevel = searchTerms.findIndex((term) => term.length > 0 && place.evidence.searchTerms.some((searched) => (
    normalize(searched).includes(term)
  )));
  return matchedLevel >= 0 ? matchedLevel as 0 | 1 | 2 : undefined;
}

export function providerNeutralStepIntentPreferenceScore(
  place: NormalizedPlace,
  intents: readonly ParsedStepIntent[],
): number {
  return intents.reduce((best, intent) => {
    const level = providerNeutralStepIntentSearchLevel(place, intent);
    if (level === undefined) return best;
    return Math.max(best, level === 0 ? 20 : level === 1 ? 12 : 6);
  }, 0);
}

export function providerNeutralPlaceMatchesStepCategory(
  place: NormalizedPlace,
  category: string,
): boolean {
  const normalized = normalizeRecommendationCategory(category);
  // Provider category metadata is evidence, not a hard rejection gate. A place
  // whose provider category is unknown may still satisfy any requested step;
  // only a known, incompatible category is excluded.
  if (normalized === 'drinks' && place.category.normalized === 'meal') return true;
  return normalized === 'ai_decide'
    || place.category.normalized === 'unknown'
    || place.category.normalized === normalized;
}

export function providerNeutralPlaceMatchesStep(
  place: NormalizedPlace,
  step: { category: string },
  intent: ParsedStepIntent | undefined,
  options: ProviderNeutralIntentMatchOptions = {},
): boolean {
  return providerNeutralPlaceMatchesStepCategory(place, step.category)
    && (!intent || providerNeutralPlaceMatchesStepIntent(place, intent, options));
}
