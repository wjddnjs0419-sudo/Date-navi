import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Gift, MessageCircle, Map, Leaf, Plane, Check } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BigButton } from '../../components/ui';

const MODES = [
  { id: 'pick_for_me', title: '앱이 골라줘', desc: '조건만 고르면 후보 3개를 뽑아드릴게요.', Icon: Gift },
  { id: 'feeling', title: '느낌만 말할게', desc: '하고 싶은 분위기만 남겨도 괜찮아요.', Icon: MessageCircle },
  { id: 'make_course', title: '코스로 정리해줘', desc: '러프한 아이디어를 시간, 예산, 준비물까지 정리해요.', Icon: Map },
  { id: 'light', title: '가볍게 하고 싶어', desc: '피곤한 날, 돈 아끼는 날에 좋아요.', Icon: Leaf },
  { id: 'next_meet', title: '다음에 만나면', desc: '장거리 커플의 다음 만남 버킷리스트.', Icon: Plane },
];

export default function ModeScreen() {
  const router = useRouter();
  const [selIdx, setSelIdx] = useState(0);

  function handleStart() {
    const mode = MODES[selIdx];
    const routes: Record<string, string> = {
      pick_for_me: '/mode-flow/pick',
      feeling: '/mode-flow/feeling',
      light: '/mode-flow/light',
      make_course: '/mode-flow/course',
      next_meet: '/mode-flow/bucketlist',
    };
    const path = routes[mode.id];
    if (path) router.push(path as any);
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.flex1}>
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.heading}>오늘은 앱이 어떻게{'\n'}도와주면 좋을까요?</Text>
          <Text style={s.subText}>상황은 매번 달라질 수 있어요. 지금 필요한 도움만 골라주세요.</Text>

          <View style={s.modeList}>
            {MODES.map((m, i) => {
              const sel = i === selIdx;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setSelIdx(i)}
                  activeOpacity={0.7}
                  style={[s.modeCard, sel && s.modeCardOn]}
                >
                  <View style={s.modeCardLeft}>
                    <View style={[s.iconBox, sel ? s.iconBoxOn : s.iconBoxOff]}>
                      <m.Icon size={20} strokeWidth={1.8} color={sel ? C.pinkDeep : C.creamFg} />
                    </View>
                    <View style={s.flex1}>
                      <Text style={[s.modeTitle, sel && s.modeTitleOn]}>{m.title}</Text>
                      <Text style={s.modeDesc}>{m.desc}</Text>
                    </View>
                  </View>
                  {sel && <Check size={18} color={C.pink} strokeWidth={2.5} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.bottomSpacer} />
        </ScrollView>

        {/* 고정 하단 버튼 */}
        <View style={s.footer}>
          <BigButton onPress={handleStart}>이 모드로 시작하기</BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  bottomSpacer: { height: 120 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8, marginBottom: 20 },
  modeList: { gap: 10 },
  modeCard: {
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeCardOn: { backgroundColor: C.pinkLight, borderWidth: 1.5, borderColor: C.pinkBorder },
  modeCardLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  iconBox: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconBoxOn: { backgroundColor: C.white },
  iconBoxOff: { backgroundColor: C.cream },
  modeTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  modeTitleOn: { color: C.pinkDeep },
  modeDesc: { fontSize: 12, color: C.textSub, lineHeight: 18, marginTop: 4 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.bg,
  },
});
