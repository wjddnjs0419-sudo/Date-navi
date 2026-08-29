import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { buildFeelingInput } from '../../lib/modeForm';
import { C } from '../../constants/colors';
import { DS, G, SP } from '../../constants/theme';
import { BigButton, Chip, Header, InputField, LocationField, OptionCardPicker, ScreenHeading } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { useOptionalSafeAreaInsets } from '../../lib/use-optional-safe-area-insets';

const MOODS = [
  { v: 'comfortable', labelKey: 'modeFlow.option.mood.comfortable' },
  { v: 'fun', labelKey: 'modeFlow.option.mood.fun' },
  { v: 'romantic', labelKey: 'modeFlow.option.mood.romantic' },
  { v: 'quiet', labelKey: 'modeFlow.option.mood.quiet' },
  { v: 'new', labelKey: 'modeFlow.option.mood.new' },
];
const DURATIONS = [
  { value: '1h', labelKey: 'modeFlow.option.duration.oneHour' },
  { value: '2-3h', labelKey: 'modeFlow.option.duration.twoThreeHours' },
  { value: 'half_day', labelKey: 'modeFlow.option.duration.halfDay' },
  { value: 'full_day', labelKey: 'modeFlow.option.duration.fullDay' },
];

export default function FeelingScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useOptionalSafeAreaInsets();
  const [freeText, setFreeText] = useState('');
  const [mood, setMood] = useState('comfortable');
  const [duration, setDuration] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ x: string; y: string } | null>(null);

  function handleGenerate() {
    const input = buildFeelingInput({
      mood,
      freeText,
      location,
      duration,
      coords: coords ?? undefined,
    });
    router.replace({
      pathname: '/mode-flow/generating',
      params: { mode: 'feeling', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={G.screen} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('modeFlow.feeling.heading')} subtitle={t('modeFlow.feeling.sub')} variant="input" />
      <View style={s.body}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <InputField
            value={freeText}
            onChangeText={setFreeText}
            placeholder={t('modeFlow.feeling.placeholder')}
            multiline
            inputStyle={s.freeInput}
          />
          <Text style={s.hint}>{t('modeFlow.feeling.freeTextHint')}</Text>

          <Text style={s.sectionLabel}>{t('modeFlow.feeling.mood')}</Text>
          <View style={s.chips}>
            {MOODS.map(m => (
              <Chip key={m.v} selected={mood === m.v} tone="pink" onPress={() => setMood(m.v)}>
                {t(m.labelKey)}
              </Chip>
            ))}
          </View>

          <Text style={s.sectionLabel}>{t('modeFlow.feeling.duration')}</Text>
          <OptionCardPicker
            options={DURATIONS.map((d) => ({ value: d.value, label: t(d.labelKey) }))}
            value={duration}
            onChange={setDuration}
          />

          <LocationField value={location} onChangeText={setLocation} coords={coords} onCoordsChange={setCoords} />

          <View style={s.footerSpacer} />
        </ScrollView>
        <View style={[s.footer, { paddingBottom: SP.screen + insets.bottom }]}>
          <BigButton onPress={handleGenerate}>{t('modeFlow.feeling.generate')}</BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  body: { flex: 1 },
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.hero },
  freeInput: { ...DS.typography.bodyCompact, color: C.text },
  hint: { ...DS.typography.bodySmall, color: C.textMuted, marginTop: SP.sm },
  sectionLabel: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.text, marginTop: SP.xxl, marginBottom: SP.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  footerSpacer: { height: 120 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: SP.screen, paddingBottom: SP.screen, paddingTop: SP.lg, backgroundColor: C.bg },
});
