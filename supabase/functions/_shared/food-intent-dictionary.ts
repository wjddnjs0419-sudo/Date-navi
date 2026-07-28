import { GENERATED_FOOD_INTENTS } from './food-intents.generated.ts';
import { STEP_INTENT_DICTIONARY, type StepIntentDictionaryEntry } from './step-intent-dictionary.ts';

const generatedFoodEntries: StepIntentDictionaryEntry[] = GENERATED_FOOD_INTENTS.map((entry) => ({
  canonicalTerm: entry.canonicalTerm,
  intentType: 'dish',
  targetCategory: 'meal',
  expansions: [...entry.searchExpansions],
  koAliases: [...entry.aliases],
  enAliases: [],
  compatibleCategoryNameKeywords: [],
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
