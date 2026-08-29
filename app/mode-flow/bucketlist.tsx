import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import { DS, SP } from '../../constants/theme';
import { Plane } from '../../components/iconography';
import { BigButton, Header, InputField, ScreenHeading } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { useOptionalSafeAreaInsets } from '../../lib/use-optional-safe-area-insets';

export default function BucketlistScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useOptionalSafeAreaInsets();
  const [item, setItem] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!item.trim()) {
      Alert.alert(t('modeFlow.bucketlist.empty'));
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert(t('modeFlow.bucketlist.loginRequired')); return; }

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.couple_id) {
        Alert.alert(t('common.coupleRequired'));
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
        t('modeFlow.bucketlist.savedTitle'),
        t('modeFlow.bucketlist.savedBody'),
        [{ text: t('common.ok'), onPress: () => router.push('/(tabs)/candidates' as any) }],
      );
    } catch {
      Alert.alert(t('modeFlow.bucketlist.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('modeFlow.bucketlist.title')} subtitle={t('modeFlow.bucketlist.sub')} variant="input" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.modeBadge}>
          <Plane size={13} color={C.lavenderFg} strokeWidth={2} />
          <Text style={s.modeLabel}>{t('modeFlow.bucketlist.modeLabel')}</Text>
        </View>

        <InputField
          label={t('modeFlow.bucketlist.label')}
          value={item}
          onChangeText={setItem}
          placeholder={t('modeFlow.bucketlist.placeholder')}
          multiline
          maxLength={200}
          inputStyle={s.textInput}
        />
        <Text style={s.charCount}>{item.length} / 200</Text>

        <View style={s.tipBox}>
          <Text style={s.tipTitle}>{t('modeFlow.bucketlist.tipTitle')}</Text>
          <Text style={s.tipText}>{t('modeFlow.bucketlist.tipText')}</Text>
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: SP.screen + insets.bottom }]}>
        <BigButton
          onPress={handleSave}
          variant={saving || !item.trim() ? 'disabled' : 'primary'}
          disabled={!item.trim() || saving}
        >
          {saving ? t('common.saving') : t('modeFlow.bucketlist.save')}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.canvasWhiteException },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.xs,
    backgroundColor: C.lavender,
    paddingHorizontal: SP.sm,
    paddingVertical: SP.xs,
    borderRadius: DS.radius.chip,
  },
  modeLabel: { ...DS.typography.bodySmall, fontWeight: '600', color: C.lavenderFg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.hero },
  subtitle: { ...DS.typography.body, color: C.textSub, marginTop: SP.lg, marginBottom: SP.xxl },
  textInput: { ...DS.typography.body, color: C.text, textAlignVertical: 'top' },
  charCount: { ...DS.typography.bodySmall, color: C.textMuted, textAlign: 'right', marginTop: SP.sm, marginBottom: SP.xxl },
  tipBox: {
    backgroundColor: C.lavender,
    borderRadius: DS.radius.input,
    padding: SP.lg,
  },
  tipTitle: { ...DS.typography.bodyCompact, fontWeight: '700', color: C.lavenderFg, marginBottom: SP.sm },
  tipText: { ...DS.typography.bodyCompact, color: C.lavenderFg },
  footer: {
    paddingHorizontal: SP.screen,
    paddingBottom: SP.screen,
    paddingTop: SP.lg,
    backgroundColor: C.white,
  },
});
