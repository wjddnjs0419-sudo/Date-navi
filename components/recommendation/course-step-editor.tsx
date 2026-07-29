import { type Dispatch, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowDown, ArrowUp, MapPin, Search, Trash2, X } from 'lucide-react-native';
import { C, R, SP } from '../../constants/theme';
import {
  CATEGORY_ICONS,
  COURSE_CATEGORIES,
  type CourseCategory,
  type CourseDraftAction,
  type CourseDraftStep,
} from '../../lib/course-draft';
import {
  getStepIntentTagSuggestions,
} from '../../shared/recommendation/step-intent-tag-catalog';

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
  suggestions,
  onAddSuggestedTag,
  onRemoveSuggestedTag,
  t,
}: {
  step: CourseDraftStep;
  index: number;
  total: number;
  categoryLabels: Record<CourseCategory, string>;
  dispatch: Dispatch<CourseDraftAction>;
  onRequestPick: (stepId: string) => void;
  suggestions?: readonly string[];
  onAddSuggestedTag?: (tag: string) => Promise<void> | void;
  onRemoveSuggestedTag?: (tag: string) => Promise<void> | void;
  t: Translate;
}) {
  const [mode, setMode] = useState<'ai' | 'pick'>(step.pin ? 'pick' : 'ai');
  const [customTag, setCustomTag] = useState('');

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

  const selectedTags = step.intentTags ?? [];
  const visibleSuggestions = [...new Set([
    ...selectedTags,
    ...(suggestions ?? getStepIntentTagSuggestions(step.category)),
  ])];
  const canAddTag = true;

  function addCustomTag() {
    const tag = customTag.trim();
    if (!tag || !canAddTag) return;
    // The selected state is immediate; the reusable suggestion appears in its final slot after persistence.
    dispatch({ type: 'selectStepIntentTag', stepId: step.id, tag });
    void onAddSuggestedTag?.(tag);
    setCustomTag('');
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

      {mode === 'ai' && step.category !== 'ai_decide' && (
        <View style={styles.tagSection}>
          <Text style={styles.tagLabel}>{t('course.steps.tags.label')}</Text>
          <Text style={styles.tagHint}>{t('course.steps.tags.hint')}</Text>
          {visibleSuggestions.length > 0 && (
            <View style={styles.tagWrap}>
              {visibleSuggestions.map((tag) => (
                <View key={tag} style={styles.suggestionWithRemove}>
                  {(() => {
                    const selected = selectedTags.includes(tag);
                    return (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t('course.accessibility.addIntentTag', { tag: `#${tag}` })}
                    activeOpacity={0.72}
                    disabled={!selected && !canAddTag}
                    onPress={() => dispatch(selected
                      ? { type: 'removeStepIntentTag', stepId: step.id, tag }
                      : { type: 'selectStepIntentTag', stepId: step.id, tag })}
                    style={[styles.suggestedTag, selected && styles.suggestedTagSelected, !selected && !canAddTag && styles.controlDisabled]}
                    testID={`course-step-tag-suggestion-${tag}`}
                  >
                    <Text style={[styles.suggestedTagText, selected && styles.suggestedTagTextSelected]}>#{tag}</Text>
                  </TouchableOpacity>
                    );
                  })()}
                  {onRemoveSuggestedTag && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t('course.accessibility.removeSuggestedIntentTag', { tag: `#${tag}` })}
                      activeOpacity={0.72}
                      onPress={() => { void onRemoveSuggestedTag(tag); }}
                      style={styles.suggestionRemove}
                      testID={`course-step-suggestion-remove-${tag}`}
                    >
                      <X size={10} color={C.white} strokeWidth={3} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}
          <View style={styles.tagAddRow}>
            <TextInput
              accessibilityLabel={t('course.accessibility.customIntentTag')}
              value={customTag}
              onChangeText={setCustomTag}
              placeholder={t('course.steps.tags.placeholder')}
              placeholderTextColor={C.textFaint}
              maxLength={40}
              editable={canAddTag}
              onSubmitEditing={addCustomTag}
              returnKeyType="done"
              style={styles.tagInput}
              testID="course-step-tag-input"
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('course.accessibility.addCustomIntentTag')}
              activeOpacity={0.72}
              disabled={!canAddTag || !customTag.trim()}
              onPress={addCustomTag}
              style={[styles.tagAddButton, (!canAddTag || !customTag.trim()) && styles.controlDisabled]}
              testID="course-step-tag-add"
            >
              <Text style={styles.tagAddButtonText}>{t('course.steps.tags.add')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
  tagSection: { gap: SP.xs, paddingTop: SP.xs },
  tagLabel: { fontSize: 13, color: C.text, fontWeight: '700' },
  tagHint: { fontSize: 11, color: C.textMuted },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs },
  suggestionWithRemove: { position: 'relative' },
  selectedTag: {
    minHeight: 34,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SP.sm, borderRadius: 999,
    backgroundColor: C.pinkLight, borderWidth: 1, borderColor: C.pinkBorder,
  },
  selectedTagText: { fontSize: 12, color: C.pinkDeep, fontWeight: '700' },
  suggestedTag: {
    minHeight: 34, justifyContent: 'center', paddingHorizontal: SP.sm,
    borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  suggestedTagSelected: { borderColor: C.pinkBorder, backgroundColor: C.pinkLight },
  suggestedTagText: { fontSize: 12, color: C.textSub, fontWeight: '600' },
  suggestedTagTextSelected: { color: C.pinkDeep },
  suggestionRemove: {
    position: 'absolute', top: -5, right: -5, zIndex: 1,
    width: 17, height: 17, alignItems: 'center', justifyContent: 'center',
    borderRadius: 9, backgroundColor: C.textMuted,
  },
  tagAddRow: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  tagInput: {
    flex: 1, minHeight: 42, paddingHorizontal: SP.sm,
    borderRadius: R.sm, backgroundColor: C.gray, color: C.text, fontSize: 13,
  },
  tagAddButton: {
    minHeight: 42, justifyContent: 'center', paddingHorizontal: SP.md,
    borderRadius: R.sm, backgroundColor: C.pinkDeep,
  },
  tagAddButtonText: { fontSize: 13, color: C.white, fontWeight: '700' },
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
