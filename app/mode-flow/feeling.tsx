import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { buildFeelingInput } from '../../lib/modeForm';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, Chip, LocationField, OptionCardPicker } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

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
    <SafeAreaView style={G.screen}>
      <View style={s.body}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <BackBar />
          <View style={s.headerWrap}>
            <Text style={s.heading}>{t('modeFlow.feeling.heading')}</Text>
            <Text style={s.subText}>{t('modeFlow.feeling.sub')}</Text>
          </View>

          <View style={s.freeInputWrap}>
            <TextInput
              style={s.freeInput}
              placeholder={t('modeFlow.feeling.placeholder')}
              placeholderTextColor={C.textFaint}
              value={freeText}
              onChangeText={setFreeText}
              multiline
            />
          </View>
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
        <View style={s.footer}>
          <BigButton onPress={handleGenerate}>{t('modeFlow.feeling.generate')}</BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  body: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  headerWrap: { marginTop: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  freeInputWrap: { backgroundColor: C.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, minHeight: 90, marginTop: 20 },
  freeInput: { fontSize: 13, color: C.text, lineHeight: 22 },
  hint: { fontSize: 12, color: C.textMuted, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footerSpacer: { height: 120 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 16, backgroundColor: C.bg },
});
