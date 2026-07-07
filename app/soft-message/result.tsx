import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { generateSoftMessage, adjustSoftMessage } from '../../lib/ai';
import { Sparkles } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, SoftCard, InfoNote, GeneratingView, SuccessModal } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

export default function SoftMessageResultScreen() {
  const router = useRouter();
  const { t, language } = useI18n();
  const SOFT_MESSAGE_STEPS = t('softMessage.generatingSteps', { returnObjects: true }) as string[];
  const { tone, free } = useLocalSearchParams<{ tone: string; free: string }>();

  const [loading, setLoading] = useState(true);
  const [genStep, setGenStep] = useState(0);
  const [editedText, setEditedText] = useState('');
  const [saving, setSaving] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
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
          { freeText: free?.trim() ?? '', tone },
          language,
        );
        setEditedText(text);
      } catch {
        Alert.alert(t('common.error'), t('softMessage.genErrorAlert'));
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
        Alert.alert(t('softMessage.needCoupleAlert'));
        return;
      }

      // insert 시 notify_on_soft_message 트리거가 상대방에게 알림함 알림을 자동 생성한다.
      await supabase.from('soft_messages').insert({
        id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        couple_id: profile.couple_id,
        user_id: user.id,
        reason_tags: [],
        free_text: free?.trim() || null,
        generated_text: editedText,
        used: true,
      });

      setSuccessVisible(true);
    } catch {
      Alert.alert(t('common.error'), t('softMessage.sendErrorAlert'));
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
      const text = await adjustSoftMessage(editedText, instruction, language);
      setEditedText(text);
    } finally {
      setAdjusting(null);
    }
  }

  const ADJUST_ACTIONS: { key: string; label: string; onPress: () => void; loading?: boolean }[] = [
    { key: 'warmer', label: t('softMessage.adjustWarmer'), onPress: () => handleAdjust('warmer'), loading: adjusting === 'warmer' },
    { key: 'shorter', label: t('softMessage.adjustShorter'), onPress: () => handleAdjust('shorter'), loading: adjusting === 'shorter' },
    { key: 'edit', label: t('softMessage.adjustEdit'), onPress: () => textInputRef.current?.focus() },
  ];

  if (loading) {
    return <GeneratingView heading={t('softMessage.generatingHeading')} steps={SOFT_MESSAGE_STEPS} step={genStep} />;
  }

  return (
    <SafeAreaView style={G.screen}>
      <SuccessModal
        visible={successVisible}
        message={t('softMessage.sentSuccessMessage')}
        onHide={() => { setSuccessVisible(false); router.replace('/(tabs)/' as any); }}
      />
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar onPress={() => router.back()} />

        <Text style={[s.heading, s.headingTop]}>{t('softMessage.resultHeading2')}</Text>

        <SoftCard style={s.messageCard}>
          <View style={s.toneRow}>
            <Sparkles size={13} color={C.lavenderFg} />
            <Text style={s.toneText}>{tone}</Text>
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

        <View style={s.adjustList}>
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
                : <Text style={s.adjustArrow}>→</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <InfoNote>{t('softMessage.sendingNote')}</InfoNote>
        <View style={s.footerSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleCopy} variant={copied ? 'secondary' : 'primary'}>
          {copied ? t('softMessage.copiedCta') : t('softMessage.copyCta')}
        </BigButton>
        <TouchableOpacity
          style={[s.saveBtn, saving && s.saveBtnSaving]}
          onPress={handleSend}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={C.pinkDeep} size="small" />
            : <Text style={s.saveBtnText}>{t('softMessage.sendCta')}</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  headingTop: { marginTop: 16 },
  messageCard: { marginTop: 20, backgroundColor: C.lavender },
  toneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  toneText: { fontSize: 11, color: C.lavenderFg, fontWeight: '600' },
  messageInput: { fontSize: 15, color: C.text, lineHeight: 25, minHeight: 80 },
  adjustList: { gap: 8, marginTop: 16 },
  adjustArrow: { color: C.textLight },
  footerSpacer: { height: 140 },
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
  adjustBtnText: { fontSize: 13, color: C.inkSoft, fontWeight: '500' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.bg,
    gap: 4,
  },
  saveBtn: { alignItems: 'center', paddingVertical: 10 },
  saveBtnSaving: { opacity: 0.6 },
  saveBtnText: { fontSize: 13, color: C.pinkDeep, fontWeight: '600' },
});
