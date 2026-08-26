import { useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, Clock3, Gift, Heart, Moon, Smile, Sparkles, Star, MapPin } from 'lucide-react-native';
import { BackBar, BigButton } from '../../components/ui';
import { CourseStepEditor } from '../../components/recommendation/course-step-editor';
import { CourseTimeSelector, formatMeetingTime } from '../../components/recommendation/course-time-selector';
import { LocationSelector } from '../../components/recommendation/location-selector';
import { C, R, SP } from '../../constants/theme';
import {
  COURSE_CATEGORIES,
  COURSE_MOODS,
  courseDraftReducer,
  createInitialCourseDraft,
  getCourseCategoryIcon,
  validateCourseDraft,
  type CourseCategory,
  type CourseDraftIssue,
  type CourseMood,
} from '../../lib/course-draft';
import { useI18n } from '../../lib/i18n';
import { buildCourseInput } from '../../lib/modeForm';
import { buildRecommendationRequest } from '../../lib/recommend-date';
import { createRecommendationRequestId } from '../../lib/recommendationIdentity';
import { buildStructuredGeneratingParams } from '../../lib/recommendation-route';
import { useRecommendationSessionStore } from '../../components/recommendation/recommendation-session-provider';
import { logEvent } from '../../lib/analytics';
import { buildRecommendationRequestStartedParams } from '../../lib/analytics-course';

type FlowStep = 1 | 2 | 3 | 4 | 5;
type Translate = (key: string, values?: Record<string, unknown>) => string;

const MOOD_ICONS = { emotional: Heart, quiet: Moon, lively: Sparkles, romantic: Heart, comfortable: Gift, novel: Star } as const;

function issueMessage(issue: CourseDraftIssue, t: Translate) {
  return t(`course.validation.${issue.code}`);
}

function ProgressHeader({ step, onBack, t }: { step: FlowStep; onBack: () => void; t: Translate }) {
  return (
    <View style={styles.progressHeader}>
      <BackBar onPress={onBack} />
      <View style={styles.progressDots} accessibilityLabel={t('course.accessibility.progress', { step, total: 5 })}>
        {Array.from({ length: 5 }, (_, index) => (
          <View key={index} style={[styles.progressDot, index + 1 === step && styles.progressDotActive]} />
        ))}
      </View>
      <Text style={styles.progressCount}>{step} / 5</Text>
    </View>
  );
}

function Intro({ title, subtitle, helper }: { title: string; subtitle: string; helper?: string }) {
  return <View style={styles.intro}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text>{helper && <Text style={styles.introHelper}>{helper}</Text>}</View>;
}

function MoodPicker({ moods, onToggle, t }: { moods: readonly CourseMood[]; onToggle: (mood: CourseMood) => void; t: Translate }) {
  return (
    <View style={styles.moodContent}>
      <View style={styles.moodGrid}>
        {[COURSE_MOODS.slice(0, 3), COURSE_MOODS.slice(3)].map((row, rowIndex) => (
          <View key={rowIndex} style={styles.moodRow} testID="course-mood-row">
            {row.map((mood) => {
              const Icon = MOOD_ICONS[mood];
              const selected = moods.includes(mood);
              return (
                <TouchableOpacity
                  key={mood}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onToggle(mood)}
                  style={[styles.moodCard, selected && styles.moodCardSelected]}
                  testID={`course-mood-${mood}`}
                >
                  <Icon size={22} color={selected ? C.pinkDeep : C.textMuted} strokeWidth={1.8} />
                  <Text style={[styles.moodText, selected && styles.moodTextSelected]}>{t(`course.moods.options.${mood}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => moods.forEach((mood) => onToggle(mood))}
        style={[styles.unsure, moods.length === 0 && styles.unsureSelected]}
        testID="course-mood-unsure"
      >
        <Smile size={17} color={C.textMuted} strokeWidth={1.8} />
        <Text style={styles.unsureText}>{t('course.moods.unsure')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Review({ draft, categoryLabels, language, t, onEdit }: {
  draft: ReturnType<typeof createInitialCourseDraft>;
  categoryLabels: Record<CourseCategory, string>;
  language: 'ko' | 'en';
  t: Translate;
  onEdit: (step: FlowStep) => void;
}) {
  return (
    <View style={styles.reviewCard}>
      <Text style={styles.reviewCourseLabel}>{t('course.review.courseLabel')}</Text>
      <View style={styles.reviewCourseRow}>
        {draft.steps.map((step, index) => (
          <View key={step.id} style={styles.reviewCourseItem}>
            {(() => {
              const Icon = getCourseCategoryIcon(step.category);
              return <Icon size={18} color={C.textSub} strokeWidth={1.8} />;
            })()}
            <Text style={styles.reviewCourseText}>{categoryLabels[step.category]}</Text>
            {index < draft.steps.length - 1 && <ChevronRight size={18} color={C.textSub} strokeWidth={1.8} />}
          </View>
        ))}
      </View>
      <View style={styles.reviewDivider} />
      <ReviewRow icon={<MapPin size={18} color={C.textSub} />} label={t('course.review.locationLabel')} value={draft.location?.label ?? t('course.unselected')} onPress={() => onEdit(2)} t={t} />
      <ReviewRow icon={<Clock3 size={18} color={C.textSub} />} label={t('course.review.timeLabel')} value={formatMeetingTime(draft.meetingTime, language, t)} onPress={() => onEdit(3)} t={t} />
      <ReviewRow icon={<Heart size={18} color={C.textSub} />} label={t('course.review.moodLabel')} value={draft.moods.length > 0 ? draft.moods.map((mood) => t(`course.moods.options.${mood}`)).join(' · ') : t('course.moods.unsureShort')} onPress={() => onEdit(4)} t={t} />
    </View>
  );
}

function ReviewRow({ icon, label, value, onPress, t }: { icon: ReactNode; label: string; value: string; onPress: () => void; t: Translate }) {
  return (
    <View style={styles.reviewRow}>
      <View style={styles.reviewRowCopy}><Text style={styles.reviewRowLabel}>{label}</Text><View style={styles.reviewValueRow}>{icon}<Text style={styles.reviewValue}>{value}</Text></View></View>
      <TouchableOpacity accessibilityRole="button" onPress={onPress}><Text style={styles.editText}>{t('course.review.edit')}</Text></TouchableOpacity>
    </View>
  );
}

function ReviewPromise({ t }: { t: Translate }) {
  const [lead, body] = t('course.review.tip').split('\n');
  return (
    <View style={styles.reviewTip}>
      <Text style={styles.reviewTipLead}>{lead}</Text>
      <Text style={styles.reviewTipBody}>{body ?? ''}</Text>
    </View>
  );
}

export default function CourseScreen() {
  const router = useRouter();
  const { language, t } = useI18n();
  const { prepareRecommendationRequest } = useRecommendationSessionStore();
  const idSequence = useRef(0);
  const [draft, dispatch] = useReducer(courseDraftReducer, undefined, () => createInitialCourseDraft(() => `course-step-${++idSequence.current}`));
  const [flowStep, setFlowStep] = useState<FlowStep>(1);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const categoryLabels = useMemo(() => Object.fromEntries(
    COURSE_CATEGORIES.map((category) => [category, t(`course.steps.categories.${category}`)]),
  ) as Record<CourseCategory, string>, [t]);
  const validation = useMemo(() => validateCourseDraft(draft), [draft]);

  function toggleCategory(category: Exclude<CourseCategory, 'ai_decide'>) {
    const selected = draft.steps.find((step) => step.category === category);
    if (selected) {
      if (expandedStepId !== selected.id) {
        setExpandedStepId(selected.id);
        return;
      }
      dispatch({ type: 'toggleCategory', category, stepId: selected.id });
      if (expandedStepId === selected.id) setExpandedStepId(null);
      return;
    }
    const stepId = `course-step-${++idSequence.current}`;
    dispatch({ type: 'toggleCategory', category, stepId });
    setExpandedStepId(stepId);
  }

  function selectPreference(stepId: string, tag?: string) {
    dispatch({ type: 'setStepPreference', stepId, tag });
    const index = draft.steps.findIndex((step) => step.id === stepId);
    const nextStep = index >= 0 ? draft.steps[index + 1] : undefined;
    setExpandedStepId(nextStep?.id ?? stepId);
  }

  function goBack() {
    if (flowStep === 1) router.back();
    else setFlowStep((flowStep - 1) as FlowStep);
  }

  function goNext() {
    if (flowStep === 1 && draft.steps.length >= 2) setFlowStep(2);
    else if (flowStep === 2 && draft.location) setFlowStep(3);
    else if (flowStep === 3 && draft.meetingTime) setFlowStep(4);
    else if (flowStep === 4) setFlowStep(5);
  }

  function handleGenerate() {
    if (!validation.valid) return;
    const input = buildCourseInput({ draft, categoryLabels });
    if (!input.courseDraft) return;
    void logEvent('recommendation_request_started', buildRecommendationRequestStartedParams(draft));
    const request = buildRecommendationRequest(input.courseDraft, createRecommendationRequestId(), language);
    prepareRecommendationRequest(request);
    router.replace({ pathname: '/mode-flow/generating', params: buildStructuredGeneratingParams(request.requestId) } as any);
  }

  const nextDisabled = flowStep === 1
    ? draft.steps.length < 2
    : flowStep === 2
      ? !draft.location
      : flowStep === 3
        ? !draft.meetingTime
        : false;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ProgressHeader step={flowStep} onBack={goBack} t={t} />

        {flowStep === 1 && (
          <View testID="course-flow-step-1">
            <Intro title={t('course.flow.steps.title')} subtitle={t('course.flow.steps.subtitle')} helper={t('course.steps.selectionHint')} />
            <CourseStepEditor
              steps={draft.steps}
              categoryLabels={categoryLabels}
              expandedStepId={expandedStepId}
              onToggleCategory={toggleCategory}
              onSelectPreference={selectPreference}
              onToggleStep={(stepId) => setExpandedStepId((current) => current === stepId ? null : stepId)}
              language={language}
              t={t}
            />
          </View>
        )}

        {flowStep === 2 && (
          <View testID="course-flow-step-2">
            <Intro title={t('course.flow.location.title')} subtitle={t('course.flow.location.subtitle')} />
            <LocationSelector required value={draft.location} onChange={(location) => dispatch({ type: 'setLocation', location })} />
          </View>
        )}

        {flowStep === 3 && (
          <View testID="course-flow-step-3">
            <Intro title={t('course.flow.time.title')} subtitle={t('course.flow.time.subtitle')} />
            <CourseTimeSelector value={draft.meetingTime} onChange={(meetingTime) => dispatch({ type: 'setMeetingTime', meetingTime })} language={language} t={t} />
          </View>
        )}

        {flowStep === 4 && (
          <View testID="course-flow-step-4">
            <Intro title={t('course.flow.mood.title')} subtitle={t('course.flow.mood.subtitle')} />
            <MoodPicker moods={draft.moods} onToggle={(mood) => dispatch({ type: 'toggleMood', mood })} t={t} />
          </View>
        )}

        {flowStep === 5 && (
          <View testID="course-flow-step-5">
            <Intro title={t('course.review.title')} subtitle={t('course.review.subtitle')} />
            <Review draft={draft} categoryLabels={categoryLabels} language={language} t={t} onEdit={setFlowStep} />
            <ReviewPromise t={t} />
            {validation.issues.length > 0 && <View style={styles.validation}>{validation.issues.map((issue) => <Text key={issue.code} selectable style={styles.validationText}>{issueMessage(issue, t)}</Text>)}</View>}
          </View>
        )}

        <BigButton
          testID={flowStep === 5 ? 'course-review-generate' : 'course-flow-next'}
          accessibilityLabel={t(flowStep === 5 ? 'course.accessibility.generate' : 'course.accessibility.next')}
          disabled={flowStep === 5 ? !validation.valid : nextDisabled}
          onPress={flowStep === 5 ? handleGenerate : goNext}
          variant={(flowStep === 5 ? validation.valid : !nextDisabled) ? 'primary' : 'disabled'}
          style={[styles.nextButton, flowStep === 5 && styles.generateButton]}
        >
          {t(flowStep === 5 ? 'course.review.generate' : 'course.flow.next')}
        </BigButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { flexGrow: 1, paddingHorizontal: SP.xl, paddingTop: SP.xl, paddingBottom: SP.xl, gap: SP.lg },
  progressHeader: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressDots: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  progressDotActive: { backgroundColor: C.pink },
  progressCount: { width: 28, color: C.textMuted, fontSize: 11, textAlign: 'right' },
  intro: { gap: SP.xs, marginBottom: SP.xxxl },
  title: { color: C.text, fontSize: 26, lineHeight: 44, fontWeight: '800' },
  subtitle: { color: C.locationMuted, fontSize: 13, lineHeight: 24 },
  introHelper: { color: C.pinkDeep, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  nextButton: { marginTop: 'auto' },
  generateButton: { marginTop: 'auto' },
  moodContent: { gap: SP.lg },
  moodGrid: { gap: SP.md },
  moodRow: { flexDirection: 'row', gap: SP.sm },
  moodCard: { flex: 1, minHeight: 104, borderRadius: R.btn, borderWidth: 1, borderColor: C.pinkBorder, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', gap: SP.sm },
  moodCardSelected: { backgroundColor: C.pinkLight, borderColor: C.pink },
  moodText: { color: C.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  moodTextSelected: { color: C.pinkDeep },
  unsure: { minHeight: 56, borderRadius: R.btn, backgroundColor: C.cream, borderWidth: 1, borderColor: '#f4e2ce', flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingHorizontal: SP.lg },
  unsureSelected: { borderColor: C.pinkBorder },
  unsureText: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  reviewCard: { height: 310, borderRadius: R.btn, borderWidth: 1, borderColor: '#F2BDC2', backgroundColor: C.white, paddingHorizontal: SP.lg, paddingTop: 14, paddingBottom: SP.lg, overflow: 'hidden' },
  reviewCourseLabel: { color: C.locationMuted, fontSize: 11, lineHeight: 13, fontWeight: '700' },
  reviewCourseRow: { height: 24, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 0, marginTop: SP.sm, overflow: 'hidden' },
  reviewCourseItem: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, height: 24 },
  reviewCourseText: { color: C.textSub, fontSize: 12, lineHeight: 24, fontWeight: '700' },
  reviewDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F5E5E8', marginTop: SP.md, marginBottom: 9 },
  reviewRow: { height: 48, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: SP.md },
  reviewRowCopy: { flex: 1 },
  reviewRowLabel: { color: C.locationMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  reviewValueRow: { height: 24, flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginTop: SP.sm, overflow: 'hidden' },
  reviewValue: { color: C.textSub, fontSize: 13, lineHeight: 24, fontWeight: '700' },
  editText: { color: C.pinkDeep, fontSize: 11, lineHeight: 24, fontWeight: '700' },
  reviewTip: { height: 65, borderRadius: R.btn, borderWidth: 1, borderColor: C.pink, backgroundColor: C.pinkLight, padding: SP.lg, gap: SP.xs, marginTop: SP.md, overflow: 'hidden' },
  reviewTipLead: { color: C.locationMuted, fontSize: 11, lineHeight: 13 },
  reviewTipBody: { color: C.pinkDeep, fontSize: 13, lineHeight: 16, fontWeight: '700' },
  validation: { gap: SP.xs },
  validationText: { color: C.danger, fontSize: 12, lineHeight: 18 },
});
