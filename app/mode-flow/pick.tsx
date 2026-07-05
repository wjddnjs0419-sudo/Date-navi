import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { buildPickInput } from '../../lib/modeForm';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, LocationField, OptionCardPicker } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

const ENERGY = [
  { v: 'low', labelKey: 'modeFlow.option.energy.low' },
  { v: 'medium', labelKey: 'modeFlow.option.energy.medium' },
  { v: 'high', labelKey: 'modeFlow.option.energy.high' },
];
const DISTANCES = [
  { v: 'near', labelKey: 'modeFlow.option.distance.near' },
  { v: 'any', labelKey: 'modeFlow.option.distance.any' },
];
const BUDGETS = [
  { v: 'low', labelKey: 'modeFlow.option.budget.low' },
  { v: 'medium', labelKey: 'modeFlow.option.budget.medium' },
  { v: 'high', labelKey: 'modeFlow.option.budget.high' },
];
const DURATIONS = [
  { v: '1h', labelKey: 'modeFlow.option.duration.oneHour' },
  { v: '2-3h', labelKey: 'modeFlow.option.duration.twoThreeHours' },
  { v: 'half_day', labelKey: 'modeFlow.option.duration.halfDay' },
  { v: 'full_day', labelKey: 'modeFlow.option.duration.fullDay' },
];

export default function PickScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [energy, setEnergy] = useState('medium');
  const [distance, setDistance] = useState('near');
  const [budget, setBudget] = useState('low');
  const [duration, setDuration] = useState('2-3h');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ x: string; y: string } | null>(null);

  function handleGenerate() {
    const input = buildPickInput({ energy, budget, distance, duration, location, coords: coords ?? undefined });
    router.replace({
      pathname: '/mode-flow/generating',
      params: { mode: 'pick_for_me', input: JSON.stringify(input) },
    } as any);
  }

  function Row({ label, items, value, onSelect }: {
    label: string; items: { v: string; labelKey: string }[]; value: string; onSelect: (v: string) => void;
  }) {
    return (
      <>
        <Text style={s.sectionLabel}>{label}</Text>
        <View style={s.row}>
          {items.map(it => (
            <TouchableOpacity
              key={it.v}
              onPress={() => onSelect(it.v)}
              activeOpacity={0.7}
              style={[s.btn, value === it.v && s.btnOn]}
            >
              <Text style={[s.btnText, value === it.v && s.btnTextOn]}>{t(it.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.body}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <BackBar />
          <View style={s.headerWrap}>
            <Text style={s.heading}>{t('modeFlow.pick.heading')}</Text>
            <Text style={s.subText}>{t('modeFlow.pick.sub')}</Text>
          </View>
          <Row label={t('modeFlow.pick.energy')} items={ENERGY} value={energy} onSelect={setEnergy} />
          <Row label={t('modeFlow.pick.distance')} items={DISTANCES} value={distance} onSelect={setDistance} />
          <Row label={t('modeFlow.pick.budget')} items={BUDGETS} value={budget} onSelect={setBudget} />
          <Text style={s.sectionLabel}>{t('modeFlow.pick.duration')}</Text>
          <OptionCardPicker
            options={DURATIONS.map((d) => ({ value: d.v, label: t(d.labelKey) }))}
            value={duration}
            onChange={setDuration}
          />
          <LocationField value={location} onChangeText={setLocation} coords={coords} onCoordsChange={setCoords} />
          <View style={s.footerSpacer} />
        </ScrollView>
        <View style={s.footer}>
          <BigButton onPress={handleGenerate}>{t('modeFlow.pick.generate')}</BigButton>
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
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: {
    flex: 1, minWidth: 72, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border,
  },
  btnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  btnText: { fontSize: 13, color: C.inkSoft, fontWeight: '500' },
  btnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  footerSpacer: { height: 120 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingBottom: 32, paddingTop: 16, backgroundColor: C.bg,
  },
});
