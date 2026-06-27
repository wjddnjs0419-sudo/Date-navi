import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Sparkles, Check } from 'lucide-react-native';
import { C } from '../../constants/colors';

const STEPS = [
  '오늘 컨디션 확인 중',
  '예산과 이동 부담 줄이는 중',
  '실패 확률 낮은 데이트 찾는 중',
];

export default function GeneratingScreen() {
  const { mode, input } = useLocalSearchParams<{ mode: string; input: string }>();
  const router = useRouter();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => Math.min(s + 1, STEPS.length));
    }, 700);

    const timer = setTimeout(() => {
      clearInterval(interval);
      router.replace({
        pathname: '/mode-flow/result',
        params: { mode, input },
      } as any);
    }, 2600);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, []);

  return (
    <View style={s.container}>
      <View style={s.iconWrap}>
        <Sparkles size={56} strokeWidth={1.5} color={C.pink} />
      </View>

      <Text style={s.heading}>둘에게 맞는 후보를{'\n'}고르는 중이에요</Text>

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
  stepList: { width: '100%', maxWidth: 260, gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDot: {
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { fontSize: 13 },
});
