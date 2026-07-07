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
import { useI18n } from '../../lib/i18n';

export default function NicknameScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleNext() {
    const trimmed = nickname.trim();
    if (!trimmed) { Alert.alert(t('onboarding.nickname.empty')); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('onboarding.nickname.noUser'));

      const { error } = await supabase
        .from('date_planner_profiles')
        .upsert(
          { id: user.id, user_id: user.id, display_name: trimmed, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
      if (error) throw error;

      router.push('/onboarding/photo' as any);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('onboarding.nickname.saveError'));
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
          <BackBar onPress={() => router.replace('/(auth)' as any)} />
          <View style={s.progressRow}>
            <ProgressDots current={1} total={4} />
            <Text style={s.stepCount}>1 / 4</Text>
          </View>

          <View style={s.headingBlock}>
            <Text style={s.heading}>{t('onboarding.nickname.title')}</Text>
            <Text style={s.subText}>{t('onboarding.nickname.sub')}</Text>
          </View>

          <View style={s.fieldSection}>
            <View style={s.fieldBox}>
              <Text style={s.fieldLabel}>{t('onboarding.nickname.label')}</Text>
              <View style={s.fieldRow}>
                <TextInput
                  style={s.fieldInput}
                  placeholder={t('onboarding.nickname.placeholder')}
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
            <Text style={s.hint}>{t('onboarding.nickname.hint')}</Text>
          </View>

          <View style={s.spacer} />

          <BigButton onPress={handleNext} variant={loading ? 'disabled' : 'primary'}>
            {loading ? t('onboarding.nickname.saving') : t('onboarding.nickname.next')}
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
