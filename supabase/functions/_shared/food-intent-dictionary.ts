import { GENERATED_FOOD_INTENTS } from './food-intents.generated.ts';
import { STEP_INTENT_DICTIONARY, type StepIntentDictionaryEntry } from './step-intent-dictionary.ts';

const generatedFoodEntries: StepIntentDictionaryEntry[] = GENERATED_FOOD_INTENTS.map((entry) => ({
  canonicalTerm: entry.canonicalTerm,
  aliases: [...entry.aliases],
  searchExpansions: [...entry.searchExpansions],
  domain: entry.domain,
  intentType: entry.intentType,
  targetCategory: entry.targetCategory,
  categoryNameKeywords: [...entry.categoryNameKeywords],
  displayLabel: { ko: entry.canonicalTerm, en: entry.canonicalTerm },
}));

const curatedCanonicals = new Set(STEP_INTENT_DICTIONARY.map((entry) => entry.canonicalTerm));

/** Curated entries always win: generated records may extend, never overwrite them. */
export const ALL_STEP_INTENT_DICTIONARY: readonly StepIntentDictionaryEntry[] = [
  ...STEP_INTENT_DICTIONARY,
  ...generatedFoodEntries.filter((entry) => !curatedCanonicals.has(entry.canonicalTerm)),
];

export function getStepIntentDictionaryEntry(canonicalTerm: string): StepIntentDictionaryEntry | undefined {
  return ALL_STEP_INTENT_DICTIONARY.find((entry) => entry.canonicalTerm === canonicalTerm);
}

const normalizeForRetrieval = (value: string) => value.normalize('NFKC').toLocaleLowerCase();

/** Bounded fallback context: only generated foods explicitly mentioned in this request. */
export function retrieveGeneratedFoodIntents(freeText: string, limit = 20): StepIntentDictionaryEntry[] {
  const normalizedText = normalizeForRetrieval(freeText);
  if (!normalizedText) return [];
  return generatedFoodEntries
    .flatMap((entry) => {
      const canonicalMatch = normalizedText.includes(normalizeForRetrieval(entry.canonicalTerm));
      const aliasMatch = entry.aliases.some((alias) => normalizedText.includes(normalizeForRetrieval(alias)));
      return canonicalMatch || aliasMatch ? [{ entry, exactness: canonicalMatch ? 0 : 1 }] : [];
    })
    .sort((a, b) => a.exactness - b.exactness || a.entry.canonicalTerm.localeCompare(b.entry.canonicalTerm, 'ko-KR'))
    .slice(0, Math.min(limit, 20))
    .map(({ entry }) => entry);
}
