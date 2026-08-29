import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Calendar, Users, Signpost, MessageCircle, RotateCw, ChevronRight } from '../../components/iconography';
import { supabase } from '../../lib/supabase';
import { C, DS, G, R, SP } from '../../constants/theme';
import { BigButton, Header, ProgressDots, ScreenHeading } from '../../components/ui';
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
      <Header
        onBack={() => router.back()}
        center={<ProgressDots current={4} total={4} />}
        right={<Text style={s.stepCount}>4 / 4</Text>}
      />
      <ScreenHeading title={t('onboarding.type.title')} subtitle={t('onboarding.type.sub')} variant="input" />
      <View style={s.container}>
        <View style={s.optionList}>
          {OPTIONS.map((o) => {
            const sel = selected === o.id;
            return (
              <TouchableOpacity
                key={o.id}
                onPress={() => setSelected(o.id)}
                activeOpacity={0.88}
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
  container: { flex: 1, paddingHorizontal: DS.spacing.screen, paddingTop: DS.spacing.xxl, paddingBottom: DS.spacing.section },
  stepCount: { ...DS.typography.caption, color: C.textMuted },
  optionList: { gap: DS.spacing.md },
  option: {
    borderRadius: DS.radius.input,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.md,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    ...DS.elevation.raised,
  },
  optionSel: { backgroundColor: C.pinkLight, borderWidth: 1.5, borderColor: C.pinkBorder },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: DS.radius.full,
    backgroundColor: C.pinkLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconCircleSel: { backgroundColor: C.pink },
  optionText: { flex: 1, ...DS.typography.body, color: C.inkSoft },
  optionTextSel: { color: C.pinkDeep, fontWeight: '600' },
  spacer: { flex: 1 },
});
