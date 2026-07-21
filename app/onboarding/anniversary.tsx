import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, ProgressDots, SoftCard } from '../../components/ui';
import { Illustration } from '../../components/illustration';
import { DateWheelPicker, parseIsoDate } from '../../components/pickers';
import { useI18n } from '../../lib/i18n';

const YEARS = Array.from({ length: 30 }, (_, i) => String(new Date().getFullYear() - i));

function daysBetween(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function AnniversaryScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [year, setYear] = useState('2024');
  const [month, setMonth] = useState('03');
  const [day, setDay] = useState('14');
  const [loading, setLoading] = useState(false);

  const dateStr = `${year}-${month}-${day}`;
  const days = daysBetween(dateStr);

  async function handleNext() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      await supabase
        .rpc('set_date_planner_couple_anniversary', { p_anniversary_date: dateStr });
    } catch {
      // 에러 무시하고 다음 단계 진행
    } finally {
      setLoading(false);
    }
    router.push('/onboarding/type' as any);
  }

  function handleSkip() {
    router.push('/onboarding/type' as any);
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.container}>
        <BackBar />
        <View style={s.progressRow}>
          <ProgressDots current={3} total={4} />
          <Text style={s.stepCount}>3 / 4</Text>
        </View>

        <View style={s.headingBlock}>
          <Text style={s.heading}>{t('onboarding.anniversary.heading')}</Text>
          <Text style={s.subText}>{t('onboarding.anniversary.subtitle')}</Text>
        </View>

        <View style={s.dateRow}>
          <DateWheelPicker
            value={dateStr}
            minYear={Number(YEARS[YEARS.length - 1])}
            maxYear={Number(YEARS[0])}
            onChange={(next) => {
              const parsed = parseIsoDate(next);
              if (!parsed) return;
              setYear(parsed.year);
              setMonth(parsed.month);
              setDay(parsed.day);
            }}
          />
        </View>

        {days >= 0 && (
          <SoftCard style={s.daysCard}>
            <Illustration name="mascot-heart-single" width={64} style={s.daysMascot} />
            <View style={s.daysBody}>
              <View style={s.daysRow}>
                <Heart size={14} color={C.pinkDeep} fill={C.pinkDeep} strokeWidth={0} />
                <Text style={s.daysText}>{t('onboarding.anniversary.daysCountText', { days })}</Text>
              </View>
              <Text style={s.daysHint}>{t('onboarding.anniversary.daysHint')}</Text>
            </View>
          </SoftCard>
        )}

        <View style={s.spacer} />

        <View style={s.footer}>
          <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
            <Text style={s.skipText}>{t('onboarding.anniversary.skipCta')}</Text>
          </TouchableOpacity>
          <BigButton onPress={handleNext} variant={loading ? 'disabled' : 'primary'}>
            {loading ? t('common.saving') : t('common.next')}
          </BigButton>
        </View>
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
  subText: { fontSize: 13, color: C.textSub, marginTop: 8 },
  dateRow: { marginTop: 24 },
  daysCard: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.cream,
    borderColor: '#F2DDB0',
  },
  daysMascot: { flexShrink: 0 },
  daysBody: { flex: 1 },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  daysText: { fontSize: 13, color: C.creamFg, fontWeight: '700' },
  daysHint: { fontSize: 12, color: C.grayFg, lineHeight: 18, marginTop: 6 },
  footer: { gap: 12 },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 12, color: C.textMuted },
  spacer: { flex: 1, minHeight: 16 },
});
