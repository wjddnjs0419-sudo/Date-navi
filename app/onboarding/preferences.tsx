import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { logEvent } from '../../lib/analytics';
import {
  Utensils, Coffee, Trees, Sofa, Palette, Bike,
  Smile, Laugh, Moon, Sparkles, Camera, Gift,
  Car, Wallet, Users, Footprints, CalendarClock, MoonStar,
  Check,
} from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, ProgressDots, InfoNote } from '../../components/ui';

type Step = 1 | 2 | 3 | 4;

const PREFERRED_OPTIONS = [
  { id: 'restaurant', label: '맛집', Icon: Utensils },
  { id: 'cafe', label: '카페', Icon: Coffee },
  { id: 'walk', label: '산책', Icon: Trees },
  { id: 'home', label: '집데이트', Icon: Sofa },
  { id: 'culture', label: '전시 / 문화', Icon: Palette },
  { id: 'activity', label: '액티비티', Icon: Bike },
];

const AVOID_OPTIONS = [
  { id: 'far', label: '먼 이동', Icon: Car },
  { id: 'expensive', label: '큰 지출', Icon: Wallet },
  { id: 'crowded', label: '사람 많은 곳', Icon: Users },
  { id: 'long_walk', label: '오래 걷기', Icon: Footprints },
  { id: 'complex_reservation', label: '예약 복잡한 곳', Icon: CalendarClock },
  { id: 'late_night', label: '늦은 시간', Icon: MoonStar },
];

const MOOD_OPTIONS = [
  { id: 'rest', label: '편하게 쉬기', Icon: Smile },
  { id: 'laugh', label: '많이 웃기', Icon: Laugh },
  { id: 'quiet', label: '조용히 대화', Icon: Moon },
  { id: 'new', label: '새로운 경험', Icon: Sparkles },
  { id: 'photo', label: '사진 남기기', Icon: Camera },
  { id: 'special', label: '특별한 하루', Icon: Gift },
];

const LONG_DISTANCE_OPTIONS = [
  { id: 'yes', label: '네, 자주 떨어져 있어요' },
  { id: 'no', label: '아니요, 자주 만나요' },
  { id: 'sometimes', label: '상황에 따라 달라요' },
];

const STEP_TITLES: Record<Step, string> = {
  1: '데이트할 때 더 끌리는 건?',
  2: '요즘 데이트에서 원하는 건?',
  3: '이런 건 조금 부담스러워요',
  4: '장거리 커플인가요?',
};

export default function PreferencesScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [preferred, setPreferred] = useState<string[]>([]);
  const [mood, setMood] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [longDistance, setLongDistance] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  }

  async function handleSave(skip = false) {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          preferred_tags: skip ? [] : preferred,
          avoid_tags: skip ? [] : avoid,
          mood_tags: skip ? [] : mood,
          is_long_distance: skip ? false : longDistance === 'yes',
          onboarding_completed: true,
        }, { onConflict: 'user_id' });
      if (error) throw error;

      await logEvent('onboarding_completed', { skipped: skip });
    } catch {
      Alert.alert('오류', '저장 중 오류가 발생했어요.');
      setSaving(false);
      return;
    }
    setSaving(false);
    router.replace('/(tabs)' as any);
  }

  function handleNext() {
    if (step < 4) setStep((s) => (s + 1) as Step);
    else handleSave();
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.container}>
        {/* 헤더 */}
        <View style={s.headerRow}>
          <BackBar onPress={step > 1 ? () => setStep((st) => (st - 1) as Step) : undefined} />
          <ProgressDots current={step} total={4} />
          <Text style={s.stepCount}>{step}/4</Text>
        </View>

        <Text style={s.heading}>{STEP_TITLES[step]}</Text>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Step 1: 선호 활동 */}
          {step === 1 && (
            <>
              <OptionGrid
                options={PREFERRED_OPTIONS}
                selected={preferred}
                onToggle={(id) => toggle(preferred, setPreferred, id)}
              />
              <Text style={s.hint}>여러 개 골라도 괜찮아요</Text>
            </>
          )}

          {/* Step 2: 원하는 분위기 */}
          {step === 2 && (
            <OptionGrid
              options={MOOD_OPTIONS}
              selected={mood}
              onToggle={(id) => toggle(mood, setMood, id)}
            />
          )}

          {/* Step 3: 부담스러운 것 */}
          {step === 3 && (
            <>
              <OptionGrid
                options={AVOID_OPTIONS}
                selected={avoid}
                onToggle={(id) => toggle(avoid, setAvoid, id)}
              />
              <InfoNote>
                상대에게 바로 공유되는 정보가 아니에요. 추천을 더 편하게 만들기 위한 정보예요.
              </InfoNote>
            </>
          )}

          {/* Step 4: 장거리 여부 */}
          {step === 4 && (
            <View style={s.singleList}>
              {LONG_DISTANCE_OPTIONS.map((o) => {
                const sel = longDistance === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => setLongDistance(o.id)}
                    activeOpacity={0.7}
                    style={[s.singleBtn, sel && s.singleBtnOn]}
                  >
                    <View style={[s.radio, sel && s.radioOn]}>
                      {sel && <Check size={12} strokeWidth={3} color={C.white} />}
                    </View>
                    <Text style={[s.singleText, sel && s.singleTextOn]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* 하단 버튼 */}
        <View style={s.footer}>
          <BigButton onPress={handleNext} variant={saving ? 'disabled' : 'primary'}>
            {saving
              ? <ActivityIndicator color={C.white} size="small" />
              : step === 4 ? '첫 추천 받아보기' : '다음'}
          </BigButton>
          <TouchableOpacity onPress={() => handleSave(true)} style={s.skipBtn}>
            <Text style={s.skipText}>건너뛰기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function OptionGrid({ options, selected, onToggle }: {
  options: { id: string; label: string; Icon: any }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <View style={grid.wrap}>
      {options.map((o) => {
        const isSel = selected.includes(o.id);
        return (
          <TouchableOpacity
            key={o.id}
            onPress={() => onToggle(o.id)}
            activeOpacity={0.75}
            style={[grid.card, isSel && grid.cardOn]}
          >
            <View style={[grid.iconBox, { backgroundColor: isSel ? C.white : C.cream, }]}>
              <o.Icon size={20} strokeWidth={1.8} color={isSel ? C.pinkDeep : C.creamFg} />
            </View>
            <Text style={[grid.label, isSel && grid.labelOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const grid = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '47%',
    borderRadius: 20,
    padding: 16,
    gap: 12,
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  cardOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '500', color: C.inkSoft },
  labelOn: { color: C.pinkDeep, fontWeight: '600' },
});

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepCount: { fontSize: 12, color: C.textLight },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29, marginTop: 24 },
  scroll: { flex: 1, marginTop: 24 },
  scrollContent: { paddingBottom: 20 },
  hint: { fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 16 },
  singleList: { gap: 8 },
  singleBtn: {
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
  singleBtnOn: { backgroundColor: C.pinkLight, borderWidth: 1.5, borderColor: C.pinkBorder },
  singleText: { fontSize: 13, color: C.inkSoft, fontWeight: '500', flex: 1 },
  singleTextOn: { color: C.pinkDeep, fontWeight: '600' },
  radio: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#E0D5CB',
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  radioOn: { borderColor: C.pink, backgroundColor: C.pink },
  footer: { gap: 4 },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 12, color: C.textMuted },
});
