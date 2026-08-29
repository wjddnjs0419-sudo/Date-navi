import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { generateDateCards, regenerateDateCards, getUserPreferences, type FeelingInput, type DateCard } from '../../lib/ai';
import { createSession, getSession, addPreviousPlaceIds } from '../../lib/recommendationSession';
import { collectPlaceIds } from '../../lib/recommendation';
import { attachRecommendationIdentity } from '../../lib/recommendationIdentity';
import { logEvent } from '../../lib/analytics';
import { normalizeRecommendationRequestError } from '../../lib/analytics-course';
import { useI18n } from '../../lib/i18n';
import { useOptionalSafeAreaInsets } from '../../lib/use-optional-safe-area-insets';
import { C } from '../../constants/colors';
import { DS, SP } from '../../constants/theme';
import { BigButton, GeneratingView } from '../../components/ui';
import { Illustration } from '../../components/illustration';
import { QuickPlanningLoading, type QuickPlanningLoadingConditions } from '../../components/recommendation/quick-planning-loading';
import { useRecommendationSessionStore } from '../../components/recommendation/recommendation-session-provider';
import { RecommendationSessionRepositoryError } from '../../lib/recommendation-session-repository';
import { addPersonalStepTag, PERSONAL_STEP_TAG_CATEGORIES } from '../../lib/personal-step-tag-catalog';
import { supabase } from '../../lib/supabase';
import { canonicalizeStepIntentTag, isShippedStepIntentTag } from '../../shared/recommendation/step-intent-tag-catalog';
import {
  RecommendationRequestError,
  isPreparedRequestExpiredError,
  relaxRequiredMarkers,
  relaxUnsatisfiedStepIntentTags,
  requestRecommendationResponse,
} from '../../lib/recommend-date';
import {
  buildLegacyResultParams,
  buildStructuredCourseResultParams,
} from '../../lib/recommendation-route';
import type { RecommendationRequest } from '../../shared/recommendation/contracts';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function buildQuickPlanningConditions(
  request: RecommendationRequest,
  language: 'ko' | 'en',
  t: Translate,
): QuickPlanningLoadingConditions {
  const meetingTimePrefix = language === 'en' ? 'Meeting time:' : '만날 시간:';
  const meetingTimeLine = request.additionalRequest
    ?.split('\n')
    .find(line => line.trim().startsWith(meetingTimePrefix));
  const time = meetingTimeLine?.slice(meetingTimeLine.indexOf(':') + 1).trim() || '—';
  const moods = request.moods ?? request.selectedMoodTags ?? [];
  const mood = moods.length > 0
    ? moods.map(moodTag => t(`course.moods.options.${moodTag}`)).join(' · ')
    : t('course.moods.unsureShort');

  return {
    location: request.location.label,
    time,
    mood,
  };
}

export function courseRateLimitNotice(
  error: RecommendationRequestError,
  t: Translate,
  remainingSeconds?: number,
): { title: string; body: string } | null {
  if (error.code === 'AI_REQUEST_ALREADY_RUNNING') {
    return {
      title: t('modeFlow.generating.rateLimit.alreadyRunningTitle'),
      body: t('modeFlow.generating.rateLimit.alreadyRunningBody'),
    };
  }
  if (error.code === 'AI_RATE_LIMITED') {
    const remaining = remainingSeconds ?? error.retryAfterSeconds ?? 1;
    return {
      title: t('modeFlow.generating.rateLimit.burstTitle'),
      body: t('modeFlow.generating.rateLimit.burstBody', {
        minutes: Math.floor(remaining / 60),
        seconds: remaining % 60,
      }),
    };
  }
  if (error.code === 'AI_DAILY_LIMIT_REACHED') {
    return {
      title: t('modeFlow.generating.rateLimit.dailyTitle'),
      body: t('modeFlow.generating.rateLimit.dailyBody'),
    };
  }
  return null;
}

export function normalizeCourseGenerationError(error: unknown): RecommendationRequestError | null {
  if (error instanceof RecommendationRequestError) return error;
  if (error instanceof RecommendationSessionRepositoryError && error.code === 'unauthorized') {
    return new RecommendationRequestError('AUTH_EXPIRED');
  }
  return null;
}

export default function GeneratingScreen() {
  const {
    mode,
    input,
    sessionId: sessionIdParam,
    requestId,
  } = useLocalSearchParams<{ mode?: string; input?: string; sessionId?: string; requestId?: string }>();
  const router = useRouter();
  const { language, t } = useI18n();
  const {
    getPreparedRecommendationRequest,
    prepareRecommendationRequest,
    persistRecommendationSession,
  } = useRecommendationSessionStore();
  const [step, setStep] = useState(0);
  const [courseProgress, setCourseProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [courseError, setCourseError] = useState<RecommendationRequestError | null>(null);
  const [courseConditions, setCourseConditions] = useState<QuickPlanningLoadingConditions | null>(null);
  const [burstRemainingSeconds, setBurstRemainingSeconds] = useState<number | null>(null);
  const [requestExpired, setRequestExpired] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const isCourse = typeof requestId === 'string' || mode === 'make_course';
  const steps = t(isCourse ? 'modeFlow.generating.courseSteps' : 'modeFlow.generating.defaultSteps', { returnObjects: true }) as string[];
  const courseBubbleMessages = t('modeFlow.generating.courseBubbleMessages', { returnObjects: true }) as string[];
  const courseStatusMessages = t('modeFlow.generating.courseStatusMessages', { returnObjects: true }) as string[];
  const heading = t(isCourse ? 'modeFlow.generating.courseHeading' : 'modeFlow.generating.defaultHeading');

  const courseErrorMessage = (error: unknown) => {
    if (isPreparedRequestExpiredError(error)) return t('modeFlow.generating.courseExpired');
    if (!(error instanceof RecommendationRequestError)) return t('modeFlow.generating.courseError');
    if (error.code === 'COURSE_VALIDATION_FAILED' && error.failureStage) {
      return t(`modeFlow.generating.courseFailureStages.${error.failureStage}`);
    }
    return t(`modeFlow.generating.courseErrors.${error.code}`);
  };

  useEffect(() => {
    let cancelled = false;
    const requestToken = new AbortController();
    let progressTimer: ReturnType<typeof setInterval> | undefined;
    let progressTarget = 90;
    let displayedProgress = 0;
    let resolveCompletion: (() => void) | undefined;

    const startCourseProgress = () => {
      progressTimer = setInterval(() => {
        const increment = progressTarget === 100 ? 4 : 1;
        displayedProgress = Math.min(displayedProgress + increment, progressTarget);
        if (!cancelled) setCourseProgress(displayedProgress);
        if (displayedProgress === 100) resolveCompletion?.();
      }, 80);
    };

    const completeCourseProgress = () => new Promise<void>((resolve) => {
      if (displayedProgress === 100) {
        resolve();
        return;
      }
      resolveCompletion = resolve;
      progressTarget = 100;
    });

    (async () => {
      try {
        if (typeof requestId === 'string') {
          setStep(0);
          setCourseProgress(0);
          setCourseConditions(null);
          const request = getPreparedRecommendationRequest(requestId);
          if (cancelled) return;
          setCourseConditions(buildQuickPlanningConditions(request, language === 'en' ? 'en' : 'ko', t));
          startCourseProgress();
          const response = await requestRecommendationResponse(request, { signal: requestToken.signal });
          if (cancelled || requestToken.signal.aborted) return;
          const verified = new Set(response.metadata.stepIntent?.verifiedCanonicalTerms ?? []);
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await Promise.all(request.courseSteps.flatMap((courseStep) => {
              if (!PERSONAL_STEP_TAG_CATEGORIES.includes(courseStep.category as any)) return [];
              return (courseStep.intentTags ?? []).flatMap((tag) => {
                const canonical = canonicalizeStepIntentTag(tag);
                // Only an unknown tag proven by Kakao becomes a reusable personal tag.
                return !isShippedStepIntentTag(tag) && canonical === tag && verified.has(canonical)
                  ? [addPersonalStepTag(user.id, courseStep.category as any, tag).catch(() => undefined)]
                  : [];
              });
            }));
          }
          const snapshot = await persistRecommendationSession(request.requestId);
          await logEvent('recommendation_request_succeeded', {
            mode: 'make_course',
            card_count: response.cards.length,
            step_count: request.courseSteps.length,
          });
          if (cancelled || requestToken.signal.aborted) return;
          await completeCourseProgress();
          if (cancelled || requestToken.signal.aborted) return;
          setStep(steps.length - 1);
          router.replace({
            pathname: '/mode-flow/course-result',
            params: buildStructuredCourseResultParams(request.requestId, snapshot.sessionId),
          } as any);
          return;
        }
        if (mode === 'make_course') {
          throw new Error('Structured course generation requires a prepared requestId.');
        }

        const parsedInput: FeelingInput = JSON.parse(input ?? '{}');
        const m = mode ?? 'feeling';
        let result: DateCard[] = [];
        let sessionId = sessionIdParam;

        // 재추천: 저장된 Session이 있으면 Candidate Pool을 재사용하고 previousPlaceIds를 제외해 다시 고른다.
        const existing = getSession(sessionIdParam);
        if (existing) {
          result = await regenerateDateCards(existing, language);
          if (result.length > 0) {
            addPreviousPlaceIds(existing.sessionId, collectPlaceIds(result));
          }
        }

        // 최초 추천 또는 재추천 후보 소진 시: fresh 생성 후 새 Session 저장(candidate 플로우일 때만).
        if (result.length === 0) {
          const prefs = await getUserPreferences();
          let captured: { intent: import('../../lib/intent').PlanIntent; candidates: import('../../lib/candidate').Candidate[]; usedPlaceIds: string[] } | undefined;
          result = await generateDateCards(parsedInput, m, prefs, language, { onSession: (s) => { captured = s; } });
          if (captured) {
            sessionId = createSession({ mode: m, input: parsedInput, intent: captured.intent, candidates: captured.candidates, previousPlaceIds: captured.usedPlaceIds, prefs }).sessionId;
            result = attachRecommendationIdentity(result, { sessionId });
          } else {
            sessionId = undefined;
          }
        }

        if (cancelled) return;
        router.replace({
          pathname: '/mode-flow/result',
          params: buildLegacyResultParams({
            mode: m,
            input: input ?? '{}',
            cards: JSON.stringify(result),
            ...(sessionId ? { sessionId } : {}),
          }),
        } as any);
      } catch (error) {
        if (progressTimer) clearInterval(progressTimer);
        if (cancelled || requestToken.signal.aborted || (error as { name?: string } | null)?.name === 'AbortError') return;
        const normalizedCourseError = isCourse ? normalizeCourseGenerationError(error) : null;
        if (typeof requestId === 'string') {
          await logEvent('recommendation_request_failed', {
            mode: 'make_course',
            ...normalizeRecommendationRequestError(normalizedCourseError ?? error),
          });
        }
        setRequestExpired(isCourse && isPreparedRequestExpiredError(error));
        setCourseError(normalizedCourseError);
        setErrorMsg(isCourse ? courseErrorMessage(normalizedCourseError ?? error) : t('modeFlow.generating.defaultError'));
      }
    })();

    return () => {
      cancelled = true;
      requestToken.abort();
      if (progressTimer) clearInterval(progressTimer);
      resolveCompletion?.();
    };
  }, [
    getPreparedRecommendationRequest,
    input,
    language,
    mode,
    persistRecommendationSession,
    requestId,
    sessionIdParam,
    retryKey,
    steps.length,
    t,
  ]);

  useEffect(() => {
    if (courseError?.code !== 'AI_RATE_LIMITED' || courseError.retryAfterSeconds == null) {
      setBurstRemainingSeconds(null);
      return;
    }

    const retryAt = Date.now() + courseError.retryAfterSeconds * 1000;
    const updateRemaining = () => {
      setBurstRemainingSeconds(Math.max(Math.ceil((retryAt - Date.now()) / 1000), 0));
    };

    updateRemaining();
    const timer = setInterval(() => {
      updateRemaining();
    }, 1000);
    return () => clearInterval(timer);
  }, [courseError]);

  const unsatisfiedIntents = courseError?.code === 'STEP_INTENT_UNSATISFIED' ? courseError.unsatisfiedIntents ?? [] : [];
  const canRelax = typeof requestId === 'string' && unsatisfiedIntents.length > 0;
  const rateLimitNotice = courseError
    ? courseRateLimitNotice(courseError, t, burstRemainingSeconds ?? undefined)
    : null;

  const handleRelax = () => {
    if (typeof requestId !== 'string') return;
    const original = getPreparedRecommendationRequest(requestId);
    const relaxedText = relaxRequiredMarkers(original.additionalRequest);
    const relaxed = prepareRecommendationRequest({
      ...relaxUnsatisfiedStepIntentTags(original, unsatisfiedIntents),
      requestId: `${original.requestId}-relaxed-${retryKey + 1}`,
      additionalRequest: relaxedText.length > 0 ? relaxedText : undefined,
    });
    setCourseError(null);
    setErrorMsg('');
    router.replace({ pathname: '/mode-flow/generating', params: { requestId: relaxed.requestId } } as any);
  };

  if (canRelax) {
    const conditions = unsatisfiedIntents
      .map((intent) => (language === 'en' ? intent.displayLabel.en : intent.displayLabel.ko))
      .join(', ');
    return (
      <GeneratingFallback
        heading={t('modeFlow.generating.relaxation.title')}
        message={t('modeFlow.generating.relaxation.body', { conditions })}
        primaryLabel={t('modeFlow.generating.relaxation.relaxButton')}
        onPrimary={handleRelax}
        secondaryLabel={t('modeFlow.generating.relaxation.editButton')}
        onSecondary={() => router.replace('/mode-flow/course' as any)}
      />
    );
  }

  if (rateLimitNotice) {
    return (
      <GeneratingFallback
        heading={rateLimitNotice.title}
        message={rateLimitNotice.body}
        primaryLabel={t('modeFlow.generating.rateLimit.confirm')}
        onPrimary={() => router.replace('/mode-flow/course' as any)}
      />
    );
  }

  if (errorMsg !== '') {
    const message = `${errorMsg}${requestExpired ? '' : `\n${t('modeFlow.generating.errorSuffix')}`}`;
    // 만료된 준비 요청은 재시도 불가 → 편집만 (기존 동작 유지, requestExpired ⇒ isCourse).
    if (requestExpired) {
      return (
        <GeneratingFallback
          heading={t('modeFlow.generating.errorTitle')}
          message={message}
          primaryLabel={t('modeFlow.generating.courseEdit')}
          onPrimary={() => router.replace('/mode-flow/course' as any)}
        />
      );
    }
    return (
      <GeneratingFallback
        heading={t('modeFlow.generating.errorTitle')}
        message={message}
        primaryLabel={t('modeFlow.result.retry')}
        onPrimary={() => {
          setErrorMsg('');
          setCourseError(null);
          setBurstRemainingSeconds(null);
          setStep(0);
          setRetryKey(k => k + 1);
        }}
        secondaryLabel={isCourse ? t('modeFlow.generating.courseEdit') : undefined}
        onSecondary={isCourse ? () => router.replace('/mode-flow/course' as any) : undefined}
      />
    );
  }

  if (isCourse) {
    return (
      <QuickPlanningLoading
        heading={heading}
        subtitle={t('modeFlow.generating.courseSubtitle')}
        stageLabels={steps}
        bubbleMessages={courseBubbleMessages}
        statusMessages={courseStatusMessages}
        progressPercent={courseProgress}
        conditions={courseConditions ?? { location: '—', time: '—', mood: '—' }}
        conditionsLabel={t('modeFlow.generating.courseConditionsLabel')}
        language={language === 'en' ? 'en' : 'ko'}
      />
    );
  }

  return <GeneratingView
    heading={heading}
    steps={steps}
    step={step}
  />;
}

// 생성 실패·완화 안내 화면. 마스코트 일러스트 + 헤딩 + 메시지 + 주/보조 액션.
// 데이터 흐름은 각 상태가 담당하고, 여기서는 비주얼만 통일한다.
export function GeneratingFallback({
  heading,
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  heading: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const insets = useOptionalSafeAreaInsets();
  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Illustration name="mascot-heart-single" width={132} />
      <Text style={s.heading}>{heading}</Text>
      <Text style={s.errSub}>{message}</Text>
      <BigButton onPress={onPrimary} style={s.retryBtn}>{primaryLabel}</BigButton>
      {secondaryLabel != null && onSecondary != null && (
        <TouchableOpacity accessibilityRole="button" onPress={onSecondary} activeOpacity={0.88} style={s.editButton}>
          <Text style={s.editButtonText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SP.xxxl,
  },
  retryBtn: { marginTop: SP.xxl },
  editButton: { minHeight: DS.spacing.touch, justifyContent: 'center', paddingHorizontal: SP.screen, marginTop: SP.sm },
  editButtonText: { ...DS.typography.body, color: C.textSub, fontWeight: '600' },
  heading: {
    ...DS.typography.headingLegacy, color: C.text,
    textAlign: 'center',
    marginTop: SP.xxl, marginBottom: SP.md,
  },
  errSub: { ...DS.typography.bodyCompact, color: C.textSub, textAlign: 'center' },
});
