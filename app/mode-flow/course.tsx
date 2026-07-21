import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Alert,
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
import { BackBar, Badge, BigButton } from '../../components/ui';
import { CourseStepEditor } from '../../components/recommendation/course-step-editor';
import { LocationSelector } from '../../components/recommendation/location-selector';
import { StepSlider } from '../../components/recommendation/step-slider';
import { C, R, SP } from '../../constants/theme';
import {
  COURSE_CATEGORIES,
  COURSE_MOODS,
  courseDraftReducer,
  createInitialCourseDraft,
  parseCoursePreferences,
  parseTotalBudgetKRW,
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
import { subscribePickedPlace } from '../../lib/place-pick-bridge';

const DURATION_MAX_HOURS = 24;

const BUDGET_MAX_KRW = 100_000;
const BUDGET_STEP_KRW = 1_000;

function parseDurationHours(duration?: string): number | undefined {
  if (!duration) return undefined;
  const match = /^(\d+)/.exec(duration);
  return match ? Number(match[1]) : undefined;
}

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

// 목업 P0/03 섹션 헤더: 핑크 번호 배지 + 라벨(+힌트). 번호는 화면 내 섹션 순서.
function SectionTitle({ number, label, hint }: { number: number; label: string; hint?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionBadge}>
        <Text style={styles.sectionBadgeText}>{number}</Text>
      </View>
      <View style={styles.sectionTitleCopy}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {hint != null && <Text style={styles.hint}>{hint}</Text>}
      </View>
    </View>
  );
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
  const categoryLabels = useMemo(() => Object.fromEntries(
    COURSE_CATEGORIES.map((category) => [category, t(`course.steps.categories.${category}`)]),
  ) as Record<CourseCategory, string>, [t]);
  const parsedPreferences = useMemo(
    () => parseCoursePreferences(draft.additionalRequest),
    [draft.additionalRequest],
  );
  const validation = useMemo(() => validateCourseDraft(draft), [draft]);

  const [pinTargetStepId, setPinTargetStepId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribePickedPlace((place) => {
      if (!pinTargetStepId) return;
      dispatch({
        type: 'setStepPin',
        stepId: pinTargetStepId,
        pin: { kakaoPlaceId: place.kakaoPlaceId, name: place.name, address: place.address },
      });
      setPinTargetStepId(null);
    });
    return unsub;
  }, [pinTargetStepId]);

  function requestPick(stepId: string) {
    if (!draft.location) {
      // 장소 검색은 주변 좌표 bias가 필요하므로 만나는 위치를 먼저 골라야 한다.
      // 조용히 무시하면 버튼이 죽은 것처럼 보이므로 이유를 안내한다.
      Alert.alert(t('course.steps.pin.locationFirstTitle'), t('course.steps.pin.locationFirstBody'));
      return;
    }
    setPinTargetStepId(stepId);
    router.push({
      pathname: '/mode-flow/place-search',
      params: { x: String(draft.location.longitude), y: String(draft.location.latitude) },
    } as any);
  }

  function addStep() {
    dispatch({
      type: 'addStep',
      step: { id: `course-step-${++idSequence.current}`, category: 'ai_decide' },
    });
  }

  function handleGenerate() {
    if (!validation.valid) return;
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
          <Text style={styles.title}>{t('course.title')}</Text>
          <Text style={styles.subtitle}>{t('course.subtitle')}</Text>
        </View>

        <View style={styles.section}>
          <SectionTitle number={1} label={t('course.steps.label')} hint={t('course.steps.hint')} />
          <View style={styles.stepList}>
            {draft.steps.map((step, index) => (
              <CourseStepEditor
                key={step.id}
                step={step}
                index={index}
                total={draft.steps.length}
                categoryLabels={categoryLabels}
                dispatch={dispatch}
                onRequestPick={requestPick}
                t={t}
              />
            ))}
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
        </View>

        <LocationSelector
          required
          badge={2}
          value={draft.location}
          onChange={(location) => dispatch({ type: 'setLocation', location })}
        />

        <View style={styles.section}>
          <SectionTitle number={3} label={t('course.walking.label')} />
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
          <SectionTitle number={4} label={t('course.budget.label')} />
          <StepSlider
            min={0}
            max={BUDGET_MAX_KRW}
            step={BUDGET_STEP_KRW}
            value={parseTotalBudgetKRW(draft.totalBudgetKRWInput) ?? 0}
            onChange={(v) => dispatch({ type: 'setBudgetInput', value: v === 0 ? '' : String(v) })}
            formatValue={(v) => (v === 0 ? t('course.unselected') : t('course.budget.amount', { amount: v.toLocaleString() }))}
            accessibilityLabel={t('course.accessibility.budget')}
            testID="course-budget-slider"
          />
          <Text style={styles.hint}>{t('course.budget.hint')}</Text>
        </View>

        <View style={styles.section}>
          <SectionTitle number={5} label={t('course.moods.label')} />
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
          <SectionTitle number={6} label={t('course.duration.label')} />
          <StepSlider
            min={0}
            max={DURATION_MAX_HOURS}
            step={1}
            value={parseDurationHours(draft.duration) ?? 0}
            onChange={(hours) => dispatch({
              type: 'setDuration',
              duration: hours === 0 ? undefined : t('course.duration.hoursLabel', { count: hours }),
            })}
            formatValue={(hours) => (hours === 0 ? t('course.unselected') : t('course.duration.hoursLabel', { count: hours }))}
            accessibilityLabel={t('course.accessibility.duration')}
            testID="course-duration-slider"
          />
        </View>

        <View style={styles.section}>
          <SectionTitle number={7} label={t('course.additional.label')} />
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
        <BigButton
          accessibilityLabel={t('course.accessibility.generate')}
          disabled={!validation.valid}
          onPress={validation.valid ? handleGenerate : undefined}
          style={styles.generateButton}
          variant={validation.valid ? 'primary' : 'disabled'}
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
  header: { paddingTop: SP.lg, gap: SP.sm, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: C.text, textAlign: 'center', lineHeight: 31 },
  subtitle: { fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 20 },
  section: { paddingTop: SP.xxl, gap: SP.sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm },
  sectionBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.pink,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  sectionBadgeText: { fontSize: 13, fontWeight: '800', color: C.white },
  sectionTitleCopy: { flex: 1, gap: SP.xs },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: C.text, lineHeight: 22 },
  hint: { fontSize: 12, color: C.textMuted, lineHeight: 18 },
  addButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
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
  generateButton: { minHeight: 52, marginTop: SP.xxl },
  bottomSpacer: { height: SP.xxl },
});
