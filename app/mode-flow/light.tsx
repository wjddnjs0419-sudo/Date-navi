import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Leaf } from 'lucide-react-native';
import { buildLightInput } from '../../lib/modeForm';
import { C } from '../../constants/colors';
import { BackBar, BigButton } from '../../components/ui';

const DURATIONS = [
  { v: '1h', label: '1시간' },
  { v: '2-3h', label: '2~3시간' },
  { v: 'half_day', label: '반나절' },
];

export default function LightScreen() {
  const router = useRouter();
  const [duration, setDuration] = useState('1h');

  function handleGenerate() {
    const input = buildLightInput({ duration });
    router.replace({
      pathname: '/mode-flow/generating',
      params: { mode: 'light', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <View style={{ flex: 1 }}>
        <View style={s.content}>
          <BackBar />
          <View style={s.iconBox}>
            <Leaf size={28} strokeWidth={1.8} color={C.creamFg} />
          </View>
          <Text style={s.heading}>오늘은 가볍게{'\n'}만나요</Text>
          <Text style={s.subText}>돈도 시간도 부담 없이. 가까운 곳에서 즐길 후보만 골라드릴게요.</Text>

          <Text style={s.sectionLabel}>얼마나 함께할까요?</Text>
          <View style={s.row}>
            {DURATIONS.map(d => (
              <TouchableOpacity key={d.v} onPress={() => setDuration(d.v)} activeOpacity={0.7} style={[s.btn, duration === d.v && s.btnOn]}>
                <Text style={[s.btnText, duration === d.v && s.btnTextOn]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={s.footer}>
          <BigButton onPress={handleGenerate}>가벼운 후보 만들기</BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  iconBox: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29, marginTop: 16 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 28, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border },
  btnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  btnText: { fontSize: 13, color: '#4A4A55', fontWeight: '500' },
  btnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 16, backgroundColor: '#FFF8F3' },
});
