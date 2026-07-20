import { type Dispatch, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowDown, ArrowUp, MapPin, Search, Trash2 } from 'lucide-react-native';
import { C, R, SP } from '../../constants/theme';
import {
  CATEGORY_ICONS,
  COURSE_CATEGORIES,
  type CourseCategory,
  type CourseDraftAction,
  type CourseDraftStep,
} from '../../lib/course-draft';

type Translate = (key: string, values?: Record<string, unknown>) => string;

// 카테고리는 선택 사항. "AI가 결정"(ai_decide)은 상단 [AI 추천] 토글과 겹쳐 칩에서 제외하고,
// 실제 카테고리 칩을 다시 누르면 ai_decide로 해제한다.
const CATEGORY_CHIPS = COURSE_CATEGORIES.filter((category) => category !== 'ai_decide');

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
  onRequestPick,
  t,
}: {
  step: CourseDraftStep;
  index: number;
  total: number;
  categoryLabels: Record<CourseCategory, string>;
  dispatch: Dispatch<CourseDraftAction>;
  onRequestPick: (stepId: string) => void;
  t: Translate;
}) {
  const [mode, setMode] = useState<'ai' | 'pick'>(step.pin ? 'pick' : 'ai');

  function switchToAi() {
    // AI 추천 = AI가 장소를 고른다. 지정해둔 핀이 남으면 서버가 그 장소로 확정하므로 즉시 제거한다.
    if (step.pin) dispatch({ type: 'clearStepPin', stepId: step.id });
    setMode('ai');
  }

  function selectCategory(category: CourseCategory) {
    // 카테고리는 선택 사항: 이미 고른 칩을 다시 누르면 해제(ai_decide)해 AI가 종류까지 정하게 한다.
    // 핀과 공존하므로 카테고리 선택은 핀을 지우지 않는다.
    const next = step.category === category ? 'ai_decide' : category;
    dispatch({ type: 'setStepCategory', stepId: step.id, category: next });
  }

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

      <View style={styles.segment}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'ai' }}
          accessibilityLabel={t('course.steps.pin.aiTab')}
          activeOpacity={0.72}
          onPress={switchToAi}
          style={[styles.segmentBtn, mode === 'ai' && styles.segmentBtnOn]}
          testID="course-step-tab-ai"
        >
          <Text style={[styles.segmentText, mode === 'ai' && styles.segmentTextOn]}>
            {t('course.steps.pin.aiTab')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'pick' }}
          accessibilityLabel={t('course.steps.pin.pickTab')}
          activeOpacity={0.72}
          onPress={() => setMode('pick')}
          style={[styles.segmentBtn, mode === 'pick' && styles.segmentBtnOn]}
          testID="course-step-tab-pick"
        >
          <Text style={[styles.segmentText, mode === 'pick' && styles.segmentTextOn]}>
            {t('course.steps.pin.pickTab')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.categories}>
        {CATEGORY_CHIPS.map((category) => {
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
              onPress={() => selectCategory(category)}
              style={[styles.category, selected && styles.categorySelected]}
              testID={`course-step-category-${category}`}
            >
              <Icon size={18} color={selected ? C.pinkDeep : C.inkSoft} strokeWidth={2} />
              <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                {categoryLabels[category]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {mode === 'pick' && (
        step.pin ? (
          <View style={styles.pinnedRow}>
            <MapPin size={18} color={C.textSub} strokeWidth={2} />
            <View style={styles.pinnedInfo}>
              <Text style={styles.pinnedName} numberOfLines={1}>{step.pin.name}</Text>
              {step.pin.address ? (
                <Text style={styles.pinnedAddress} numberOfLines={1}>{step.pin.address}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('course.steps.pin.clear')}
              activeOpacity={0.72}
              onPress={() => dispatch({ type: 'clearStepPin', stepId: step.id })}
              style={styles.pinnedClear}
              testID="course-step-pin-clear"
            >
              <Text style={styles.pinnedClearText}>{t('course.steps.pin.clear')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('course.steps.pin.searchEntry')}
            activeOpacity={0.72}
            onPress={() => onRequestPick(step.id)}
            style={styles.pickEntry}
            testID="course-step-pick-entry"
          >
            <Search size={18} color={C.textSub} strokeWidth={2} />
            <Text style={styles.pickEntryText}>{t('course.steps.pin.searchEntry')}</Text>
          </TouchableOpacity>
        )
      )}
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
  segment: { flexDirection: 'row', backgroundColor: C.gray, borderRadius: R.md, padding: 3, gap: 3 },
  segmentBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  segmentBtnOn: { backgroundColor: C.white },
  segmentText: { fontSize: 12, fontWeight: '700', color: C.inkSoft },
  segmentTextOn: { color: C.pinkDeep },
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
  pickEntry: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    paddingHorizontal: SP.md,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  pickEntryText: { fontSize: 13, color: C.textSub, fontWeight: '600' },
  pinnedRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  pinnedInfo: { flex: 1, gap: 2 },
  pinnedName: { fontSize: 13, color: C.text, fontWeight: '700' },
  pinnedAddress: { fontSize: 11, color: C.textMuted },
  pinnedClear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SP.sm },
  pinnedClearText: { fontSize: 12, color: C.textSub, fontWeight: '700' },
});
