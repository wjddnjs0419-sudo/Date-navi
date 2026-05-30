import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { FeelingInput } from '../../lib/ai';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Chip } from '../../components/ui';

export default function FeelingScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const router = useRouter();

  const [freeText, setFreeText] = useState('');
  const [selectedChips, setSelectedChips] = useState<string[]>(['피곤해', '가까운 곳이 좋아', '맛있는 거 먹고 싶어']);
  const [budget, setBudget] = useState<string>('아끼기');
  const [duration, setDuration] = useState<string>('2~3시간');

  const QUICK_CHIPS = [
    '피곤해', '돈 아끼고 싶어', '가까운 곳이 좋아',
    '실내가 좋아', '맛있는 거 먹고 싶어', '사진 찍고 싶어',
    '조용한 곳이 좋아', '특별하게 보내고 싶어',
  ];
  const BUDGETS = ['아끼기', '적당히', '특별하게'];
  const DURATIONS = ['1시간', '2~3시간', '반나절', '하루'];

  function toggleChip(chip: string) {
    setSelectedChips(prev =>
      prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip],
    );
  }

  function handleGenerate() {
    const input: FeelingInput = {
      energy: selectedChips.includes('피곤해') ? 'low' : 'medium',
      budget: budget === '아끼기' ? 'low' : budget === '적당히' ? 'medium' : 'high',
      distance: selectedChips.includes('가까운 곳이 좋아') ? 'near' : 'any',
      mood: selectedChips.includes('특별하게 보내고 싶어') ? 'special' : 'comfortable',
      duration: duration === '1시간' ? '1h' : duration === '2~3시간' ? '2-3h' : duration === '반나절' ? 'half_day' : 'full_day',
      avoid: [],
      freeText: freeText.trim() || undefined,
    };
    router.push({
      pathname: '/mode-flow/generating',
      params: { mode: mode ?? 'pick_for_me', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <BackBar />
          <View style={{ marginTop: 16 }}>
            <Text style={s.heading}>오늘 끌리는 느낌만{'\n'}알려주세요</Text>
            <Text style={s.subText}>대충 말해도 괜찮아요. 앱이 데이트 후보로 정리해드릴게요.</Text>
          </View>

          {/* 자유 입력 */}
          <View style={s.freeInputWrap}>
            <TextInput
              style={s.freeInput}
              placeholder="예: 오늘은 피곤해서 멀리 가긴 싫고, 맛있는 건 먹고 싶어."
              placeholderTextColor={C.textFaint}
              value={freeText}
              onChangeText={setFreeText}
              multiline
            />
          </View>

          {/* 빠른 선택 */}
          <Text style={s.sectionLabel}>빠른 선택</Text>
          <View style={s.chips}>
            {QUICK_CHIPS.map((chip) => (
              <Chip
                key={chip}
                selected={selectedChips.includes(chip)}
                tone="pink"
                onPress={() => toggleChip(chip)}
              >
                {chip}
              </Chip>
            ))}
          </View>

          {/* 예산 */}
          <Text style={s.sectionLabel}>예산</Text>
          <View style={s.triRow}>
            {BUDGETS.map((b) => (
              <TouchableOpacity
                key={b}
                onPress={() => setBudget(b)}
                activeOpacity={0.7}
                style={[s.triBtn, budget === b && s.triBtnOn]}
              >
                <Text style={[s.triBtnText, budget === b && s.triBtnTextOn]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 시간 */}
          <Text style={s.sectionLabel}>시간</Text>
          <View style={s.quadRow}>
            {DURATIONS.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setDuration(d)}
                activeOpacity={0.7}
                style={[s.quadBtn, duration === d && s.quadBtnOn]}
              >
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
  freeInputWrap: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 90,
    marginTop: 20,
  },
  freeInput: { fontSize: 13, color: C.text, lineHeight: 22 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  triRow: { flexDirection: 'row', gap: 8 },
  triBtn: {
    flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border,
  },
  triBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  triBtnText: { fontSize: 13, color: '#4A4A55', fontWeight: '500' },
  triBtnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  quadRow: { flexDirection: 'row', gap: 8 },
  quadBtn: {
    flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border,
  },
  quadBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  quadBtnText: { fontSize: 12, color: '#4A4A55', fontWeight: '500' },
  quadBtnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 16,
    backgroundColor: '#FFF8F3',
  },
});
