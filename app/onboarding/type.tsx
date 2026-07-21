import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Calendar, Users, Signpost, MessageCircle, RotateCw, ChevronRight } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import { G, R, SP } from '../../constants/theme';
import { BackBar, BigButton, ProgressDots } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

const OPTIONS = [
  { id: 'planner', labelKey: 'onboarding.type.options.planner', Icon: Calendar },
  { id: 'together', labelKey: 'onboarding.type.options.together', Icon: Users },
  { id: 'chooser', labelKey: 'onboarding.type.options.chooser', Icon: Signpost },
  { id: 'shy', labelKey: 'onboarding.type.options.shy', Icon: MessageCircle },
  { id: 'flexible', labelKey: 'onboarding.type.options.flexible', Icon: RotateCw },
];

export default function TypeScreen() {
  const router = useRouter();
  const { t } = useI18n();
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
    router.push('/onboarding/couple-choice' as any);
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
          <Text style={s.heading}>{t('onboarding.type.title')}</Text>
          <Text style={s.subText}>
            {t('onboarding.type.sub')}
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
                <View style={[s.iconCircle, sel && s.iconCircleSel]}>
                  <o.Icon size={20} strokeWidth={2} color={sel ? C.white : C.pink} />
                </View>
                <Text style={[s.optionText, sel && s.optionTextSel]}>{t(o.labelKey)}</Text>
                <ChevronRight size={18} strokeWidth={2} color={sel ? C.pinkBorder : C.textFaint} />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.spacer} />

        <BigButton onPress={handleStart} variant={loading ? 'disabled' : 'primary'}>
          {loading
            ? <ActivityIndicator color={C.white} size="small" />
            : t('onboarding.type.start')}
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
  optionList: { marginTop: 24, gap: 12 },
  option: {
    borderRadius: R.lg,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.md,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  optionSel: { backgroundColor: C.pinkLight, borderWidth: 1.5, borderColor: C.pinkBorder },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.pinkLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconCircleSel: { backgroundColor: C.pink },
  optionText: { flex: 1, fontSize: 14, color: C.inkSoft, fontWeight: '500' },
  optionTextSel: { color: C.pinkDeep, fontWeight: '600' },
  spacer: { flex: 1 },
});
