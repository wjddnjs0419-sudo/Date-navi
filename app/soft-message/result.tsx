import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Clipboard, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { generateSoftMessage } from '../../lib/ai';
import { Sparkles } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, SoftCard, InfoNote } from '../../components/ui';

export default function SoftMessageResultScreen() {
  const router = useRouter();
  const { card, tone, free } = useLocalSearchParams<{ card: string; tone: string; free?: string }>();

  const [loading, setLoading] = useState(true);
  const [editedText, setEditedText] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const text = await generateSoftMessage(
          { reasons: [card ?? ''], freeText: free?.trim() || undefined },
          'ko',
        );
        setEditedText(text);
      } catch {
        Alert.alert('오류', 'AI 문장 생성에 실패했어요. 다시 시도해주세요.');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.couple_id) {
        Alert.alert('연인과 연결 후 사용해주세요.');
        return;
      }

      await supabase.from('soft_messages').insert({
        id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        couple_id: profile.couple_id,
        user_id: user.id,
        reason_tags: card ? [card] : [],
        free_text: free?.trim() || null,
        generated_text: editedText,
        used: false,
      });

      Alert.alert('저장 완료', '문장이 저장됐어요! 원할 때 복사해서 보내보세요.');
    } catch {
      Alert.alert('오류', '저장 중 오류가 발생했어요.');
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    Clipboard.setString(editedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.pinkDeep} size="large" />
        <Text style={{ marginTop: 16, fontSize: 14, color: C.textSub }}>문장을 만들고 있어요...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar onPress={() => router.back()} />

        <Text style={[s.heading, { marginTop: 16 }]}>이렇게 말해볼까요?</Text>

        <SoftCard style={{ marginTop: 20, backgroundColor: C.lavender }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Sparkles size={13} color={C.lavenderFg} />
            <Text style={{ fontSize: 11, color: C.lavenderFg, fontWeight: '600' }}>{tone}</Text>
          </View>
          <TextInput
            style={s.messageInput}
            value={editedText}
            onChangeText={setEditedText}
            multiline
            textAlignVertical="top"
          />
        </SoftCard>

        <View style={{ gap: 8, marginTop: 16 }}>
          {['조금 더 다정하게', '짧게 줄이기', '직접 수정하기'].map((t) => (
            <TouchableOpacity key={t} style={s.adjustBtn} activeOpacity={0.7}>
              <Text style={s.adjustBtnText}>{t}</Text>
              <Text style={{ color: '#B8AEA6' }}>→</Text>
            </TouchableOpacity>
          ))}
        </View>

        <InfoNote>문장은 바로 전송되지 않아요. 확인하고 보낼 수 있어요.</InfoNote>
        <View style={{ height: 140 }} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleCopy} variant={copied ? 'secondary' : 'primary'}>
          {copied ? '복사됨 ✓' : '문장 복사하기'}
        </BigButton>
        <TouchableOpacity
          style={[s.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={C.pinkDeep} size="small" />
            : <Text style={s.saveBtnText}>저장하기</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  messageInput: { fontSize: 15, color: C.text, lineHeight: 25, minHeight: 80 },
  adjustBtn: {
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
  adjustBtnText: { fontSize: 13, color: '#4A4A55', fontWeight: '500' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: '#FFF8F3',
    gap: 4,
  },
  saveBtn: { alignItems: 'center', paddingVertical: 10 },
  saveBtnText: { fontSize: 13, color: C.pinkDeep, fontWeight: '600' },
});
