import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BigButton } from '../../components/ui';

export const SOFT_CARDS = [
  '오늘은 조금 피곤해',
  '돈을 조금 아끼고 싶어',
  '멀리 가긴 어려워',
  '사람 많은 곳은 부담돼',
  '아이디어는 좋은데 날짜를 바꾸고 싶어',
  '장소는 별로지만 분위기는 좋아',
  '그래도 같이 있고 싶어',
];

export const SOFT_TONES = ['다정하게', '가볍게', '솔직하게'];

export default function SoftMessageScreen() {
  const router = useRouter();
  const [selCard, setSelCard] = useState<number | null>(null);
  const [selTone, setSelTone] = useState(0);
  const [freeText, setFreeText] = useState('');

  function handleGenerate() {
    if (selCard === null) return;
    router.push({
      pathname: '/soft-message/result',
      params: {
        card: SOFT_CARDS[selCard],
        tone: SOFT_TONES[selTone],
        free: freeText.trim(),
      },
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.heading}>말하기 어려운{'\n'}마음이 있나요?</Text>
          <Text style={s.subText}>고르고 나면 앱이 부드러운 문장으로 바꿔드릴게요.</Text>

          <View style={{ marginTop: 20, gap: 8 }}>
            {SOFT_CARDS.map((c, i) => {
              const sel = i === selCard;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setSelCard(i)}
                  activeOpacity={0.7}
                  style={[s.cardBtn, sel && s.cardBtnOn]}
                >
                  <Text style={[s.cardBtnText, sel && s.cardBtnTextOn]}>{c}</Text>
                  {sel && <Check size={16} color={C.pink} strokeWidth={2.5} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.sectionLabel}>톤 선택</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SOFT_TONES.map((t, i) => {
              const sel = i === selTone;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setSelTone(i)}
                  activeOpacity={0.7}
                  style={[s.toneBtn, sel && s.toneBtnOn]}
                >
                  <Text style={[s.toneBtnText, sel && s.toneBtnTextOn]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[s.sectionLabel, { marginTop: 20 }]}>추가로 하고 싶은 말 (선택)</Text>
          <View style={s.freeInputWrap}>
            <TextInput
              style={s.freeInput}
              value={freeText}
              onChangeText={setFreeText}
              placeholder="자유롭게 적어주세요"
              placeholderTextColor={C.textFaint}
              multiline
              maxLength={100}
            />
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={s.footer}>
          <BigButton
            onPress={handleGenerate}
            variant={selCard === null ? 'disabled' : 'primary'}
          >
            문장 만들어줘
          </BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  cardBtn: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardBtnOn: { backgroundColor: C.pinkLight, borderWidth: 1.5, borderColor: C.pinkBorder },
  cardBtnText: { fontSize: 13, color: '#4A4A55', fontWeight: '500' },
  cardBtnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  toneBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  toneBtnOn: { backgroundColor: C.lavender, borderColor: '#C9B8FF' },
  toneBtnText: { fontSize: 13, color: '#4A4A55', fontWeight: '500' },
  toneBtnTextOn: { color: C.lavenderFg, fontWeight: '600' },
  freeInputWrap: {
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    minHeight: 80,
  },
  freeInput: { fontSize: 13, color: C.text, lineHeight: 20 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: '#FFF8F3',
  },
});
