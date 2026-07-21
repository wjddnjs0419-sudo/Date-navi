import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { C, SP, R, G } from '../../../constants/theme';
import { BackBar, BigButton, OptionCardPicker, CourseStepList } from '../../../components/ui';
import { resolveDisplaySteps, type CourseStep } from '../../../lib/course';
import { useI18n } from '../../../lib/i18n';

export default function EditCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const TIME_OPTIONS = [
    t('card.new.timeOptions.oneToTwo'), t('card.new.timeOptions.twoToThree'),
    t('card.new.timeOptions.halfDay'), t('card.new.timeOptions.fullDay'),
  ];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [time, setTime] = useState('');
  const [budget, setBudget] = useState('');
  const [refMode, setRefMode] = useState('');
  const [refSteps, setRefSteps] = useState<CourseStep[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { data } = await supabase
          .from('date_cards')
          .select('title, summary, estimated_time, estimated_budget, mode, steps')
          .eq('id', id)
          .maybeSingle();
        if (!active) return;
        if (data) {
          setTitle(data.title ?? '');
          setSummary(data.summary ?? '');
          setTime(data.estimated_time ?? '');
          setBudget(data.estimated_budget ?? '');
          setRefMode(data.mode ?? '');
          setRefSteps(resolveDisplaySteps(data));
        }
        setLoading(false);
      })();
      return () => { active = false; };
    }, [id]),
  );

  const canSave = title.trim().length > 0;
  const timeOptions = [
    { value: '', label: t('card.new.noneOption') },
    ...(time && !TIME_OPTIONS.includes(time) ? [{ value: time, label: t('card.edit.existingValueOption', { time }) }] : []),
    ...TIME_OPTIONS.map((opt) => ({ value: opt, label: opt })),
  ];

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('date_cards')
        .update({
          title: title.trim(),
          summary: summary.trim(),
          estimated_time: time.trim(),
          estimated_budget: budget.trim(),
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
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar onPress={() => router.back()} />

        <Text style={[s.heading, s.headingTop]}>{t('card.edit.heading')}</Text>
        <Text style={s.subText}>{t('card.edit.subtitle')}</Text>

        <Text style={s.label}>{t('card.edit.titleLabel')}</Text>
        <View style={[s.inputWrap, title.length > 0 && s.inputWrapActive]}>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('card.edit.titlePlaceholder')}
            placeholderTextColor={C.textFaint}
            maxLength={60}
          />
        </View>

        <Text style={s.label}>{t('card.edit.descLabel')}</Text>
        <View style={s.inputWrap}>
          <TextInput
            style={[s.input, s.inputMultiline]}
            value={summary}
            onChangeText={setSummary}
            placeholder={t('card.edit.descPlaceholder')}
            placeholderTextColor={C.textFaint}
            multiline
            maxLength={300}
          />
        </View>

        <Text style={s.label}>{t('card.edit.timeLabel')}</Text>
        <OptionCardPicker
          options={timeOptions}
          value={time}
          onChange={setTime}
        />

        <Text style={s.label}>{t('card.edit.budgetLabel')}</Text>
        <View style={s.inputWrap}>
          <TextInput
            style={s.input}
            value={budget}
            onChangeText={setBudget}
            placeholder={t('card.edit.budgetPlaceholder')}
            placeholderTextColor={C.textFaint}
            maxLength={30}
          />
        </View>

        {refMode === 'make_course' && refSteps.length > 0 && (
          <>
            <Text style={s.label}>{t('card.edit.stepsReferenceLabel')}</Text>
            <CourseStepList steps={refSteps} />
          </>
        )}

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton
          onPress={handleSave}
          variant={!canSave || saving ? 'disabled' : 'primary'}
        >
          {saving ? <ActivityIndicator color={C.white} size="small" /> : t('card.edit.saveCta')}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: SP.xl, paddingTop: SP.xl, paddingBottom: SP.xxxl + SP.sm },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  headingTop: { marginTop: SP.lg },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: SP.sm },
  label: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: SP.xl, marginBottom: SP.sm },
  inputWrap: {
    backgroundColor: C.white,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
  },
  inputWrapActive: { borderColor: C.pinkBorder, borderWidth: 1.5 },
  // 단일행 입력에 lineHeight를 주면 iOS에서 세로 중앙이 어긋난다. paddingVertical: 0으로 기본 패딩도 제거.
  input: { fontSize: 14, color: C.text, paddingVertical: 0 },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top', lineHeight: 22 },
  bottomSpacer: { height: 120 },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: SP.xl,
    paddingBottom: SP.xxxl,
    paddingTop: SP.md,
    backgroundColor: C.bg,
  },
});
