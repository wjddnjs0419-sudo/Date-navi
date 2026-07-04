import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, ProgressDots } from '../../components/ui';

const OPTIONS = [
  { id: 'planner', label: '자주 계획하는 편이에요' },
  { id: 'together', label: '같이 정하는 편이에요' },
  { id: 'chooser', label: '고르는 건 괜찮지만 계획은 어려워요' },
  { id: 'shy', label: '의견을 말하기가 조금 어려워요' },
  { id: 'flexible', label: '그때그때 달라요' },
];

export default function TypeScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      await supabase
        .from('user_preferences')
        .upsert(
          { user_id: user.id, planning_style: selected ?? 'flexible' },
          { onConflict: 'user_id' },
        );
    } catch {
      // 에러 무시하고 다음 단계 진행
    } finally {
      setLoading(false);
    }
    router.replace('/onboarding/couple-connect' as any);
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.container}>
        <BackBar />
        <View style={s.progressRow}>
          <ProgressDots current={4} total={4} />
          <Text style={s.stepCount}>4 / 4</Text>
        </View>

        <View style={s.headingBlock}>
          <Text style={s.heading}>{'데이트 계획,\n보통 어떻게 하세요?'}</Text>
          <Text style={s.subText}>
            유형을 정하는 게 아니라, 첫 추천을 더 잘 맞추기 위한 힌트예요.
          </Text>
        </View>

        <View style={s.optionList}>
          {OPTIONS.map((o) => {
            const sel = selected === o.id;
            return (
              <TouchableOpacity
                key={o.id}
                onPress={() => setSelected(o.id)}
                activeOpacity={0.7}
                style={[s.option, sel && s.optionSel]}
              >
                <Text style={[s.optionText, sel && s.optionTextSel]}>{o.label}</Text>
                {sel && <Check size={16} strokeWidth={2.5} color={C.pink} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.spacer} />

        <BigButton onPress={handleStart} variant={loading ? 'disabled' : 'primary'}>
          {loading
            ? <ActivityIndicator color={C.white} size="small" />
            : '시작하기'}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  stepCount: { fontSize: 11, color: C.textMuted },
  headingBlock: { marginTop: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, marginTop: 8, lineHeight: 20 },
  optionList: { marginTop: 24, gap: 8 },
  option: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  optionSel: { backgroundColor: C.pinkLight, borderWidth: 1.5, borderColor: C.pinkBorder },
  optionText: { fontSize: 13, color: C.inkSoft, fontWeight: '500' },
  optionTextSel: { color: C.pinkDeep, fontWeight: '600' },
  spacer: { flex: 1 },
});
