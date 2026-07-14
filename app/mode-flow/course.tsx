import { useMemo, useReducer, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { BackBar, Badge, BigButton, OptionCardPicker } from '../../components/ui';
import { CourseStepEditor } from '../../components/recommendation/course-step-editor';
import { LocationSelector } from '../../components/recommendation/location-selector';
import { C, R, SP } from '../../constants/theme';
import {
  COURSE_CATEGORIES,
  COURSE_MOODS,
  courseDraftReducer,
  createInitialCourseDraft,
  parseCoursePreferences,
  validateCourseDraft,
  type CourseCategory,
  type CourseDraftIssue,
  type WalkingLimit,
} from '../../lib/course-draft';
import { useI18n } from '../../lib/i18n';
import { buildCourseInput } from '../../lib/modeForm';
import { buildRecommendationRequest } from '../../lib/recommend-date';
import { createRecommendationRequestId } from '../../lib/recommendationIdentity';
import { buildStructuredGeneratingParams } from '../../lib/recommendation-route';
import { useRecommendationSessionStore } from '../../components/recommendation/recommendation-session-provider';

const DURATIONS = [
  { value: '2-3h', labelKey: 'course.duration.options.twoThreeHours' },
  { value: 'half_day', labelKey: 'course.duration.options.halfDay' },
  { value: 'full_day', labelKey: 'course.duration.options.fullDay' },
] as const;

const WALKING_OPTIONS: { value: WalkingLimit; labelKey: string }[] = [
  { value: 5, labelKey: 'course.walking.options.five' },
  { value: 10, labelKey: 'course.walking.options.ten' },
  { value: 20, labelKey: 'course.walking.options.twenty' },
  { value: undefined, labelKey: 'course.walking.options.any' },
];

type Translate = (key: string, values?: Record<string, unknown>) => string;

function issueMessage(
  issue: CourseDraftIssue,
  categoryLabels: Record<CourseCategory, string>,
  t: Translate,
): string {
  if (issue.code === 'exclusion_conflict') {
    return t('course.validation.exclusion_conflict', {
      categories: issue.categories.map((category) => categoryLabels[category]).join(', '),
    });
  }
  return t(`course.validation.${issue.code}`);
}

export default function CourseScreen() {
  const router = useRouter();
  const { language, t } = useI18n();
  const { prepareRecommendationRequest } = useRecommendationSessionStore();
  const idSequence = useRef(0);
  const [draft, dispatch] = useReducer(
    courseDraftReducer,
    undefined,
    () => createInitialCourseDraft(() => `course-step-${++idSequence.current}`),
  );
  const [aiConsent, setAiConsent] = useState(false);
  const categoryLabels = useMemo(() => Object.fromEntries(
    COURSE_CATEGORIES.map((category) => [category, t(`course.steps.categories.${category}`)]),
  ) as Record<CourseCategory, string>, [t]);
  const parsedPreferences = useMemo(
    () => parseCoursePreferences(draft.additionalRequest),
    [draft.additionalRequest],
  );
  const validation = useMemo(() => validateCourseDraft(draft), [draft]);

  function addStep() {
    dispatch({
      type: 'addStep',
      step: { id: `course-step-${++idSequence.current}`, category: 'ai_decide' },
    });
  }

  function handleGenerate() {
    if (!validation.valid) return;
    if (!aiConsent) return;
    const input = buildCourseInput({ draft, categoryLabels });
    if (!input.courseDraft) return;
    const request = buildRecommendationRequest(
      input.courseDraft,
      createRecommendationRequestId(),
      language,
    );
    prepareRecommendationRequest(request);
    router.replace({
      pathname: '/mode-flow/generating',
      params: buildStructuredGeneratingParams(request.requestId),
    } as any);
  }

  const hasPreview = Object.keys(parsedPreferences).length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar largeTouchTarget />
        <View style={styles.header}>
          <Text style={styles.modeLabel}>{t('course.modeLabel')}</Text>
          <Text style={styles.title}>{t('course.title')}</Text>
          <Text style={styles.subtitle}>{t('course.subtitle')}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingWrap}>
              <Text style={styles.sectionLabel}>{t('course.steps.label')}</Text>
              <Text style={styles.hint}>{t('course.steps.hint')}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('course.accessibility.addStep')}
              activeOpacity={0.72}
              disabled={draft.steps.length >= 4}
              onPress={addStep}
              style={[styles.addButton, draft.steps.length >= 4 && styles.controlDisabled]}
              testID="course-add-step"
            >
              <Plus size={18} color={C.pinkDeep} strokeWidth={2.5} />
              <Text style={styles.addButtonText}>{t('course.steps.add')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.stepList}>
            {draft.steps.map((step, index) => (
              <CourseStepEditor
                key={step.id}
                step={step}
                index={index}
                total={draft.steps.length}
                categoryLabels={categoryLabels}
                dispatch={dispatch}
                t={t}
              />
            ))}
          </View>
        </View>

        <LocationSelector
          required
          value={draft.location}
          onChange={(location) => dispatch({ type: 'setLocation', location })}
        />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('course.walking.label')}</Text>
          <View style={styles.choiceWrap}>
            {WALKING_OPTIONS.map((option) => {
              const selected = draft.maxWalkingMinutes === option.value;
              return (
                <TouchableOpacity
                  key={option.value ?? 'any'}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t('course.accessibility.walking', { option: t(option.labelKey) })}
                  activeOpacity={0.72}
                  onPress={() => dispatch({ type: 'setWalkingLimit', minutes: option.value })}
                  style={[styles.choice, selected && styles.choiceSelected]}
                >
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{t(option.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('course.budget.label')}</Text>
          <TextInput
            accessibilityLabel={t('course.accessibility.budget')}
            style={styles.textInput}
            placeholder={t('course.budget.placeholder')}
            placeholderTextColor={C.textFaint}
            value={draft.totalBudgetKRWInput}
            onChangeText={(value) => dispatch({ type: 'setBudgetInput', value })}
            keyboardType="numeric"
            returnKeyType="done"
          />
          <Text style={styles.hint}>{t('course.budget.hint')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('course.moods.label')}</Text>
          <View style={styles.choiceWrap}>
            {COURSE_MOODS.map((mood) => {
              const selected = draft.moods.includes(mood);
              return (
                <TouchableOpacity
                  key={mood}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t('course.accessibility.mood', { mood: t(`course.moods.options.${mood}`) })}
                  activeOpacity={0.72}
                  onPress={() => dispatch({ type: 'toggleMood', mood })}
                  style={[styles.choice, selected && styles.choiceSelected]}
                >
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                    {t(`course.moods.options.${mood}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('course.duration.label')}</Text>
          <OptionCardPicker
            largeTouchTarget
            options={DURATIONS.map((duration) => ({ value: duration.value, label: t(duration.labelKey) }))}
            value={draft.duration}
            onChange={(duration) => dispatch({ type: 'setDuration', duration })}
            columns={3}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('course.additional.label')}</Text>
          <TextInput
            accessibilityLabel={t('course.accessibility.additionalRequest')}
            style={styles.additionalInput}
            placeholder={t('course.additional.placeholder')}
            placeholderTextColor={C.textFaint}
            value={draft.additionalRequest}
            onChangeText={(value) => dispatch({ type: 'setAdditionalRequest', value })}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>{t('course.additional.maxLength', { count: draft.additionalRequest.length })}</Text>
        </View>

        {hasPreview && (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>{t('course.preview.title')}</Text>
            <View style={styles.previewChips}>
              {parsedPreferences.excludedCategories?.map((category) => (
                <Badge key={category} tone="gray">
                  {t('course.preview.excluded', { category: categoryLabels[category as CourseCategory] })}
                </Badge>
              ))}
              {parsedPreferences.quietPreferred && <Badge tone="lavender">{t('course.preview.quiet')}</Badge>}
              {parsedPreferences.photoFriendlyPreferred && <Badge tone="pink">{t('course.preview.photo')}</Badge>}
              {parsedPreferences.indoorOnly && <Badge tone="mint">{t('course.preview.indoor')}</Badge>}
            </View>
          </View>
        )}

        {validation.issues.length > 0 && (
          <View style={styles.validation}>
            {validation.issues.map((issue) => (
              <Text
                key={issue.code}
                selectable
                style={[styles.validationText, issue.code === 'exclusion_conflict' && styles.conflictText]}
                testID={issue.code === 'exclusion_conflict' ? 'course-conflict' : 'course-validation'}
              >
                {issueMessage(issue, categoryLabels, t)}
              </Text>
            ))}
          </View>
        )}
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: aiConsent }} onPress={() => setAiConsent((value) => !value)} style={styles.consentRow}>
          <Text style={styles.consentCheck}>{aiConsent ? '✓' : '○'}</Text>
          <Text style={styles.consentText}>{t('course.aiConsent')}</Text>
        </TouchableOpacity>

        <BigButton
          accessibilityLabel={t('course.accessibility.generate')}
          disabled={!validation.valid || !aiConsent}
          onPress={validation.valid && aiConsent ? handleGenerate : undefined}
          style={styles.generateButton}
          variant={validation.valid && aiConsent ? 'primary' : 'disabled'}
        >
          {t('course.generateButton')}
        </BigButton>
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: SP.xl, paddingTop: SP.sm, paddingBottom: 60 },
  header: { paddingTop: SP.lg, gap: SP.sm },
  modeLabel: { fontSize: 13, color: C.pinkDeep, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32, color: C.text },
  subtitle: { fontSize: 13, lineHeight: 20, color: C.textSub },
  section: { paddingTop: SP.xxl, gap: SP.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SP.sm },
  sectionHeadingWrap: { flex: 1, gap: SP.xs },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: C.text, lineHeight: 22 },
  hint: { fontSize: 12, color: C.textMuted, lineHeight: 18 },
  addButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.xs,
    paddingHorizontal: SP.md,
    borderRadius: R.md,
    backgroundColor: C.pinkLight,
  },
  addButtonText: { fontSize: 12, fontWeight: '600', color: C.pinkDeep },
  controlDisabled: { opacity: 0.35 },
  stepList: { gap: SP.md },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SP.md,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  choiceSelected: { borderColor: C.pinkBorder, backgroundColor: C.pinkLight },
  choiceText: { fontSize: 12, color: C.inkSoft, fontWeight: '600' },
  choiceTextSelected: { color: C.pinkDeep },
  textInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: SP.lg,
    fontSize: 15,
    color: C.text,
    backgroundColor: C.white,
  },
  additionalInput: {
    minHeight: 108,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    padding: SP.lg,
    fontSize: 14,
    lineHeight: 21,
    color: C.text,
    backgroundColor: C.white,
  },
  counter: { alignSelf: 'flex-end', fontSize: 12, color: C.textMuted, fontVariant: ['tabular-nums'] },
  preview: { marginTop: SP.lg, padding: SP.md, gap: SP.sm, borderRadius: R.md, backgroundColor: C.gray },
  previewTitle: { fontSize: 13, color: C.text, fontWeight: '600' },
  previewChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  validation: { paddingVertical: SP.lg, gap: SP.xs },
  validationText: { fontSize: 12, lineHeight: 18, color: C.danger },
  conflictText: { fontWeight: '700' },
  generateButton: { minHeight: 52 },
  consentRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  consentCheck: { color: C.pinkDeep, fontSize: 18 },
  consentText: { flex: 1, color: C.textSub, fontSize: 12, lineHeight: 18 },
  bottomSpacer: { height: SP.xxl },
});
