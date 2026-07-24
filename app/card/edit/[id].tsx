import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { C, SP, R, G } from '../../../constants/theme';
import { BackBar, BigButton, CourseStepList } from '../../../components/ui';
import { StepSlider } from '../../../components/recommendation/step-slider';
import { resolveDisplaySteps, type CourseStep } from '../../../lib/course';
import {
  DURATION_MAX_HOURS,
  PER_PERSON_BUDGET_MAX_KRW,
  PER_PERSON_BUDGET_STEP_KRW,
  parseDurationHours,
} from '../../../lib/course-draft';
import { useI18n } from '../../../lib/i18n';
import { localizeCardContent, overrideCardContent } from '../../../lib/card-i18n';

// 표시용 텍스트(우리가 저장하는 "30,000원"/"KRW 30,000" 포함)에서 숫자만 뽑아 슬라이더 값으로 되돌린다.
// 범위·단위가 섞인 레거시 AI 값은 파싱이 부정확할 수 있어 슬라이더 상한으로 클램프한다.
function parseBudgetKRW(text?: string): number {
  const digits = (text ?? '').replace(/[^0-9]/g, '');
  if (!digits) return 0;
  return Math.min(Number(digits), PER_PERSON_BUDGET_MAX_KRW);
}

export default function EditCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, language } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [contentI18n, setContentI18n] = useState<unknown>(null);
  const [timeHours, setTimeHours] = useState(0);
  const [budgetKRW, setBudgetKRW] = useState(0);
  const [refMode, setRefMode] = useState('');
  const [refSteps, setRefSteps] = useState<CourseStep[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { data: raw } = await supabase
          .from('date_cards')
          .select('title, summary, content_i18n, estimated_time, estimated_budget, mode, steps')
          .eq('id', id)
          .maybeSingle();
        if (!active) return;
        // 편집 기본값은 화면 어디서나 보이는(언어 오버레이 적용) 텍스트와 일치시킨다.
        const data = raw ? localizeCardContent(raw, language) : raw;
        if (data) {
          setContentI18n(data.content_i18n ?? null);
          setTitle(data.title ?? '');
          setSummary(data.summary ?? '');
          setTimeHours(Math.min(parseDurationHours(data.estimated_time ?? '') ?? 0, DURATION_MAX_HOURS));
          setBudgetKRW(parseBudgetKRW(data.estimated_budget ?? ''));
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
          estimated_time: timeHours === 0 ? '' : t('course.duration.hoursLabel', { count: timeHours }),
          estimated_budget: budgetKRW === 0 ? '' : t('course.budget.amount', { amount: budgetKRW.toLocaleString() }),
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
        <StepSlider
          min={0}
          max={DURATION_MAX_HOURS}
          step={1}
          value={timeHours}
          onChange={setTimeHours}
          formatValue={(hours) => (hours === 0 ? t('course.unselected') : t('course.duration.hoursLabel', { count: hours }))}
          accessibilityLabel={t('card.edit.timeLabel')}
          testID="card-edit-time-slider"
        />

        <Text style={s.label}>{t('card.edit.budgetLabel')}</Text>
        <StepSlider
          min={0}
          max={PER_PERSON_BUDGET_MAX_KRW}
          step={PER_PERSON_BUDGET_STEP_KRW}
          value={budgetKRW}
          onChange={setBudgetKRW}
          formatValue={(v) => (v === 0 ? t('course.unselected') : t('course.budget.amount', { amount: v.toLocaleString() }))}
          accessibilityLabel={t('card.edit.budgetLabel')}
          testID="card-edit-budget-slider"
        />

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
