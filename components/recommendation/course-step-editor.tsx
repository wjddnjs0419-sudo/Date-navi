import type { Dispatch } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  ArrowDown, ArrowUp, Coffee, Footprints, Palette, Sparkles, Trash2, Utensils, Wine, Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { C, R, SP } from '../../constants/theme';
import {
  COURSE_CATEGORIES,
  type CourseCategory,
  type CourseDraftAction,
  type CourseDraftStep,
} from '../../lib/course-draft';

type Translate = (key: string, values?: Record<string, unknown>) => string;

const CATEGORY_ICONS: Record<CourseCategory, LucideIcon> = {
  meal: Utensils,
  cafe: Coffee,
  drinks: Wine,
  activity: Zap,
  culture: Palette,
  walk: Footprints,
  ai_decide: Sparkles,
};

function StepAction({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
  testID,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  icon: 'up' | 'down' | 'remove';
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.72}
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepAction, disabled && styles.controlDisabled]}
      testID={testID}
    >
      {icon === 'up' && <ArrowUp size={18} color={C.textSub} strokeWidth={2} />}
      {icon === 'down' && <ArrowDown size={18} color={C.textSub} strokeWidth={2} />}
      {icon === 'remove' && <Trash2 size={18} color={C.danger} strokeWidth={2} />}
    </TouchableOpacity>
  );
}

export function CourseStepEditor({
  step,
  index,
  total,
  categoryLabels,
  dispatch,
  t,
}: {
  step: CourseDraftStep;
  index: number;
  total: number;
  categoryLabels: Record<CourseCategory, string>;
  dispatch: Dispatch<CourseDraftAction>;
  t: Translate;
}) {
  return (
    <View style={styles.stepCard} testID="course-step">
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t('course.steps.stepLabel', { number: index + 1 })}</Text>
        <View style={styles.stepActions}>
          <StepAction
            accessibilityLabel={t('course.accessibility.moveStepUp')}
            disabled={index === 0}
            icon="up"
            onPress={() => dispatch({ type: 'moveStep', stepId: step.id, direction: 'up' })}
            testID="course-move-step-up"
          />
          <StepAction
            accessibilityLabel={t('course.accessibility.moveStepDown')}
            disabled={index === total - 1}
            icon="down"
            onPress={() => dispatch({ type: 'moveStep', stepId: step.id, direction: 'down' })}
            testID="course-move-step-down"
          />
          <StepAction
            accessibilityLabel={t('course.accessibility.removeStep')}
            disabled={total <= 2}
            icon="remove"
            onPress={() => dispatch({ type: 'removeStep', stepId: step.id })}
            testID="course-remove-step"
          />
        </View>
      </View>
      <View style={styles.categories}>
        {COURSE_CATEGORIES.map((category) => {
          const selected = step.category === category;
          const Icon = CATEGORY_ICONS[category];
          return (
            <TouchableOpacity
              key={category}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t('course.accessibility.category', {
                number: index + 1,
                category: categoryLabels[category],
              })}
              activeOpacity={0.72}
              onPress={() => dispatch({ type: 'setStepCategory', stepId: step.id, category })}
              style={[styles.category, selected && styles.categorySelected]}
            >
              <Icon size={18} color={selected ? C.pinkDeep : C.inkSoft} strokeWidth={2} />
              <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                {categoryLabels[category]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepCard: {
    gap: SP.md,
    padding: SP.md,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },
  stepTitle: { flex: 1, fontSize: 14, color: C.text, fontWeight: '700' },
  stepActions: { flexDirection: 'row', gap: SP.xs },
  stepAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.md,
    backgroundColor: C.gray,
  },
  controlDisabled: { opacity: 0.35 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  category: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SP.xs,
    paddingHorizontal: SP.sm,
    paddingVertical: SP.xs,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  categorySelected: { borderColor: C.pinkBorder, backgroundColor: C.pinkLight },
  categoryText: { fontSize: 10, color: C.inkSoft, fontWeight: '600' },
  categoryTextSelected: { color: C.pinkDeep },
});
