import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Coffee, Footprints, Palette, Utensils, Wine, Zap, Check, ChevronDown, ChevronUp, X } from '../iconography';
import { InputField } from '../ui';
import { C, DS, R, SP } from '../../constants/theme';
import {
  COURSE_CATEGORIES,
  type CourseCategory,
  type CourseDraftStep,
} from '../../lib/course-draft';
import { PERSONAL_STEP_TAG_LIMIT } from '../../lib/personal-step-tag-catalog';
import {
  canonicalizeStepIntentTag,
  getCoursePreferenceOptions,
  localizeStepIntentTag,
} from '../../shared/recommendation/step-intent-tag-catalog';
import type { RecommendationLanguage } from '../../shared/recommendation/contracts';

type Translate = (key: string, values?: Record<string, unknown>) => string;

type Props = {
  steps: readonly CourseDraftStep[];
  categoryLabels: Record<CourseCategory, string>;
  expandedStepId: string | null;
  onToggleCategory: (category: Exclude<CourseCategory, 'ai_decide'>) => void;
  onSelectPreference: (stepId: string, tag?: string) => void;
  onClearPreference?: (stepId: string) => void;
  suggestions?: readonly string[];
  personalTagCount?: number;
  personalTagLimit?: number;
  onAddSuggestedTag?: (tag: string) => void;
  onRemoveSuggestedTag?: (tag: string) => void;
  onToggleStep: (stepId: string) => void;
  language: RecommendationLanguage;
  t: Translate;
};

const selectableCategories = ['meal', 'cafe', 'walk', 'culture', 'activity', 'drinks'] as const satisfies readonly Exclude<CourseCategory, 'ai_decide'>[];

const ICONS = { meal: Utensils, cafe: Coffee, drinks: Wine, activity: Zap, culture: Palette, walk: Footprints } as const;

export function CourseStepEditor({
  steps,
  categoryLabels,
  expandedStepId,
  onToggleCategory,
  onSelectPreference,
  onClearPreference,
  suggestions = [],
  personalTagCount = 0,
  personalTagLimit = PERSONAL_STEP_TAG_LIMIT,
  onAddSuggestedTag,
  onRemoveSuggestedTag,
  onToggleStep,
  language,
  t,
}: Props) {
  const [customTags, setCustomTags] = useState<Record<string, string>>({});
  const [removedTags, setRemovedTags] = useState<Record<string, string[]>>({});
  const [temporaryTags, setTemporaryTags] = useState<Record<string, string>>({});

  return (
    <View style={styles.container}>
      <View style={styles.categoryGrid}>
        {[selectableCategories.slice(0, 3), selectableCategories.slice(3)].map((row, rowIndex) => (
          <View key={rowIndex} style={styles.categoryRow}>
            {row.map((category) => {
              const selected = steps.some((step) => step.category === category);
              const Icon = ICONS[category];
              return (
                <TouchableOpacity
                  key={category}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={categoryLabels[category]}
                  activeOpacity={0.88}
                  onPress={() => onToggleCategory(category)}
                  style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                  testID={`course-category-${category}`}
                >
                  {selected && <Check size={14} color={C.pinkDeep} strokeWidth={2.5} />}
                  <Icon size={18} color={selected ? C.pinkDeep : C.textSub} strokeWidth={2} />
                  <Text style={[styles.categoryLabel, selected && styles.categoryLabelSelected]}>
                    {categoryLabels[category]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {(expandedStepId !== null || steps.length > 1) && (
        <View style={styles.stepList}>
          {steps.map((step, index) => {
          const expanded = step.id === expandedStepId;
          const Icon = ICONS[step.category as Exclude<CourseCategory, 'ai_decide'>] ?? Zap;
          const selectedTag = step.intentTags?.[0];
          const summary = selectedTag ? localizeStepIntentTag(selectedTag, language) : t('course.preferences.anything');
          const preferenceOptions = getCoursePreferenceOptions(step.category, language);
          const anythingOption = preferenceOptions.find((option) => !option.value) ?? {
            ko: t('course.preferences.anything'), en: t('course.preferences.anything'), label: t('course.preferences.anything'),
          };
          const builtInTags = preferenceOptions.flatMap((option) => option.value ? [option.value] : []);
          const removedTagKeys = new Set(removedTags[step.category] ?? []);
          const temporaryTag = temporaryTags[step.id];
          const temporaryTagKey = temporaryTag ? canonicalizeStepIntentTag(temporaryTag).toLocaleLowerCase() : null;
          const visibleTags = Array.from(new Map(
            [...builtInTags, ...suggestions, ...(step.intentTags ?? [])]
              .map((tag) => [canonicalizeStepIntentTag(tag).toLocaleLowerCase(), tag] as const),
          ).entries()).filter(([tagKey]) => !removedTagKeys.has(tagKey) && tagKey !== temporaryTagKey).map(([, tag]) => tag);
          const customTag = customTags[step.id] ?? '';
          const clearTemporaryTag = () => {
            setTemporaryTags((current) => {
              if (!(step.id in current)) return current;
              const next = { ...current };
              delete next[step.id];
              return next;
            });
          };
          const addCustomTag = () => {
            const tag = canonicalizeStepIntentTag(customTag);
            if (!tag) return;
            const tagKey = tag.toLocaleLowerCase();
            const isAlreadyReusable = visibleTags.some((candidate) => (
              canonicalizeStepIntentTag(candidate).toLocaleLowerCase() === tagKey
            ));
            const isAtLimit = personalTagCount >= personalTagLimit;
            onSelectPreference(step.id, tag);
            onAddSuggestedTag?.(tag);
            setTemporaryTags((current) => {
              const next = { ...current };
              if (isAtLimit && !isAlreadyReusable) next[step.id] = tag;
              else delete next[step.id];
              return next;
            });
            setRemovedTags((current) => ({
              ...current,
              [step.category]: (current[step.category] ?? []).filter((removedTag) => removedTag !== tagKey),
            }));
            setCustomTags((current) => ({ ...current, [step.id]: '' }));
          };
          return (
            <View key={step.id} testID={`course-step-card-${step.id}`} style={[styles.stepCard, expanded && styles.stepCardExpanded]}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={t('course.accessibility.step', { number: index + 1 })}
                activeOpacity={0.88}
                onPress={() => onToggleStep(step.id)}
                style={styles.stepRow}
                testID={`course-step-row-${step.id}`}
              >
                <Text style={styles.stepNumber}>{index + 1}</Text>
                <Icon size={18} color={expanded ? C.pinkDeep : C.textSub} strokeWidth={2} />
                <Text style={styles.stepLabel}>{categoryLabels[step.category]}</Text>
                {!expanded && <Text testID={`course-step-preference-${step.id}`} style={styles.stepSummary} numberOfLines={1}>{summary}</Text>}
                {expanded
                  ? <ChevronUp size={18} color={C.textSub} strokeWidth={2} />
                  : <ChevronDown size={18} color={C.textSub} strokeWidth={2} />}
              </TouchableOpacity>

              {expanded && (
                <View style={styles.preferenceBody}>
                  <Text style={styles.preferenceQuestion}>{t(`course.preferences.question.${step.category}`)}</Text>
                  <View style={styles.preferenceWrap}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityState={{ selected: !step.intentTags?.length }}
                      accessibilityLabel={anythingOption.label}
                      activeOpacity={0.88}
                      onPress={() => { clearTemporaryTag(); onSelectPreference(step.id, undefined); }}
                      style={[styles.preferenceChip, !step.intentTags?.length && styles.preferenceChipSelected]}
                      testID={`course-preference-${step.category}-아무거나`}
                    >
                      <Text style={[styles.preferenceText, !step.intentTags?.length && styles.preferenceTextSelected]}>
                        {anythingOption.label}
                      </Text>
                    </TouchableOpacity>
                    {visibleTags.map((tag) => {
                      const selected = step.intentTags?.[0] === tag;
                      const label = localizeStepIntentTag(tag, language);
                      return (
                        <View key={tag} style={styles.preferenceChipGroup}>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={label}
                            activeOpacity={0.88}
                            onPress={() => { clearTemporaryTag(); onSelectPreference(step.id, tag); }}
                            style={[styles.preferenceChip, selected && styles.preferenceChipSelected]}
                            testID={`course-preference-${step.category}-${tag}`}
                          >
                            <Text style={[styles.preferenceText, selected && styles.preferenceTextSelected]}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                          {onRemoveSuggestedTag && (
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={t('course.accessibility.removeSuggestedIntentTag', { tag: label })}
                              activeOpacity={0.88}
                              onPress={() => {
                                if (selected) onClearPreference?.(step.id);
                                const tagKey = canonicalizeStepIntentTag(tag).toLocaleLowerCase();
                                setRemovedTags((current) => ({
                                  ...current,
                                  [step.category]: Array.from(new Set([...(current[step.category] ?? []), tagKey])),
                                }));
                                onRemoveSuggestedTag(tag);
                              }}
                              style={styles.removeSuggestionButton}
                              testID={`course-preference-remove-${step.category}-${tag}`}
                            >
                              <View pointerEvents="none" style={styles.removeSuggestionIcon}>
                                <X size={14} color={C.text} strokeWidth={2.2} />
                              </View>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.customTagRow}>
                    <InputField
                      value={customTag}
                      placeholder={t('course.steps.tags.placeholder')}
                      onChangeText={(value) => setCustomTags((current) => ({ ...current, [step.id]: value }))}
                      onSubmitEditing={addCustomTag}
                      returnKeyType="done"
                      maxLength={40}
                      accessibilityLabel={t('course.accessibility.customIntentTag')}
                      style={styles.customTagInput}
                      testID={`course-preference-input-${step.id}`}
                    />
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t('course.accessibility.addCustomIntentTag')}
                      activeOpacity={0.88}
                      disabled={!customTag.trim()}
                      onPress={addCustomTag}
                      style={[styles.addTagButton, !customTag.trim() && styles.addTagButtonDisabled]}
                      testID={`course-preference-add-${step.id}`}
                    >
                      <Text style={[styles.addTagButtonText, !customTag.trim() && styles.addTagButtonTextDisabled]}>
                        {t('course.steps.tags.add')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {(personalTagCount >= personalTagLimit || temporaryTag) && (
                    <View testID={`course-preference-limit-${step.id}`} style={styles.limitNote}>
                      <Text style={styles.limitNoteText}>
                        {t('course.steps.tags.limit', { count: personalTagCount, max: personalTagLimit })}
                      </Text>
                      {temporaryTag && (
                        <Text testID={`course-preference-temporary-${step.id}`} style={styles.temporaryTagText}>
                          {t('course.steps.tags.temporary', { tag: localizeStepIntentTag(temporaryTag, language) })}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
          })}
        </View>
      )}
      {steps.length < 3 && <Text testID="course-step-tip" style={styles.tipText}>{t('course.preferences.tip')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SP.md },
  categoryGrid: { gap: SP.md },
  categoryRow: { flexDirection: 'row', gap: SP.xxl },
  categoryChip: {
    flex: 1, minHeight: DS.component.compactControlHeight, borderRadius: DS.radius.input, backgroundColor: C.white,
    borderWidth: 1.5, borderColor: C.pinkBorder, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: DS.spacing.xs, paddingHorizontal: SP.xs + DS.spacing.micro,
  },
  categoryChipSelected: { backgroundColor: C.pinkLight, borderColor: C.pink },
  categoryLabel: { ...DS.typography.bodySmall, color: C.textSub, fontWeight: '600' },
  categoryLabelSelected: { color: C.pinkDeep },
  stepList: { gap: SP.sm },
  stepCard: { backgroundColor: C.white, borderRadius: DS.radius.card, borderWidth: 1, borderColor: C.borderLight, overflow: 'hidden' },
  stepCardExpanded: { borderColor: C.pink, backgroundColor: C.white },
  stepRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingHorizontal: SP.md },
  stepNumber: { width: 16, ...DS.typography.bodyCompact, color: C.pinkDeep, fontWeight: '700', textAlign: 'center' },
  stepLabel: { ...DS.typography.body, color: C.text, fontWeight: '700' },
  stepSummary: { flex: 1, textAlign: 'right', ...DS.typography.bodySmall, color: C.textSub },
  preferenceBody: { paddingHorizontal: SP.md, paddingBottom: SP.md, gap: SP.sm },
  preferenceQuestion: { ...DS.typography.bodyCompact, color: C.text, fontWeight: '700' },
  preferenceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  preferenceChipGroup: { position: 'relative' },
  preferenceChip: { minHeight: SP.touch, borderRadius: DS.radius.chip, borderWidth: 1, borderColor: C.pinkBorder, backgroundColor: C.white, justifyContent: 'center', paddingHorizontal: SP.md },
  preferenceChipSelected: { backgroundColor: C.pinkLight, borderColor: C.pink, borderWidth: 1.5 },
  preferenceText: { ...DS.typography.bodySmall, color: C.pinkDeep, fontWeight: '600' },
  preferenceTextSelected: { color: C.pinkDeep },
  removeSuggestionButton: { position: 'absolute', top: -SP.lg, right: -SP.lg, width: SP.touch, height: SP.touch, alignItems: 'center', justifyContent: 'center' },
  removeSuggestionIcon: { width: DS.spacing.xxl, height: DS.spacing.xxl, borderRadius: DS.radius.full, backgroundColor: C.closeSurface, alignItems: 'center', justifyContent: 'center' },
  customTagRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  customTagInput: { flex: 1 },
  limitNote: { gap: SP.xs, paddingHorizontal: SP.sm, paddingVertical: SP.sm, borderRadius: DS.radius.input, backgroundColor: C.pinkLight },
  limitNoteText: { ...DS.typography.caption, color: C.pinkDeep },
  temporaryTagText: { ...DS.typography.caption, color: C.text, fontWeight: '700' },
  addTagButton: { minHeight: SP.touch, borderRadius: R.button, borderWidth: 1, borderColor: C.pinkBorder, backgroundColor: C.pinkLight, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP.md },
  addTagButtonDisabled: { backgroundColor: C.disabledBg, borderColor: C.borderLight },
  addTagButtonText: { ...DS.typography.buttonCompact, color: C.pinkDeep },
  addTagButtonTextDisabled: { color: C.textLight },
  tipText: { ...DS.typography.caption, color: C.textMuted, textAlign: 'center' },
});
