import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Sparkles, Check } from 'lucide-react-native';
import { generateDateCards, getUserPreferences, type FeelingInput } from '../../lib/ai';
import { logEvent } from '../../lib/analytics';
import { useI18n } from '../../lib/i18n';
import { C } from '../../constants/colors';
import { BigButton } from '../../components/ui';

const COURSE_STEPS = [
  '취향과 분위기 확인 중',
  '장소 동선 짜는 중',
  '실패 확률 낮은 코스 찾는 중',
];

const DEFAULT_STEPS = [
  '오늘 컨디션 확인 중',
  '예산과 이동 부담 줄이는 중',
  '최적의 데이트 코스 찾는 중',
];

export default function GeneratingScreen() {
  const { mode, input } = useLocalSearchParams<{ mode: string; input: string }>();
  const router = useRouter();
  const { language } = useI18n();
  const [step, setStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  const isCourse = mode === 'make_course';
  const STEPS = isCourse ? COURSE_STEPS : DEFAULT_STEPS;
  const heading = isCourse
    ? '둘에게 맞는 코스를\n짜는 중이에요'
    : '둘에게 맞는 후보를\n고르는 중이에요';

  useEffect(() => {
    // 단계 표시는 실제 생성 시간 동안 진행하다 마지막 단계에서 대기한다.
    const interval = setInterval(() => {
      setStep(s => Math.min(s + 1, STEPS.length - 1));
    }, 1200);

    let cancelled = false;
    (async () => {
      try {
        const parsedInput: FeelingInput = JSON.parse(input ?? '{}');
        const prefs = await getUserPreferences();
        const m = mode ?? 'pick_for_me';
        await logEvent('mode_selected', { mode: m });
        const result = await generateDateCards(parsedInput, m, prefs, language);
        await logEvent('ai_card_created', { mode: m, card_count: result.length });
        if (cancelled) return;
        router.replace({
          pathname: isCourse ? '/mode-flow/course-result' : '/mode-flow/result',
          params: { mode: m, input: input ?? '{}', cards: JSON.stringify(result) },
        } as any);
      } catch {
        if (!cancelled) setErrorMsg(isCourse ? '코스를 만드는 중 문제가 생겼어요.' : '추천을 만드는 중 문제가 생겼어요.');
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [input, language, mode, retryKey]);

  if (errorMsg !== '') {
    return (
      <View style={s.container}>
        <View style={[s.iconWrap, { backgroundColor: C.gray }]}>
          <Sparkles size={56} strokeWidth={1.5} color={C.textSub} />
        </View>
        <Text style={s.heading}>잠깐 문제가 생겼어요</Text>
        <Text style={s.errSub}>{errorMsg}{'\n'}다시 한 번 시도해볼게요.</Text>
        <BigButton onPress={() => { setErrorMsg(''); setStep(0); setRetryKey(k => k + 1); }} style={{ marginTop: 24 }}>다시 시도하기</BigButton>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.iconWrap}>
        <Sparkles size={56} strokeWidth={1.5} color={C.pink} />
      </View>

      <Text style={s.heading}>{heading}</Text>

      <View style={s.stepList}>
        {STEPS.map((label, i) => (
          <View key={label} style={s.stepRow}>
            <View style={[
              s.stepDot,
              { backgroundColor: step > i ? C.mintFg : step === i ? C.pink : '#E0D5CB' },
            ]}>
              {step > i && <Check size={10} color={C.white} strokeWidth={3} />}
            </View>
            <Text style={[
              s.stepText,
              {
                color: step > i ? C.mintFg : step === i ? C.text : C.textMuted,
                fontWeight: step === i ? '600' : '500',
                opacity: step < i ? 0.4 : 1,
              },
            ]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F3',
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
  heading: {
    fontSize: 22, fontWeight: '700', color: C.text,
    textAlign: 'center', lineHeight: 29,
    marginTop: 32, marginBottom: 32,
  },
  errSub: { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginTop: -16 },
  stepList: { width: '100%', maxWidth: 260, gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDot: {
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { fontSize: 13 },
});
