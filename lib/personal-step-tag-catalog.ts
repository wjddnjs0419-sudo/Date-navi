import { getStepIntentTagSuggestions } from '../shared/recommendation/step-intent-tag-catalog';
import { supabase } from './supabase';

export const PERSONAL_STEP_TAG_CATEGORIES = ['meal', 'cafe', 'drinks', 'activity', 'culture', 'walk'] as const;
export type PersonalStepTagCategory = (typeof PERSONAL_STEP_TAG_CATEGORIES)[number];

export type PersonalStepIntentTag = {
  id: string;
  category: PersonalStepTagCategory;
  tag: string;
  normalizedTag: string;
};

export type HiddenStepIntentDefault = {
  category: PersonalStepTagCategory;
  tag: string;
  normalizedTag: string;
};

export function normalizeStepIntentTag(tag: string): string {
  return tag.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function uniqueTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const normalized = normalizeStepIntentTag(tag);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function mergePersonalStepTagCatalog(
  category: PersonalStepTagCategory,
  shipped: readonly string[],
  personal: readonly PersonalStepIntentTag[],
  hidden: readonly HiddenStepIntentDefault[],
): string[] {
  const hiddenKeys = new Set(hidden
    .filter((entry) => entry.category === category)
    .map((entry) => entry.normalizedTag));
  return uniqueTags([
    ...shipped.filter((tag) => !hiddenKeys.has(normalizeStepIntentTag(tag))),
    ...personal.filter((entry) => entry.category === category).map((entry) => entry.tag),
  ]);
}

export function defaultSuggestionsForPersonalCatalog(category: PersonalStepTagCategory): readonly string[] {
  return getStepIntentTagSuggestions(category).map((suggestion) => suggestion.value);
}

type TagRow = { id: string; category: PersonalStepTagCategory; tag: string; normalized_tag: string };
type HiddenRow = { category: PersonalStepTagCategory; tag: string; normalized_tag: string };

const toPersonal = (row: TagRow): PersonalStepIntentTag => ({
  id: row.id, category: row.category, tag: row.tag, normalizedTag: row.normalized_tag,
});
const toHidden = (row: HiddenRow): HiddenStepIntentDefault => ({
  category: row.category, tag: row.tag, normalizedTag: row.normalized_tag,
});

export async function loadPersonalStepTagCatalog(userId: string): Promise<{
  personal: PersonalStepIntentTag[];
  hidden: HiddenStepIntentDefault[];
}> {
  const [personalResult, hiddenResult] = await Promise.all([
    supabase.from('personal_step_intent_tags').select('id, category, tag, normalized_tag').eq('user_id', userId),
    supabase.from('personal_hidden_step_intent_defaults').select('category, tag, normalized_tag').eq('user_id', userId),
  ]);
  if (personalResult.error) throw personalResult.error;
  if (hiddenResult.error) throw hiddenResult.error;
  return {
    personal: ((personalResult.data ?? []) as TagRow[]).map(toPersonal),
    hidden: ((hiddenResult.data ?? []) as HiddenRow[]).map(toHidden),
  };
}

export async function addPersonalStepTag(userId: string, category: PersonalStepTagCategory, rawTag: string): Promise<void> {
  const tag = rawTag.trim().replace(/\s+/g, ' ');
  const normalizedTag = normalizeStepIntentTag(tag);
  if (!tag || tag.length > 40) throw new Error('Invalid tag.');
  const { error: clearError } = await supabase.from('personal_hidden_step_intent_defaults')
    .delete().eq('user_id', userId).eq('category', category).eq('normalized_tag', normalizedTag);
  if (clearError) throw clearError;
  const { error } = await supabase.from('personal_step_intent_tags').upsert({
    user_id: userId, category, tag, normalized_tag: normalizedTag,
  }, { onConflict: 'user_id,category,normalized_tag' });
  if (error) throw error;
}

export async function removePersonalStepTag(id: string): Promise<void> {
  const { error } = await supabase.from('personal_step_intent_tags').delete().eq('id', id);
  if (error) throw error;
}

export async function hideShippedStepTag(userId: string, category: PersonalStepTagCategory, tag: string): Promise<void> {
  const normalizedTag = normalizeStepIntentTag(tag);
  const { error } = await supabase.from('personal_hidden_step_intent_defaults').upsert({
    user_id: userId, category, tag, normalized_tag: normalizedTag,
  }, { onConflict: 'user_id,category,normalized_tag' });
  if (error) throw error;
}
