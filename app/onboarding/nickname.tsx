import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { C, DS, G } from '../../constants/theme';
import { BigButton, Header, ProgressDots, ScreenHeading } from '../../components/ui';
import { Illustration } from '../../components/illustration';
import { useI18n } from '../../lib/i18n';

export default function NicknameScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

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
        <Header
          onBack={() => router.replace('/(auth)' as any)}
          center={<ProgressDots current={1} total={4} />}
          right={<Text style={s.stepCount}>1 / 4</Text>}
        />
        <ScreenHeading title={t('onboarding.nickname.title')} subtitle={t('onboarding.nickname.sub')} variant="input" />
        <View style={s.container}>
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

          <View style={s.spacer}>
            {!keyboardOpen && <Illustration name="mascot-heart-single" width={140} />}
          </View>

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
  container: { flex: 1, paddingHorizontal: DS.spacing.screen, paddingTop: DS.spacing.xxl, paddingBottom: DS.spacing.section },
  stepCount: { ...DS.typography.caption, color: C.textMuted },
  fieldSection: {},
  fieldBox: {
    backgroundColor: C.white,
    borderRadius: DS.radius.input,
    paddingHorizontal: DS.spacing.lg,
    paddingVertical: DS.spacing.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  fieldLabel: { ...DS.typography.caption, color: C.textLight, marginBottom: DS.spacing.xs },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldInput: { ...DS.typography.bodyLarge, color: C.text, fontWeight: '500', flex: 1 },
  charCount: { ...DS.typography.caption, color: C.textFaint },
  hint: { ...DS.typography.caption, color: C.textMuted, marginTop: DS.spacing.sm, paddingHorizontal: DS.spacing.xs },
  spacer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
