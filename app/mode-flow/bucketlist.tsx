import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import { Plane } from 'lucide-react-native';

export default function BucketlistScreen() {
  const router = useRouter();
  const [item, setItem] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!item.trim()) {
      Alert.alert('아이디어를 입력해주세요');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('로그인이 필요해요'); return; }

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.couple_id) {
        Alert.alert('커플 연결 후 사용할 수 있어요');
        return;
      }

      const { error } = await supabase.from('bucket_list').insert({
        user_id: user.id,
        couple_id: profile.couple_id,
        item: item.trim(),
        status: 'pending',
      });

      if (error) throw error;

      setItem('');
      Alert.alert(
        '저장했어요!',
        '우리 후보 탭의 "다음에 만나면" 에서 확인할 수 있어요.',
        [{ text: '확인', onPress: () => router.push('/(tabs)/candidates' as any) }],
      );
    } catch {
      Alert.alert('저장 중 오류가 발생했어요. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <View style={s.modeBadge}>
          <Plane size={13} color={C.lavenderFg} strokeWidth={2} />
          <Text style={s.modeLabel}>다음에 만나면</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>{'다음에 만나면\n뭐 하고 싶어요?'}</Text>
        <Text style={s.subtitle}>장소, 활동, 느낌 모두 괜찮아요.{'\n'}떠오르는 아이디어를 자유롭게 써주세요.</Text>

        <Text style={s.inputLabel}>아이디어</Text>
        <TextInput
          style={s.textInput}
          placeholder="예) 드라이브하면서 야경 보고 싶어, 오션뷰 카페 가보고 싶어..."
          placeholderTextColor="#C0C0C0"
          value={item}
          onChangeText={setItem}
          multiline
          maxLength={200}
          textAlignVertical="top"
        />
        <Text style={s.charCount}>{item.length} / 200</Text>

        <View style={s.tipBox}>
          <Text style={s.tipTitle}>💡 이렇게 써봐요</Text>
          <Text style={s.tipText}>· 오션뷰 카페에서 브런치 먹기{'\n'}· 드라이브하면서 야경 보기{'\n'}· 테마파크 하루 종일 놀기{'\n'}· 두 사람만의 캠핑</Text>
        </View>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.saveBtn, (!item.trim() || saving) && s.saveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={!item.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator color={C.white} />
          ) : (
            <Text style={s.saveBtnText}>버킷리스트에 저장하기</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backText: { fontSize: 24, color: C.text },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.lavender,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  modeLabel: { fontSize: 12, fontWeight: '600', color: C.lavenderFg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: C.text, lineHeight: 34, marginBottom: 10 },
  subtitle: { fontSize: 14, color: C.textSub, lineHeight: 21, marginBottom: 28 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 10 },
  textInput: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: C.text,
    minHeight: 120,
    lineHeight: 22,
  },
  charCount: { fontSize: 12, color: C.textMuted, textAlign: 'right', marginTop: 6, marginBottom: 24 },
  tipBox: {
    backgroundColor: C.lavender,
    borderRadius: 16,
    padding: 16,
  },
  tipTitle: { fontSize: 13, fontWeight: '700', color: C.lavenderFg, marginBottom: 8 },
  tipText: { fontSize: 13, color: C.lavenderFg, lineHeight: 22 },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.white,
  },
  saveBtn: {
    backgroundColor: C.lavenderFg,
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: C.white, fontSize: 16, fontWeight: '700' },
});
