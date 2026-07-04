import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, ProgressDots, SoftCard } from '../../components/ui';

const YEARS = Array.from({ length: 30 }, (_, i) => String(new Date().getFullYear() - i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

function daysBetween(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function AnniversaryScreen() {
  const router = useRouter();
  const [year, setYear] = useState('2024');
  const [month, setMonth] = useState('03');
  const [day, setDay] = useState('14');
  const [loading, setLoading] = useState(false);

  const dateStr = `${year}-${month}-${day}`;
  const days = daysBetween(dateStr);

  async function handleNext() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      await supabase
        .from('date_planner_profiles')
        .update({ anniversary_date: dateStr, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    } catch {
      // 에러 무시하고 다음 단계 진행
    } finally {
      setLoading(false);
    }
    router.replace('/onboarding/type' as any);
  }

  function handleSkip() {
    router.replace('/onboarding/type' as any);
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.container}>
        <BackBar />
        <View style={s.progressRow}>
          <ProgressDots current={3} total={4} />
          <Text style={s.stepCount}>3 / 4</Text>
        </View>

        <View style={s.headingBlock}>
          <Text style={s.heading}>{'사귀기 시작한 날을\n알려주세요'}</Text>
          <Text style={s.subText}>기념일 알림과 추억 정리에 사용돼요.</Text>
        </View>

        <View style={s.dateRow}>
          <DatePicker label="년" value={year} items={YEARS} onSelect={setYear} />
          <DatePicker label="월" value={month} items={MONTHS} onSelect={setMonth} />
          <DatePicker label="일" value={day} items={DAYS} onSelect={setDay} />
        </View>

        {days >= 0 && (
          <SoftCard style={s.daysCard}>
            <View style={s.daysRow}>
              <Heart size={14} color={C.pinkDeep} fill={C.pinkDeep} strokeWidth={0} />
              <Text style={s.daysText}>오늘로 {days}일째</Text>
            </View>
            <Text style={s.daysHint}>100일·200일·1주년 같은 날에 살짝 알려드릴게요.</Text>
          </SoftCard>
        )}

        <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
          <Text style={s.skipText}>나중에 입력할게요</Text>
        </TouchableOpacity>

        <View style={s.spacer} />

        <BigButton onPress={handleNext} variant={loading ? 'disabled' : 'primary'}>
          {loading ? '저장 중...' : '다음'}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

function DatePicker({ label, value, items, onSelect }: {
  label: string;
  value: string;
  items: string[];
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={dp.wrap}>
      <TouchableOpacity style={dp.cell} onPress={() => setOpen(!open)} activeOpacity={0.75}>
        <Text style={dp.label}>{label}</Text>
        <Text style={dp.value}>{value}</Text>
      </TouchableOpacity>
      {open && (
        <View style={dp.dropdown}>
          <ScrollView style={dp.scroll} showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <TouchableOpacity
                key={item}
                style={[dp.option, item === value && dp.optionSel]}
                onPress={() => { onSelect(item); setOpen(false); }}
              >
                <Text style={[dp.optionText, item === value && dp.optionTextSel]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const dp = StyleSheet.create({
  wrap: { flex: 1 },
  cell: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  label: { fontSize: 11, color: C.textLight },
  value: { fontSize: 18, fontWeight: '600', color: C.text, marginTop: 4 },
  scroll: { maxHeight: 180 },
  dropdown: {
    position: 'absolute',
    top: 68,
    left: 0,
    right: 0,
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    zIndex: 100,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  option: { paddingHorizontal: 16, paddingVertical: 10 },
  optionSel: { backgroundColor: C.pinkLight },
  optionText: { fontSize: 14, color: C.text },
  optionTextSel: { color: C.pinkDeep, fontWeight: '600' },
});

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  stepCount: { fontSize: 11, color: C.textMuted },
  headingBlock: { marginTop: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, marginTop: 8 },
  dateRow: { flexDirection: 'row', gap: 8, marginTop: 24 },
  daysCard: {
    marginTop: 20,
    backgroundColor: C.cream,
    borderColor: '#F2DDB0',
  },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  daysText: { fontSize: 12, color: C.creamFg, fontWeight: '600' },
  daysHint: { fontSize: 12, color: C.grayFg, lineHeight: 18, marginTop: 8 },
  skipBtn: { alignItems: 'center', marginTop: 16 },
  skipText: { fontSize: 12, color: C.textMuted },
  spacer: { flex: 1 },
});
