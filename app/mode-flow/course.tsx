import { useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, Clock3, Gift, Heart, Moon, Smile, Sparkles, Star, MapPin } from '../../components/iconography';
import { BigButton, Header, ProgressDots, ScreenHeading } from '../../components/ui';
import { CourseStepEditor } from '../../components/recommendation/course-step-editor';
import { usePersonalStepTagCatalog } from '../../components/recommendation/use-personal-step-tag-catalog';
import { CourseTimeSelector, formatMeetingTime } from '../../components/recommendation/course-time-selector';
import { LocationSelector } from '../../components/recommendation/location-selector';
import { C, DS, R, SP } from '../../constants/theme';
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
    <Header
      onBack={onBack}
      center={<ProgressDots
        current={step}
        total={5}
        variant="current-only"
        accessibilityLabel={t('course.accessibility.progress', { step, total: 5 })}
      />}
      right={<Text style={styles.progressCount}>{step} / 5</Text>}
    />
  );
}

function Intro({ title, subtitle, helper }: { title: string; subtitle: string; helper?: string }) {
  return <ScreenHeading title={title} subtitle={subtitle} helper={helper} variant="input" style={styles.intro} />;
}

function MoodPicker({ moods, onToggle, t }: { moods: readonly CourseMood[]; onToggle: (mood: CourseMood) => void; t: Translate }) {
  const unsureSelected = moods.length === 0;

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
                  activeOpacity={0.88}
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
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: unsureSelected }}
        onPress={() => moods.forEach((mood) => onToggle(mood))}
        style={({ pressed }) => [styles.unsure, (pressed || unsureSelected) && styles.unsureHighlighted]}
        testID="course-mood-unsure"
      >
        {({ pressed }) => {
          const highlighted = pressed || unsureSelected;
          return (
            <>
              <Smile size={17} color={highlighted ? C.creamFg : C.textMuted} strokeWidth={1.8} />
              <Text style={[styles.unsureText, highlighted && styles.unsureTextHighlighted]}>{t('course.moods.unsure')}</Text>
            </>
          );
        }}
      </Pressable>
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
              return <Icon size={18} color={C.refineCandidateStrong} strokeWidth={1.8} />;
            })()}
            <Text style={styles.reviewCourseText}>{categoryLabels[step.category]}</Text>
            {index < draft.steps.length - 1 && <ChevronRight size={18} color={C.refineCandidateStrong} strokeWidth={1.8} />}
          </View>
        ))}
      </View>
      <View style={styles.reviewDivider} />
      <ReviewRow icon={<MapPin size={18} color={C.refineCandidateStrong} />} label={t('course.review.locationLabel')} value={draft.location?.label ?? t('course.unselected')} onPress={() => onEdit(2)} t={t} />
      <ReviewRow icon={<Clock3 size={18} color={C.refineCandidateStrong} />} label={t('course.review.timeLabel')} value={formatMeetingTime(draft.meetingTime, language, t)} onPress={() => onEdit(3)} t={t} />
      <ReviewRow icon={<Heart size={18} color={C.refineCandidateStrong} />} label={t('course.review.moodLabel')} value={draft.moods.length > 0 ? draft.moods.map((mood) => t(`course.moods.options.${mood}`)).join(' · ') : t('course.moods.unsureShort')} onPress={() => onEdit(4)} t={t} />
    </View>
  );
}

function ReviewRow({ icon, label, value, onPress, t }: { icon: ReactNode; label: string; value: string; onPress: () => void; t: Translate }) {
  return (
    <View style={styles.reviewRow}>
      <View style={styles.reviewRowCopy}><Text style={styles.reviewRowLabel}>{label}</Text><View style={styles.reviewValueRow}>{icon}<Text style={styles.reviewValue}>{value}</Text></View></View>
      <TouchableOpacity accessibilityRole="button" onPress={onPress} activeOpacity={0.88}><Text style={styles.editText}>{t('course.review.edit')}</Text></TouchableOpacity>
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
  const { suggestionsFor, personalCountFor, addSuggestion, removeSuggestion } = usePersonalStepTagCatalog();
  const idSequence = useRef(0);
  const [draft, dispatch] = useReducer(courseDraftReducer, undefined, () => createInitialCourseDraft(() => `course-step-${++idSequence.current}`));
  const [flowStep, setFlowStep] = useState<FlowStep>(1);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const categoryLabels = useMemo(() => Object.fromEntries(
    COURSE_CATEGORIES.map((category) => [category, t(`course.steps.categories.${category}`)]),
  ) as Record<CourseCategory, string>, [t]);
  const validation = useMemo(() => validateCourseDraft(draft), [draft]);
  const expandedStep = draft.steps.find((step) => step.id === expandedStepId);

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
      <ProgressHeader step={flowStep} onBack={goBack} t={t} />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {flowStep === 1 && (
          <View testID="course-flow-step-1">
            <Intro title={t('course.flow.steps.title')} subtitle={t('course.flow.steps.subtitle')} helper={t('course.steps.selectionHint')} />
            <CourseStepEditor
              steps={draft.steps}
              categoryLabels={categoryLabels}
              expandedStepId={expandedStepId}
              onToggleCategory={toggleCategory}
              onSelectPreference={selectPreference}
              onClearPreference={(stepId) => dispatch({ type: 'setStepPreference', stepId })}
              suggestions={expandedStep ? suggestionsFor(expandedStep.category) : []}
              personalTagCount={expandedStep ? (personalCountFor?.(expandedStep.category) ?? 0) : 0}
              onAddSuggestedTag={(tag) => {
                if (expandedStep) void addSuggestion(expandedStep.category, tag).catch(() => undefined);
              }}
              onRemoveSuggestedTag={(tag) => {
                if (expandedStep) void removeSuggestion(expandedStep.category, tag).catch(() => undefined);
              }}
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
  content: { flexGrow: 1, paddingHorizontal: DS.spacing.screen, paddingBottom: DS.spacing.screen, gap: DS.spacing.lg },
  progressCount: { minWidth: DS.spacing.touch, ...DS.typography.caption, color: C.textMuted, textAlign: 'right' },
  intro: { paddingHorizontal: 0, marginBottom: SP.xxxl },
  nextButton: { marginTop: 'auto' },
  generateButton: { marginTop: 'auto' },
  moodContent: { gap: SP.lg },
  moodGrid: { gap: SP.md },
  moodRow: { flexDirection: 'row', gap: SP.sm },
  moodCard: { flex: 1, minHeight: 104, borderRadius: DS.radius.button, borderWidth: 1, borderColor: C.pinkBorder, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', gap: SP.sm },
  moodCardSelected: { backgroundColor: C.pinkLight, borderColor: C.pink },
  moodText: { ...DS.typography.bodySmall, color: C.text, fontWeight: '600', textAlign: 'center' },
  moodTextSelected: { color: C.pinkDeep },
  unsure: { minHeight: 56, borderRadius: DS.radius.button, backgroundColor: DS.color.selection.like.background, borderWidth: 1, borderColor: C.creamBorder, flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingHorizontal: SP.lg },
  unsureHighlighted: { backgroundColor: DS.color.selection.like.background, borderColor: DS.color.selection.like.border, borderWidth: DS.color.selection.like.borderWidth },
  unsureText: { ...DS.typography.bodySmall, color: C.textMuted, fontWeight: '600' },
  unsureTextHighlighted: { color: DS.color.selection.like.foreground, fontWeight: '700' },
  reviewCard: { height: 310, borderRadius: DS.radius.card, borderWidth: 1, borderColor: C.reviewBorder, backgroundColor: C.white, paddingHorizontal: SP.lg, paddingTop: SP.md, paddingBottom: SP.lg, overflow: 'hidden' },
  reviewCourseLabel: { ...DS.typography.caption, color: C.refineCandidateStrong, fontWeight: '700' },
  reviewCourseRow: { height: SP.xxl, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SP.micro, marginTop: SP.sm, overflow: 'hidden' },
  reviewCourseItem: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, height: SP.xxl },
  reviewCourseText: { ...DS.typography.bodySmall, color: C.refineCandidateStrong, fontWeight: '700' },
  reviewDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.reviewDivider, marginTop: SP.md, marginBottom: SP.sm },
  reviewRow: { height: SP.xxl * 2, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: SP.md },
  reviewRowCopy: { flex: 1 },
  reviewRowLabel: { ...DS.typography.caption, color: C.refineCandidateStrong, fontWeight: '700' },
  reviewValueRow: { height: SP.xxl, flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginTop: SP.sm, overflow: 'hidden' },
  reviewValue: { ...DS.typography.bodyCompact, color: C.refineCandidateStrong, fontWeight: '700' },
  editText: { ...DS.typography.caption, color: C.pinkDeep, fontWeight: '700' },
  reviewTip: { height: 65, borderRadius: R.btn, borderWidth: 1, borderColor: C.pink, backgroundColor: C.pinkLight, padding: SP.lg, gap: SP.xs, marginTop: SP.md, overflow: 'hidden' },
  reviewTipLead: { ...DS.typography.caption, color: C.locationMuted },
  reviewTipBody: { ...DS.typography.bodyCompact, color: C.pinkDeep, fontWeight: '700' },
  validation: { gap: SP.xs },
  validationText: { ...DS.typography.bodySmall, color: C.danger },
});
