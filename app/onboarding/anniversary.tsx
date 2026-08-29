import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Heart } from '../../components/iconography';
import { supabase } from '../../lib/supabase';
import { C, DS, G } from '../../constants/theme';
import { BigButton, Header, ProgressDots, ScreenHeading, SoftCard } from '../../components/ui';
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
      <Header
        onBack={() => router.back()}
        center={<ProgressDots current={3} total={4} />}
        right={<Text style={s.stepCount}>3 / 4</Text>}
      />
      <ScreenHeading title={t('onboarding.anniversary.heading')} subtitle={t('onboarding.anniversary.subtitle')} variant="input" />
      <View style={s.container}>
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
          <TouchableOpacity style={s.skipBtn} onPress={handleSkip} activeOpacity={0.88}>
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
  container: { flex: 1, paddingHorizontal: DS.spacing.screen, paddingTop: DS.spacing.xxl, paddingBottom: DS.spacing.section },
  stepCount: { ...DS.typography.caption, color: C.textMuted },
  dateRow: {},
  daysCard: {
    marginTop: DS.spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: DS.spacing.md,
    backgroundColor: C.cream,
    borderColor: C.anniversaryBorder,
  },
  daysMascot: { flexShrink: 0 },
  daysBody: { flex: 1 },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: DS.spacing.sm },
  daysText: { ...DS.typography.bodyCompact, color: C.creamFg, fontWeight: '700' },
  daysHint: { ...DS.typography.bodySmall, color: C.grayFg, marginTop: DS.spacing.sm },
  footer: { gap: DS.spacing.md },
  skipBtn: { alignItems: 'center', paddingVertical: DS.spacing.sm },
  skipText: { ...DS.typography.bodySmall, color: C.textMuted },
  spacer: { flex: 1, minHeight: 16 },
});
