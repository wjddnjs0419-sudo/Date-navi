import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { logEvent } from '../../lib/analytics';
import {
  Utensils, Coffee, Trees, Sofa, Palette, Bike,
  Smile, Laugh, Moon, Sparkles, Camera, Gift,
  Car, Wallet, Users, Footprints, CalendarClock, MoonStar,
  Check,
} from '../../components/iconography';
import { C, DS, G } from '../../constants/theme';
import { BigButton, Header, ProgressDots, InfoNote, ScreenHeading } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { buildOnboardingPreferencesStepViewedParams, type OnboardingPreferencesStep } from '../../lib/analytics-course-actions';

type Step = 1 | 2 | 3 | 4;

const ONBOARDING_PREFERENCES_STEP_BY_STEP: Record<Step, OnboardingPreferencesStep> = {
  1: 'preferred',
  2: 'mood',
  3: 'avoid',
  4: 'long_distance',
};

export default function PreferencesScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const PREFERRED_OPTIONS = [
    { id: 'restaurant', label: t('onboarding.preferences.preferredOptions.restaurant'), Icon: Utensils },
    { id: 'cafe', label: t('onboarding.preferences.preferredOptions.cafe'), Icon: Coffee },
    { id: 'walk', label: t('onboarding.preferences.preferredOptions.walk'), Icon: Trees },
    { id: 'home', label: t('onboarding.preferences.preferredOptions.home'), Icon: Sofa },
    { id: 'culture', label: t('onboarding.preferences.preferredOptions.culture'), Icon: Palette },
    { id: 'activity', label: t('onboarding.preferences.preferredOptions.activity'), Icon: Bike },
  ];

  const AVOID_OPTIONS = [
    { id: 'far', label: t('onboarding.preferences.avoidOptions.far'), Icon: Car },
    { id: 'expensive', label: t('onboarding.preferences.avoidOptions.expensive'), Icon: Wallet },
    { id: 'crowded', label: t('onboarding.preferences.avoidOptions.crowded'), Icon: Users },
    { id: 'long_walk', label: t('onboarding.preferences.avoidOptions.long_walk'), Icon: Footprints },
    { id: 'complex_reservation', label: t('onboarding.preferences.avoidOptions.complex_reservation'), Icon: CalendarClock },
    { id: 'late_night', label: t('onboarding.preferences.avoidOptions.late_night'), Icon: MoonStar },
  ];

  const MOOD_OPTIONS = [
    { id: 'rest', label: t('onboarding.preferences.moodOptions.rest'), Icon: Smile },
    { id: 'laugh', label: t('onboarding.preferences.moodOptions.laugh'), Icon: Laugh },
    { id: 'quiet', label: t('onboarding.preferences.moodOptions.quiet'), Icon: Moon },
    { id: 'new', label: t('onboarding.preferences.moodOptions.new'), Icon: Sparkles },
    { id: 'photo', label: t('onboarding.preferences.moodOptions.photo'), Icon: Camera },
    { id: 'special', label: t('onboarding.preferences.moodOptions.special'), Icon: Gift },
  ];

  const LONG_DISTANCE_OPTIONS = [
    { id: 'yes', label: t('onboarding.preferences.longDistanceOptions.yes') },
    { id: 'no', label: t('onboarding.preferences.longDistanceOptions.no') },
    { id: 'sometimes', label: t('onboarding.preferences.longDistanceOptions.sometimes') },
  ];

  const STEP_TITLES: Record<Step, string> = {
    1: t('onboarding.preferences.stepTitles.1'),
    2: t('onboarding.preferences.stepTitles.2'),
    3: t('onboarding.preferences.stepTitles.3'),
    4: t('onboarding.preferences.stepTitles.4'),
  };

  const [step, setStep] = useState<Step>(1);
  const [preferred, setPreferred] = useState<string[]>([]);
  const [mood, setMood] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [longDistance, setLongDistance] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const previousStep = useRef<Step | null>(null);

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    void logEvent('onboarding_preferences_step_viewed', buildOnboardingPreferencesStepViewedParams(ONBOARDING_PREFERENCES_STEP_BY_STEP[step]));
  }, [step]);

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  }

  async function handleSave(skip = false) {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          preferred_tags: skip ? [] : preferred,
          avoid_tags: skip ? [] : avoid,
          mood_tags: skip ? [] : mood,
          is_long_distance: skip ? false : longDistance === 'yes',
          onboarding_completed: true,
        }, { onConflict: 'user_id' });
      if (error) throw error;

      await logEvent('onboarding_completed', { skipped: skip });
    } catch {
      Alert.alert(t('common.error'), t('onboarding.preferences.saveError'));
      setSaving(false);
      return;
    }
    setSaving(false);
    router.replace('/(tabs)' as any);
  }

  function handleNext() {
    if (step < 4) setStep((s) => (s + 1) as Step);
    else handleSave();
  }

  return (
    <SafeAreaView style={G.screen}>
      <Header
        onBack={step > 1 ? () => setStep((st) => (st - 1) as Step) : undefined}
        center={<ProgressDots current={step} total={4} />}
        right={<Text style={s.stepCount}>{step}/4</Text>}
      />
      <ScreenHeading title={STEP_TITLES[step]} variant="input" />
      <View style={s.container}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Step 1: 선호 활동 */}
          {step === 1 && (
            <>
              <OptionGrid
                options={PREFERRED_OPTIONS}
                selected={preferred}
                onToggle={(id) => toggle(preferred, setPreferred, id)}
              />
              <Text style={s.hint}>{t('onboarding.preferences.multiSelectHint')}</Text>
            </>
          )}

          {/* Step 2: 원하는 분위기 */}
          {step === 2 && (
            <OptionGrid
              options={MOOD_OPTIONS}
              selected={mood}
              onToggle={(id) => toggle(mood, setMood, id)}
            />
          )}

          {/* Step 3: 부담스러운 것 */}
          {step === 3 && (
            <>
              <OptionGrid
                options={AVOID_OPTIONS}
                selected={avoid}
                onToggle={(id) => toggle(avoid, setAvoid, id)}
              />
              <InfoNote style={s.infoNote}>
                {t('onboarding.preferences.avoidInfoNote')}
              </InfoNote>
            </>
          )}

          {/* Step 4: 장거리 여부 */}
          {step === 4 && (
            <View style={s.singleList}>
              {LONG_DISTANCE_OPTIONS.map((o) => {
                const sel = longDistance === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => setLongDistance(o.id)}
                    activeOpacity={0.88}
                    style={[s.singleBtn, sel && s.singleBtnOn]}
                  >
                    <View style={[s.radio, sel && s.radioOn]}>
                      {sel && <Check size={12} strokeWidth={3} color={C.white} />}
                    </View>
                    <Text style={[s.singleText, sel && s.singleTextOn]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* 하단 버튼 */}
        <View style={s.footer}>
          <BigButton onPress={handleNext} variant={saving ? 'disabled' : 'primary'}>
            {saving
              ? <ActivityIndicator color={C.white} size="small" />
              : step === 4 ? t('onboarding.preferences.finishCta') : t('common.next')}
          </BigButton>
          <TouchableOpacity onPress={() => handleSave(true)} activeOpacity={0.88} style={s.skipBtn}>
            <Text style={s.skipText}>{t('common.skip')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function OptionGrid({ options, selected, onToggle }: {
  options: { id: string; label: string; Icon: any }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <View style={grid.wrap}>
      {options.map((o) => {
        const isSel = selected.includes(o.id);
        return (
          <TouchableOpacity
            key={o.id}
            onPress={() => onToggle(o.id)}
            activeOpacity={0.88}
            style={[grid.card, isSel && grid.cardOn]}
          >
            <View style={[grid.iconBox, { backgroundColor: isSel ? C.white : C.cream, }]}>
              <o.Icon size={20} strokeWidth={1.8} color={isSel ? C.pinkDeep : C.creamFg} />
            </View>
            <Text style={[grid.label, isSel && grid.labelOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const grid = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: DS.spacing.md,
  },
  card: {
    width: '47%',
    borderRadius: DS.radius.chip,
    padding: DS.spacing.lg,
    gap: DS.spacing.md,
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  cardOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: DS.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...DS.typography.bodyCompact, color: C.inkSoft },
  labelOn: { color: C.pinkDeep, fontWeight: '600' },
});

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: DS.spacing.screen, paddingTop: DS.spacing.xxl, paddingBottom: DS.spacing.section },
  stepCount: { ...DS.typography.bodySmall, color: C.textLight },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: DS.spacing.screen },
  hint: { ...DS.typography.caption, color: C.textMuted, textAlign: 'center', marginTop: DS.spacing.lg },
  infoNote: { marginTop: DS.spacing.xxl },
  singleList: { gap: DS.spacing.sm },
  singleBtn: {
    borderRadius: DS.radius.input,
    paddingHorizontal: DS.spacing.lg,
    paddingVertical: DS.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  singleBtnOn: { backgroundColor: C.pinkLight, borderWidth: 1.5, borderColor: C.pinkBorder },
  singleText: { ...DS.typography.bodyCompact, color: C.inkSoft, flex: 1 },
  singleTextOn: { color: C.pinkDeep, fontWeight: '600' },
  radio: {
    width: 24, height: 24, borderRadius: DS.radius.full,
    borderWidth: 2, borderColor: C.onboardingCheckBorder,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    marginRight: DS.spacing.md,
  },
  radioOn: { borderColor: C.pink, backgroundColor: C.pink },
  footer: { gap: DS.spacing.xs },
  skipBtn: { alignItems: 'center', paddingVertical: DS.spacing.sm },
  skipText: { ...DS.typography.bodySmall, color: C.textMuted },
});
