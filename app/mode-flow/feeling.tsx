import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { buildFeelingInput } from '../../lib/modeForm';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Chip } from '../../components/ui';

const MOODS = [
  { v: 'comfortable', label: '편안하게' },
  { v: 'fun', label: '활기차게' },
  { v: 'romantic', label: '로맨틱하게' },
  { v: 'quiet', label: '조용하게' },
  { v: 'new', label: '새롭게' },
];
const BUDGETS = ['아끼기', '적당히', '특별하게'];
const DURATIONS = ['1시간', '2~3시간', '반나절', '하루'];

export default function FeelingScreen() {
  const router = useRouter();
  const [freeText, setFreeText] = useState('');
  const [mood, setMood] = useState('comfortable');
  const [budget, setBudget] = useState('아끼기');
  const [duration, setDuration] = useState('2~3시간');

  function handleGenerate() {
    const input = buildFeelingInput({
      mood,
      freeText,
      budget: budget === '아끼기' ? 'low' : budget === '적당히' ? 'medium' : 'high',
      duration: duration === '1시간' ? '1h' : duration === '2~3시간' ? '2-3h' : duration === '반나절' ? 'half_day' : 'full_day',
    });
    router.push({
      pathname: '/mode-flow/generating',
      params: { mode: 'feeling', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <BackBar />
          <View style={{ marginTop: 16 }}>
            <Text style={s.heading}>오늘 끌리는 느낌만{'\n'}알려주세요</Text>
            <Text style={s.subText}>대충 말해도 괜찮아요. 분위기를 데이트 카드로 정리해드릴게요.</Text>
          </View>

          <View style={s.freeInputWrap}>
            <TextInput
              style={s.freeInput}
              placeholder="예: 오늘은 조용히 대화하면서 분위기 있는 데가 좋아."
              placeholderTextColor={C.textFaint}
              value={freeText}
              onChangeText={setFreeText}
              multiline
            />
          </View>

          <Text style={s.sectionLabel}>분위기</Text>
          <View style={s.chips}>
            {MOODS.map(m => (
              <Chip key={m.v} selected={mood === m.v} tone="pink" onPress={() => setMood(m.v)}>
                {m.label}
              </Chip>
            ))}
          </View>

          <Text style={s.sectionLabel}>예산</Text>
          <View style={s.triRow}>
            {BUDGETS.map(b => (
              <TouchableOpacity key={b} onPress={() => setBudget(b)} activeOpacity={0.7} style={[s.triBtn, budget === b && s.triBtnOn]}>
                <Text style={[s.triBtnText, budget === b && s.triBtnTextOn]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.sectionLabel}>시간</Text>
          <View style={s.quadRow}>
            {DURATIONS.map(d => (
              <TouchableOpacity key={d} onPress={() => setDuration(d)} activeOpacity={0.7} style={[s.quadBtn, duration === d && s.quadBtnOn]}>
                <Text style={[s.quadBtnText, duration === d && s.quadBtnTextOn]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

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
  freeInputWrap: { backgroundColor: C.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, minHeight: 90, marginTop: 20 },
  freeInput: { fontSize: 13, color: C.text, lineHeight: 22 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  triRow: { flexDirection: 'row', gap: 8 },
  triBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border },
  triBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  triBtnText: { fontSize: 13, color: '#4A4A55', fontWeight: '500' },
  triBtnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  quadRow: { flexDirection: 'row', gap: 8 },
  quadBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border },
  quadBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  quadBtnText: { fontSize: 12, color: '#4A4A55', fontWeight: '500' },
  quadBtnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 16, backgroundColor: '#FFF8F3' },
});
