import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { buildPickInput } from '../../lib/modeForm';
import { C } from '../../constants/colors';
import { BackBar, BigButton, LocationField } from '../../components/ui';

const ENERGY = [
  { v: 'low', label: '피곤해' },
  { v: 'medium', label: '보통' },
  { v: 'high', label: '쌩쌩해' },
];
const DISTANCES = [
  { v: 'near', label: '가까이' },
  { v: 'any', label: '상관없음' },
];
const BUDGETS = [
  { v: 'low', label: '아끼기' },
  { v: 'medium', label: '적당히' },
  { v: 'high', label: '특별하게' },
];
const DURATIONS = [
  { v: '1h', label: '1시간' },
  { v: '2-3h', label: '2~3시간' },
  { v: 'half_day', label: '반나절' },
  { v: 'full_day', label: '하루' },
];

export default function PickScreen() {
  const router = useRouter();
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
    label: string; items: { v: string; label: string }[]; value: string; onSelect: (v: string) => void;
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
              <Text style={[s.btnText, value === it.v && s.btnTextOn]}>{it.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <BackBar />
          <View style={{ marginTop: 16 }}>
            <Text style={s.heading}>조건만 알려주세요{'\n'}앱이 골라드릴게요</Text>
            <Text style={s.subText}>고민 없이 조건만 고르면 후보 3개를 뽑아드려요.</Text>
          </View>
          <Row label="컨디션" items={ENERGY} value={energy} onSelect={setEnergy} />
          <Row label="이동 거리" items={DISTANCES} value={distance} onSelect={setDistance} />
          <Row label="예산" items={BUDGETS} value={budget} onSelect={setBudget} />
          <Row label="시간" items={DURATIONS} value={duration} onSelect={setDuration} />
          <LocationField value={location} onChangeText={setLocation} coords={coords} onCoordsChange={setCoords} />
          <View style={{ height: 120 }} />
        </ScrollView>
        <View style={s.footer}>
          <BigButton onPress={handleGenerate}>데이트 후보 만들기</BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: {
    flex: 1, minWidth: 72, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border,
  },
  btnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  btnText: { fontSize: 13, color: '#4A4A55', fontWeight: '500' },
  btnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingBottom: 32, paddingTop: 16, backgroundColor: '#FFF8F3',
  },
});
