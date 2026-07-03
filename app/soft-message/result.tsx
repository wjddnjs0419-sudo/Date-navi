import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Clipboard, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { generateSoftMessage, adjustSoftMessage } from '../../lib/ai';
import { Sparkles } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, SoftCard, InfoNote, GeneratingView } from '../../components/ui';

const SOFT_MESSAGE_STEPS = ['마음 확인하는 중', '다정한 표현 고르는 중', '문장 다듬는 중'];

export default function SoftMessageResultScreen() {
  const router = useRouter();
  const { card, tone, free } = useLocalSearchParams<{ card: string; tone: string; free?: string }>();

  const [loading, setLoading] = useState(true);
  const [genStep, setGenStep] = useState(0);
  const [editedText, setEditedText] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [adjusting, setAdjusting] = useState<'warmer' | 'shorter' | null>(null);
  const textInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setGenStep(s => Math.min(s + 1, SOFT_MESSAGE_STEPS.length - 1));
    }, 1200);

    (async () => {
      try {
        const text = await generateSoftMessage(
          { reasons: [card ?? ''], freeText: free?.trim() || undefined, tone },
          'ko',
        );
        setEditedText(text);
      } catch {
        Alert.alert('오류', 'AI 문장 생성에 실패했어요. 다시 시도해주세요.');
        router.back();
      } finally {
        clearInterval(interval);
        setLoading(false);
      }
    })();

    return () => clearInterval(interval);
  }, []);

  async function handleSend() {
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

      // insert 시 notify_on_soft_message 트리거가 상대방에게 알림함 알림을 자동 생성한다.
      await supabase.from('soft_messages').insert({
        id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        couple_id: profile.couple_id,
        user_id: user.id,
        reason_tags: card ? [card] : [],
        free_text: free?.trim() || null,
        generated_text: editedText,
        used: true,
      });

      Alert.alert('보냈어요', '상대방 알림함에서 확인할 수 있어요.');
    } catch {
      Alert.alert('오류', '보내는 중 오류가 발생했어요.');
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    Clipboard.setString(editedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleAdjust(instruction: 'warmer' | 'shorter') {
    setAdjusting(instruction);
    try {
      const text = await adjustSoftMessage(editedText, instruction, 'ko');
      setEditedText(text);
    } finally {
      setAdjusting(null);
    }
  }

  const ADJUST_ACTIONS: { key: string; label: string; onPress: () => void; loading?: boolean }[] = [
    { key: 'warmer', label: '조금 더 다정하게', onPress: () => handleAdjust('warmer'), loading: adjusting === 'warmer' },
    { key: 'shorter', label: '짧게 줄이기', onPress: () => handleAdjust('shorter'), loading: adjusting === 'shorter' },
    { key: 'edit', label: '직접 수정하기', onPress: () => textInputRef.current?.focus() },
  ];

  if (loading) {
    return <GeneratingView heading={'다정한 문장을\n만드는 중이에요'} steps={SOFT_MESSAGE_STEPS} step={genStep} />;
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
            ref={textInputRef}
            style={s.messageInput}
            value={editedText}
            onChangeText={setEditedText}
            multiline
            textAlignVertical="top"
          />
        </SoftCard>

        <View style={{ gap: 8, marginTop: 16 }}>
          {ADJUST_ACTIONS.map((a) => (
            <TouchableOpacity
              key={a.key}
              style={s.adjustBtn}
              activeOpacity={0.7}
              onPress={a.onPress}
              disabled={!!adjusting}
            >
              <Text style={s.adjustBtnText}>{a.label}</Text>
              {a.loading
                ? <ActivityIndicator size="small" color={C.pinkDeep} />
                : <Text style={{ color: '#B8AEA6' }}>→</Text>}
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
          onPress={handleSend}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={C.pinkDeep} size="small" />
            : <Text style={s.saveBtnText}>보내기</Text>}
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
