import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { generateDateCards, regenerateDateCards, getUserPreferences, type FeelingInput, type DateCard } from '../../lib/ai';
import { createSession, getSession, addPreviousPlaceIds } from '../../lib/recommendationSession';
import { collectPlaceIds } from '../../lib/recommendation';
import { logEvent } from '../../lib/analytics';
import { useI18n } from '../../lib/i18n';
import { C } from '../../constants/colors';
import { BigButton, GeneratingView } from '../../components/ui';

export default function GeneratingScreen() {
  const { mode, input, sessionId: sessionIdParam } = useLocalSearchParams<{ mode: string; input: string; sessionId?: string }>();
  const router = useRouter();
  const { language, t } = useI18n();
  const [step, setStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  const isCourse = mode === 'make_course';
  const steps = t(isCourse ? 'modeFlow.generating.courseSteps' : 'modeFlow.generating.defaultSteps', { returnObjects: true }) as string[];
  const heading = t(isCourse ? 'modeFlow.generating.courseHeading' : 'modeFlow.generating.defaultHeading');

  useEffect(() => {
    // 단계 표시는 실제 생성 시간 동안 진행하다 마지막 단계에서 대기한다.
    const interval = setInterval(() => {
      setStep(s => Math.min(s + 1, steps.length - 1));
    }, 1200);

    let cancelled = false;
    (async () => {
      try {
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
            addPreviousPlaceIds(existing.sessionId, collectPlaceIds(result, existing.candidates));
          }
        }

        // 최초 추천 또는 재추천 후보 소진 시: fresh 생성 후 새 Session 저장(candidate 플로우일 때만).
        if (result.length === 0) {
          const prefs = await getUserPreferences();
          let captured: { intent: import('../../lib/intent').PlanIntent; candidates: import('../../lib/candidate').Candidate[]; usedPlaceIds: string[] } | undefined;
          result = await generateDateCards(parsedInput, m, prefs, language, { onSession: (s) => { captured = s; } });
          sessionId = captured
            ? createSession({ mode: m, input: parsedInput, intent: captured.intent, candidates: captured.candidates, previousPlaceIds: captured.usedPlaceIds, prefs }).sessionId
            : undefined;
        }

        await logEvent('ai_card_created', { mode: m, card_count: result.length });
        if (cancelled) return;
        router.replace({
          pathname: isCourse ? '/mode-flow/course-result' : '/mode-flow/result',
          params: { mode: m, input: input ?? '{}', cards: JSON.stringify(result), ...(sessionId ? { sessionId } : {}) },
        } as any);
      } catch {
        if (!cancelled) setErrorMsg(t(isCourse ? 'modeFlow.generating.courseError' : 'modeFlow.generating.defaultError'));
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [input, language, mode, sessionIdParam, retryKey, steps.length, t]);

  if (errorMsg !== '') {
    return (
      <View style={s.container}>
        <View style={[s.iconWrap, s.iconWrapGray]}>
          <Sparkles size={56} strokeWidth={1.5} color={C.textSub} />
        </View>
        <Text style={s.heading}>{t('modeFlow.generating.errorTitle')}</Text>
        <Text style={s.errSub}>{errorMsg}{'\n'}{t('modeFlow.generating.errorSuffix')}</Text>
        <BigButton onPress={() => { setErrorMsg(''); setStep(0); setRetryKey(k => k + 1); }} style={s.retryBtn}>{t('modeFlow.result.retry')}</BigButton>
      </View>
    );
  }

  return <GeneratingView heading={heading} steps={steps} step={step} />;
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.pink,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  iconWrapGray: { backgroundColor: C.gray },
  retryBtn: { marginTop: 24 },
  heading: {
    fontSize: 22, fontWeight: '700', color: C.text,
    textAlign: 'center', lineHeight: 29,
    marginTop: 32, marginBottom: 32,
  },
  errSub: { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginTop: -16 },
});
