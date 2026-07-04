import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Check } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, ListGroup, ListRow, SectionLabel } from '../../components/ui';

const REASONS = [
  '잘 사용하지 않아요',
  '기능이 부족해요',
  '다른 앱을 사용하고 있어요',
  '개인정보가 걱정돼요',
  '기타',
];

export default function DeleteAccountScreen() {
  const router = useRouter();

  const [reasonIdx, setReasonIdx] = useState<number | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!agreed) return;
    setDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile?.couple_id) {
        await supabase
          .from('date_planner_profiles')
          .update({ couple_id: null })
          .eq('couple_id', profile.couple_id)
          .neq('user_id', user.id);
        await supabase
          .from('date_planner_couples')
          .delete()
          .eq('id', profile.couple_id);
      }

      await supabase.from('user_preferences').delete().eq('user_id', user.id);
      await supabase.from('soft_messages').delete().eq('user_id', user.id);
      await supabase.from('date_memories').delete().eq('user_id', user.id);
      await supabase.from('date_planner_profiles').delete().eq('user_id', user.id);

      const { error: fnError } = await supabase.functions.invoke('delete-account', {
        body: { user_id: user.id },
      });
      if (fnError) throw fnError;

      await supabase.auth.signOut();
    } catch {
      setDeleting(false);
      Alert.alert('오류', '탈퇴 처리 중 문제가 생겼어요. 다시 시도해주세요.');
    }
  }

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <BackBar />
        <View style={s.headingWrap}>
          <Text style={s.heading}>정말 떠나시는 건가요?</Text>
          <Text style={s.subText}>탈퇴하면 둘이 함께 만든 추억과 후보가 모두 사라져요.</Text>
        </View>

        <View style={s.warningBox}>
          <Text style={s.warningTitle}>탈퇴하면 이런 정보가 사라져요</Text>
          {[
            '함께한 데이트 기록과 사진',
            '둘 다 끌린 후보 목록',
            '상대방과의 커플 연결',
            '닉네임과 계정 정보',
          ].map(item => (
            <Text key={item} style={s.warningItem}>· {item}</Text>
          ))}
        </View>

        <View style={s.reasonSection}>
          <SectionLabel>떠나는 이유 (선택)</SectionLabel>
          <ListGroup>
            {REASONS.map((reason, i, arr) => (
              <ListRow
                key={reason}
                onPress={() => setReasonIdx(i)}
                label={
                  <Text style={[s.reasonText, {
                    color: reasonIdx === i ? C.pinkDeep : C.text,
                    fontWeight: reasonIdx === i ? '600' : '500',
                  }]}>
                    {reason}
                  </Text>
                }
                trailing={
                  reasonIdx === i ? (
                    <View style={s.checkCircle}>
                      <Check size={11} color={C.white} strokeWidth={3} />
                    </View>
                  ) : (
                    <View style={s.emptyCircle} />
                  )
                }
                divider={i < arr.length - 1}
              />
            ))}
          </ListGroup>
        </View>

        <TouchableOpacity
          style={s.agreeRow}
          onPress={() => setAgreed(v => !v)}
          activeOpacity={0.7}
        >
          <View style={[s.checkbox, agreed && s.checkboxOn]}>
            {agreed && <Check size={11} color={C.white} strokeWidth={3} />}
          </View>
          <Text style={s.agreeText}>
            위 내용을 모두 확인했고, 탈퇴 후에는 데이터를 복구할 수 없다는 것에 동의합니다.
          </Text>
        </TouchableOpacity>

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton
          onPress={handleDelete}
          variant={deleting ? 'disabled' : agreed ? 'primary' : 'disabled'}
        >
          {deleting ? <ActivityIndicator color={C.white} size="small" /> : agreed ? '탈퇴하기' : '동의가 필요해요'}
        </BigButton>
        <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()}>
          <Text style={s.cancelBtnText}>조금 더 둘러볼게요</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  headingWrap: { marginTop: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  reasonSection: { marginTop: 24 },
  reasonText: { fontSize: 14 },
  bottomSpacer: { height: 120 },
  warningBox: {
    marginTop: 20,
    borderRadius: 18,
    padding: 16,
    backgroundColor: C.pinkLight,
    borderWidth: 1,
    borderColor: C.pinkBorder,
  },
  warningTitle: { fontSize: 13, fontWeight: '700', color: C.pinkDeep, marginBottom: 8 },
  warningItem: { fontSize: 12, color: C.grayFg, lineHeight: 22 },
  checkCircle: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: C.pink,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.border,
  },
  agreeRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: C.pink, borderColor: C.pink },
  agreeText: { flex: 1, fontSize: 12, color: C.grayFg, lineHeight: 19 },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.bg,
    gap: 4,
  },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { fontSize: 13, color: C.textSub, fontWeight: '500' },
});
