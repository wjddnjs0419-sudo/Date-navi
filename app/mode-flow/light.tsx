import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Leaf } from 'lucide-react-native';
import { buildLightInput } from '../../lib/modeForm';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, LocationField, OptionCardPicker } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

const DURATIONS = [
  { v: '1h', labelKey: 'modeFlow.option.duration.oneHour' },
  { v: '2-3h', labelKey: 'modeFlow.option.duration.twoThreeHours' },
  { v: 'half_day', labelKey: 'modeFlow.option.duration.halfDay' },
];

export default function LightScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [duration, setDuration] = useState('1h');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ x: string; y: string } | null>(null);

  function handleGenerate() {
    const input = buildLightInput({ duration, location, coords: coords ?? undefined });
    router.replace({
      pathname: '/mode-flow/generating',
      params: { mode: 'light', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.body}>
        <View style={s.content}>
          <BackBar />
          <View style={s.iconBox}>
            <Leaf size={28} strokeWidth={1.8} color={C.creamFg} />
          </View>
          <Text style={s.heading}>{t('modeFlow.light.heading')}</Text>
          <Text style={s.subText}>{t('modeFlow.light.sub')}</Text>

          <Text style={s.sectionLabel}>{t('modeFlow.light.duration')}</Text>
          <OptionCardPicker
            options={DURATIONS.map((d) => ({ value: d.v, label: t(d.labelKey) }))}
            value={duration}
            onChange={setDuration}
          />
          <LocationField value={location} onChangeText={setLocation} coords={coords} onCoordsChange={setCoords} />
        </View>
        <View style={s.footer}>
          <BigButton onPress={handleGenerate}>{t('modeFlow.light.generate')}</BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  body: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  iconBox: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29, marginTop: 16 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 28, marginBottom: 8 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 16, backgroundColor: C.bg },
});
