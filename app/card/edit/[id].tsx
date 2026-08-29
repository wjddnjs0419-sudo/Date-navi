import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { C, DS, SP, G } from '../../../constants/theme';
import { BigButton, CourseStepList, Header, InputField, ScreenHeading } from '../../../components/ui';
import { resolveDisplaySteps, type CourseStep } from '../../../lib/course';
import { useI18n } from '../../../lib/i18n';
import { localizeCardContent, overrideCardContent } from '../../../lib/card-i18n';

export default function EditCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, language } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [contentI18n, setContentI18n] = useState<unknown>(null);
  const [refMode, setRefMode] = useState('');
  const [refSteps, setRefSteps] = useState<CourseStep[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { data: raw } = await supabase
          .from('date_cards')
          .select('title, summary, content_i18n, mode, steps')
          .eq('id', id)
          .maybeSingle();
        if (!active) return;
        // 편집 기본값은 화면 어디서나 보이는(언어 오버레이 적용) 텍스트와 일치시킨다.
        const data = raw ? localizeCardContent(raw, language) : raw;
        if (data) {
          setContentI18n(data.content_i18n ?? null);
          setTitle(data.title ?? '');
          setSummary(data.summary ?? '');
          setRefMode(data.mode ?? '');
          setRefSteps(resolveDisplaySteps(data));
        }
        setLoading(false);
      })();
      return () => { active = false; };
    }, [id, language]),
  );

  const canSave = title.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('date_cards')
        .update({
          title: title.trim(),
          summary: summary.trim(),
          // 표시 경로가 content_i18n[언어] 텍스트를 우선하므로 제목·요약을 함께 덮어쓴다.
          content_i18n: overrideCardContent(contentI18n, { title: title.trim(), summary: summary.trim() }),
        })
        .eq('id', id);
      if (error) throw error;
      router.back();
    } catch {
      Alert.alert(t('common.error'), t('card.edit.saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[G.screen, G.center]}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  return (
    <SafeAreaView style={G.screen}>
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('card.edit.heading')} subtitle={t('card.edit.subtitle')} />
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <InputField
          label={t('card.edit.titleLabel')}
          value={title}
          onChangeText={setTitle}
          placeholder={t('card.edit.titlePlaceholder')}
          maxLength={60}
          style={s.field}
        />

        <InputField
          label={t('card.edit.descLabel')}
          value={summary}
          onChangeText={setSummary}
          placeholder={t('card.edit.descPlaceholder')}
          multiline
          maxLength={300}
          style={s.field}
        />

        {refMode === 'make_course' && refSteps.length > 0 && (
          <>
            <Text style={s.label}>{t('card.edit.stepsReferenceLabel')}</Text>
            <CourseStepList steps={refSteps} />
          </>
        )}

        <BigButton
          onPress={handleSave}
          variant={!canSave || saving ? 'disabled' : 'primary'}
          style={s.saveBtn}
        >
          {saving ? <ActivityIndicator color={C.white} size="small" /> : t('card.edit.saveCta')}
        </BigButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.xxl },
  label: { ...DS.typography.bodyCompact, color: C.text, fontWeight: '600', marginTop: SP.lg, marginBottom: SP.sm },
  field: { marginTop: SP.lg },
  saveBtn: { marginTop: SP.lg },
});
