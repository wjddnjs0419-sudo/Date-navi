import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addPersonalStepTag,
  defaultSuggestionsForPersonalCatalog,
  hideShippedStepTag,
  loadPersonalStepTagCatalog,
  mergePersonalStepTagCatalog,
  normalizeStepIntentTag,
  removePersonalStepTag,
  type HiddenStepIntentDefault,
  type PersonalStepIntentTag,
  type PersonalStepTagCategory,
} from '../../lib/personal-step-tag-catalog';
import { supabase } from '../../lib/supabase';

const isPersonalCategory = (category: string): category is PersonalStepTagCategory => (
  ['meal', 'cafe', 'drinks', 'activity', 'culture', 'walk'].includes(category)
);

export function usePersonalStepTagCatalog() {
  const [userId, setUserId] = useState<string>();
  const [personal, setPersonal] = useState<PersonalStepIntentTag[]>([]);
  const [hidden, setHidden] = useState<HiddenStepIntentDefault[]>([]);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const data = await loadPersonalStepTagCatalog(user.id);
    setPersonal(data.personal);
    setHidden(data.hidden);
  }, []);

  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`personal-step-tags-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_step_intent_tags', filter: `user_id=eq.${userId}` }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_hidden_step_intent_defaults', filter: `user_id=eq.${userId}` }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, userId]);

  const suggestionsFor = useCallback((category: string): string[] => {
    if (!isPersonalCategory(category)) return [];
    return mergePersonalStepTagCatalog(category, defaultSuggestionsForPersonalCatalog(category), personal, hidden);
  }, [hidden, personal]);

  const addSuggestion = useCallback(async (category: string, tag: string) => {
    if (!userId || !isPersonalCategory(category)) return;
    await addPersonalStepTag(userId, category, tag);
    await refresh();
  }, [refresh, userId]);
  const removeSuggestion = useCallback(async (category: string, tag: string) => {
    if (!userId || !isPersonalCategory(category)) return;
    const normalized = normalizeStepIntentTag(tag);
    const personalRow = personal.find((row) => row.category === category && row.normalizedTag === normalized);
    if (personalRow) await removePersonalStepTag(personalRow.id);
    else await hideShippedStepTag(userId, category, tag);
    await refresh();
  }, [personal, refresh, userId]);

  return useMemo(() => ({ suggestionsFor, addSuggestion, removeSuggestion }), [addSuggestion, removeSuggestion, suggestionsFor]);
}
