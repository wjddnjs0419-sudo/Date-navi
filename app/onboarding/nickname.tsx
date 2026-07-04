import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, ProgressDots } from '../../components/ui';

export default function NicknameScreen() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleNext() {
    const trimmed = nickname.trim();
    if (!trimmed) { Alert.alert('닉네임을 입력해주세요.'); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인 정보를 찾을 수 없어요.');

      const { error } = await supabase
        .from('date_planner_profiles')
        .upsert(
          { id: user.id, user_id: user.id, display_name: trimmed, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
      if (error) throw error;

      router.replace('/onboarding/photo' as any);
    } catch (e: any) {
      Alert.alert('오류', e.message || '저장 중 오류가 발생했어요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={G.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={s.safe}>
        <View style={s.container}>
          <BackBar />
          <View style={s.progressRow}>
            <ProgressDots current={1} total={4} />
            <Text style={s.stepCount}>1 / 4</Text>
          </View>

          <View style={s.headingBlock}>
            <Text style={s.heading}>어떻게 불러드릴까요?</Text>
            <Text style={s.subText}>닉네임은 언제든 바꿀 수 있어요.</Text>
          </View>

          <View style={s.fieldSection}>
            <View style={s.fieldBox}>
              <Text style={s.fieldLabel}>닉네임</Text>
              <View style={s.fieldRow}>
                <TextInput
                  style={s.fieldInput}
                  placeholder="닉네임을 입력해주세요"
                  placeholderTextColor={C.textFaint}
                  value={nickname}
                  onChangeText={setNickname}
                  maxLength={12}
                  returnKeyType="done"
                  onSubmitEditing={handleNext}
                  autoFocus
                />
                <Text style={s.charCount}>{nickname.length} / 12</Text>
              </View>
            </View>
            <Text style={s.hint}>한글·영문·숫자 12자 이내로 입력해주세요.</Text>
          </View>

          <View style={s.spacer} />

          <BigButton onPress={handleNext} variant={loading ? 'disabled' : 'primary'}>
            {loading ? '저장 중...' : '다음'}
          </BigButton>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  stepCount: { fontSize: 11, color: C.textMuted },
  headingBlock: { marginTop: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, marginTop: 8 },
  fieldSection: { marginTop: 24 },
  fieldBox: {
    backgroundColor: C.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  fieldLabel: { fontSize: 11, color: C.textLight, marginBottom: 4 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldInput: { fontSize: 16, color: C.text, fontWeight: '500', flex: 1 },
  charCount: { fontSize: 11, color: C.textFaint },
  hint: { fontSize: 11, color: C.textMuted, marginTop: 8, paddingHorizontal: 4 },
  spacer: { flex: 1 },
});
