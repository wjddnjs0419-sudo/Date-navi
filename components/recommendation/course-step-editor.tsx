import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Coffee, Footprints, Palette, Utensils, Wine, Zap, Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { C, R, SP } from '../../constants/theme';
import {
  COURSE_CATEGORIES,
  type CourseCategory,
  type CourseDraftStep,
} from '../../lib/course-draft';
import {
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
  onToggleStep,
  language,
  t,
}: Props) {
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
                  activeOpacity={0.72}
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
          const showAutoExpandHint = steps.length < 3;
          return (
            <View key={step.id} style={[styles.stepCard, expanded && styles.stepCardExpanded]}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={t('course.accessibility.step', { number: index + 1 })}
                activeOpacity={0.72}
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
                    {getCoursePreferenceOptions(step.category, language).map((option) => {
                      const selected = option.value
                        ? step.intentTags?.[0] === option.value
                        : !step.intentTags?.length;
                      const optionKey = option.value ?? '아무거나';
                      return (
                        <TouchableOpacity
                          key={optionKey}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={option.label}
                          activeOpacity={0.72}
                          onPress={() => onSelectPreference(step.id, option.value)}
                          style={[styles.preferenceChip, selected && styles.preferenceChipSelected]}
                          testID={`course-preference-${step.category}-${optionKey}`}
                        >
                          <Text style={[styles.preferenceText, selected && styles.preferenceTextSelected]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {showAutoExpandHint && <Text testID={`course-preference-auto-expand-${step.id}`} style={styles.preferenceHelper}>{t('course.preferences.autoExpand')}</Text>}
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
  categoryRow: { flexDirection: 'row', gap: SP.xl },
  categoryChip: {
    flex: 1, minHeight: 34, borderRadius: R.md, backgroundColor: C.white,
    borderWidth: 1.5, borderColor: C.pinkBorder, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 4, paddingHorizontal: 6,
  },
  categoryChipSelected: { backgroundColor: C.pinkLight, borderColor: C.pink },
  categoryLabel: { fontSize: 12, color: C.textSub, fontWeight: '600' },
  categoryLabelSelected: { color: C.pinkDeep },
  stepList: { gap: SP.sm },
  stepCard: { backgroundColor: C.white, borderRadius: R.card, borderWidth: 1, borderColor: C.borderLight, overflow: 'hidden' },
  stepCardExpanded: { borderColor: C.pink, backgroundColor: C.pinkLight },
  stepRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingHorizontal: SP.md },
  stepNumber: { width: 16, color: C.pinkDeep, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  stepLabel: { color: C.text, fontSize: 14, fontWeight: '700' },
  stepSummary: { flex: 1, textAlign: 'right', color: C.textSub, fontSize: 12 },
  preferenceBody: { paddingHorizontal: SP.md, paddingBottom: SP.md, gap: SP.sm },
  preferenceQuestion: { color: C.text, fontSize: 13, fontWeight: '700' },
  preferenceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  preferenceChip: { minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: C.pinkBorder, backgroundColor: C.white, justifyContent: 'center', paddingHorizontal: SP.md },
  preferenceChipSelected: { backgroundColor: C.pink, borderColor: C.pink },
  preferenceText: { color: C.pinkDeep, fontSize: 12, fontWeight: '600' },
  preferenceTextSelected: { color: C.white },
  preferenceHelper: { color: C.textMuted, fontSize: 11 },
  tipText: { color: C.textMuted, fontSize: 11, lineHeight: 18, textAlign: 'center' },
});
