import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { generateDateCards, regenerateDateCards, getUserPreferences, type FeelingInput, type DateCard } from '../../lib/ai';
import { createSession, getSession, addPreviousPlaceIds } from '../../lib/recommendationSession';
import { collectPlaceIds } from '../../lib/recommendation';
import { attachRecommendationIdentity } from '../../lib/recommendationIdentity';
import { logEvent } from '../../lib/analytics';
import { useI18n } from '../../lib/i18n';
import { C } from '../../constants/colors';
import { SP } from '../../constants/theme';
import { BigButton, GeneratingView } from '../../components/ui';
import { Illustration } from '../../components/illustration';
import { useRecommendationSessionStore } from '../../components/recommendation/recommendation-session-provider';
import {
  RecommendationRequestError,
  isPreparedRequestExpiredError,
  relaxRequiredMarkers,
  requestRecommendationResponse,
} from '../../lib/recommend-date';
import {
  buildLegacyResultParams,
  buildStructuredCourseResultParams,
} from '../../lib/recommendation-route';

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
  const [courseStage, setCourseStage] = useState<'preparing' | 'requesting' | 'validating' | 'ready'>('preparing');
  const [errorMsg, setErrorMsg] = useState('');
  const [courseError, setCourseError] = useState<RecommendationRequestError | null>(null);
  const [requestExpired, setRequestExpired] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const isCourse = typeof requestId === 'string' || mode === 'make_course';
  const steps = t(isCourse ? 'modeFlow.generating.courseSteps' : 'modeFlow.generating.defaultSteps', { returnObjects: true }) as string[];
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
    (async () => {
      try {
        if (typeof requestId === 'string') {
          setCourseStage('preparing');
          setStep(0);
          const request = getPreparedRecommendationRequest(requestId);
          if (cancelled) return;
          setCourseStage('requesting');
          setStep(Math.min(1, steps.length - 1));
          const response = await requestRecommendationResponse(request, { signal: requestToken.signal });
          if (cancelled || requestToken.signal.aborted) return;
          setCourseStage('validating');
          setStep(Math.min(2, steps.length - 1));
          const snapshot = await persistRecommendationSession(request.requestId);
          await logEvent('ai_card_created', { mode: 'make_course', card_count: response.cards.length });
          if (cancelled || requestToken.signal.aborted) return;
          setCourseStage('ready');
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
        await logEvent('mode_selected', { mode: m });

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

        await logEvent('ai_card_created', { mode: m, card_count: result.length });
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
        if (cancelled || requestToken.signal.aborted || (error as { name?: string } | null)?.name === 'AbortError') return;
        setRequestExpired(isCourse && isPreparedRequestExpiredError(error));
        setCourseError(isCourse && error instanceof RecommendationRequestError ? error : null);
        setErrorMsg(isCourse ? courseErrorMessage(error) : t('modeFlow.generating.defaultError'));
      }
    })();

    return () => {
      cancelled = true;
      requestToken.abort();
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

  const unsatisfiedIntents = courseError?.code === 'STEP_INTENT_UNSATISFIED' ? courseError.unsatisfiedIntents ?? [] : [];
  const canRelax = typeof requestId === 'string' && unsatisfiedIntents.length > 0;

  const handleRelax = () => {
    if (typeof requestId !== 'string') return;
    const original = getPreparedRecommendationRequest(requestId);
    const relaxedText = relaxRequiredMarkers(original.additionalRequest);
    const relaxed = prepareRecommendationRequest({
      ...original,
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
        onPrimary={() => { setErrorMsg(''); setCourseError(null); setStep(0); setRetryKey(k => k + 1); }}
        secondaryLabel={isCourse ? t('modeFlow.generating.courseEdit') : undefined}
        onSecondary={isCourse ? () => router.replace('/mode-flow/course' as any) : undefined}
      />
    );
  }

  return <GeneratingView heading={heading} steps={steps} step={courseStage === 'preparing' ? 0 : step} />;
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
  return (
    <View style={s.container}>
      <Illustration name="mascot-heart-single" width={132} />
      <Text style={s.heading}>{heading}</Text>
      <Text style={s.errSub}>{message}</Text>
      <BigButton onPress={onPrimary} style={s.retryBtn}>{primaryLabel}</BigButton>
      {secondaryLabel != null && onSecondary != null && (
        <TouchableOpacity accessibilityRole="button" onPress={onSecondary} style={s.editButton}>
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
  retryBtn: { marginTop: SP.xl },
  editButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SP.xl, marginTop: SP.sm },
  editButtonText: { color: C.textSub, fontSize: 14, fontWeight: '600' },
  heading: {
    fontSize: 22, fontWeight: '700', color: C.text,
    textAlign: 'center', lineHeight: 29,
    marginTop: SP.xl, marginBottom: SP.md,
  },
  errSub: { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20 },
});
