import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Eye, EyeOff } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, InfoNote } from '../../components/ui';

export default function ChangePasswordScreen() {
  const router = useRouter();

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (newPw.length < 8) {
      Alert.alert('비밀번호 오류', '새 비밀번호는 8자 이상이어야 해요.');
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('비밀번호 오류', '새 비밀번호가 일치하지 않아요.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      Alert.alert('변경 완료', '비밀번호가 변경됐어요.', [
        { text: '확인', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('오류', '비밀번호 변경 중 문제가 생겼어요.');
    } finally {
      setSaving(false);
    }
  }

  const fields = [
    { label: '현재 비밀번호', placeholder: '현재 비밀번호 입력', value: currentPw, onChange: setCurrentPw, show: showCurrent, toggleShow: () => setShowCurrent(v => !v) },
    { label: '새 비밀번호', placeholder: '새 비밀번호 입력', value: newPw, onChange: setNewPw, show: showNew, toggleShow: () => setShowNew(v => !v) },
    { label: '새 비밀번호 확인', placeholder: '다시 한 번 입력', value: confirmPw, onChange: setConfirmPw, show: showConfirm, toggleShow: () => setShowConfirm(v => !v) },
  ];

  const isReady = currentPw.length > 0 && newPw.length >= 8 && newPw === confirmPw;

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <BackBar />
        <View style={s.headingWrap}>
          <Text style={s.heading}>비밀번호 변경</Text>
          <Text style={s.subText}>안전한 비밀번호로 계정을 지켜주세요.</Text>
        </View>

        <View style={s.fieldList}>
          {fields.map(f => (
            <View key={f.label}>
              <Text style={s.fieldLabel}>{f.label}</Text>
              <View style={s.fieldBox}>
                <TextInput
                  style={s.fieldInput}
                  value={f.value}
                  onChangeText={f.onChange}
                  placeholder={f.placeholder}
                  placeholderTextColor={C.textFaint}
                  secureTextEntry={!f.show}
                  returnKeyType="done"
                />
                <TouchableOpacity onPress={f.toggleShow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  {f.show
                    ? <EyeOff size={16} color={C.textMuted} />
                    : <Eye size={16} color={C.textMuted} />}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <InfoNote style={s.infoNote}>
          8자 이상, 영문·숫자·특수문자 중 2가지 이상 조합을 추천해요.
        </InfoNote>

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleSave} variant={saving ? 'disabled' : isReady ? 'primary' : 'disabled'}>
          {saving ? <ActivityIndicator color={C.white} size="small" /> : '비밀번호 변경'}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  headingWrap: { marginTop: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  fieldList: { marginTop: 24, gap: 16 },
  infoNote: { marginTop: 20 },
  bottomSpacer: { height: 120 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: C.text, marginBottom: 6, paddingHorizontal: 4 },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 8,
  },
  fieldInput: { flex: 1, fontSize: 14, color: C.text },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.bg,
  },
});
