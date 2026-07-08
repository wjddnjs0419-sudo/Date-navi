import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { generateDateCards, getUserPreferences } from '../../lib/ai';
import { Sparkles } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, SoftCard, OptionCardPicker } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

export default function NewCardScreen() {
  const router = useRouter();
  const { t, language } = useI18n();
  const TIME_OPTIONS = [
    t('card.new.timeOptions.oneToTwo'), t('card.new.timeOptions.twoToThree'),
    t('card.new.timeOptions.halfDay'), t('card.new.timeOptions.fullDay'),
  ];
  const BUDGET_OPTIONS = [
    t('card.new.budgetOptions.saving'), t('card.new.budgetOptions.moderate'), t('card.new.budgetOptions.special'),
  ];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selTime, setSelTime] = useState<number | null>(null);
  const [selBudget, setSelBudget] = useState<number | null>(null);
  const [useAI, setUseAI] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;
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
        Alert.alert(t('card.new.needCoupleAlert'));
        return;
      }

      const cardId = Math.random().toString(36).slice(2) + Date.now().toString(36);

      if (useAI) {
        const prefs = await getUserPreferences();
        const cards = await generateDateCards(
          {
            energy: '',
            distance: '',
            mood: '',
            duration: selTime !== null ? TIME_OPTIONS[selTime] : '',
            avoid: [],
            freeText: [title.trim(), description.trim()].filter(Boolean).join('. '),
          },
          'make_course',
          prefs,
          language,
        );
        const card = cards[0];

        await supabase.from('date_cards').insert({
          id: cardId,
          couple_id: profile.couple_id,
          created_by: user.id,
          mode: 'manual',
          input_json: {},
          source: 'ai',
          title: card.title,
          summary: card.summary,
          estimated_time: card.estimated_time,
          estimated_budget: card.estimated_budget,
          tags: card.tags,
          why_recommended: card.why_recommended,
        });
      } else {
        await supabase.from('date_cards').insert({
          id: cardId,
          couple_id: profile.couple_id,
          created_by: user.id,
          mode: 'manual',
          input_json: {},
          source: 'manual',
          title: title.trim(),
          summary: description.trim(),
          estimated_time: selTime !== null ? TIME_OPTIONS[selTime] : '',
          estimated_budget: selBudget !== null ? BUDGET_OPTIONS[selBudget] : '',
          tags: [],
          why_recommended: '',
        });
      }

      router.replace('/(tabs)/candidates');
    } catch {
      Alert.alert(t('common.error'), t('card.new.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar onPress={() => router.back()} />

        <Text style={[s.heading, s.headingTop]}>{t('card.new.heading')}</Text>
        <Text style={s.subText}>{t('card.new.subtitle')}</Text>

        {/* 제목 */}
        <Text style={s.label}>{t('card.new.titleLabel')}</Text>
        <View style={[s.inputWrap, title.length > 0 && s.inputWrapActive]}>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('card.new.titlePlaceholder')}
            placeholderTextColor={C.textFaint}
            maxLength={60}
          />
        </View>

        {/* 설명 */}
        <Text style={s.label}>{t('card.new.descLabel')}</Text>
        <View style={s.inputWrap}>
          <TextInput
            style={[s.input, s.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('card.new.descPlaceholder')}
            placeholderTextColor={C.textFaint}
            multiline
            maxLength={200}
          />
        </View>

        {/* 예상 시간 */}
        <Text style={s.label}>{t('card.new.timeLabel')}</Text>
        <OptionCardPicker
          options={[
            { value: '', label: t('card.new.noneOption') },
            ...TIME_OPTIONS.map((time) => ({ value: time, label: time })),
          ]}
          value={selTime !== null ? TIME_OPTIONS[selTime] : ''}
          onChange={(v) => {
            const idx = TIME_OPTIONS.indexOf(v);
            setSelTime(idx >= 0 ? idx : null);
          }}
        />

        {/* 예산 */}
        <Text style={s.label}>{t('card.new.budgetLabel')}</Text>
        <View style={s.budgetRow}>
          {BUDGET_OPTIONS.map((b, i) => {
            const sel = i === selBudget;
            return (
              <TouchableOpacity
                key={b}
                onPress={() => setSelBudget(sel ? null : i)}
                activeOpacity={0.7}
                style={[s.chipBtn, s.chipBtnFlex, sel && s.chipBtnOn]}
              >
                <Text style={[s.chipText, sel && s.chipTextOn]}>{b}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* AI 보정 토글 */}
        <SoftCard style={[s.aiCard, { backgroundColor: useAI ? C.lavender : C.white }]}>
          <View style={s.toggleRow}>
            <View style={s.toggleLeft}>
              <Sparkles size={16} color={useAI ? C.lavenderFg : C.textSub} />
              <View style={s.toggleBody}>
                <Text style={[s.toggleTitle, useAI && s.toggleTitleOn]}>
                  {t('card.new.aiToggleTitle')}
                </Text>
                <Text style={s.toggleSub}>{t('card.new.aiToggleSub')}</Text>
              </View>
            </View>
            <Switch
              value={useAI}
              onValueChange={setUseAI}
              trackColor={{ false: C.border, true: C.lavenderFg }}
              thumbColor={C.white}
            />
          </View>
        </SoftCard>

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton
          onPress={handleSave}
          variant={!canSave || saving ? 'disabled' : 'primary'}
        >
          {saving
            ? <ActivityIndicator color={C.white} size="small" />
            : useAI ? t('card.new.aiSaveCta') : t('card.new.saveCta')}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  headingTop: { marginTop: 16 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  label: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  inputWrap: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputWrapActive: { borderColor: C.pinkBorder, borderWidth: 1.5 },
  input: { fontSize: 14, color: C.text, lineHeight: 22 },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  budgetRow: { flexDirection: 'row', gap: 8 },
  chipBtn: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  chipBtnFlex: { flex: 1 },
  chipBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder, borderWidth: 1.5 },
  chipText: { fontSize: 13, color: C.inkSoft, fontWeight: '500' },
  chipTextOn: { color: C.pinkDeep, fontWeight: '600' },
  aiCard: { marginTop: 24 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  toggleBody: { flex: 1 },
  toggleTitle: { fontSize: 13, fontWeight: '600', color: C.text },
  toggleTitleOn: { color: C.lavenderFg },
  toggleSub: { fontSize: 11, color: C.textSub, marginTop: 2, lineHeight: 16 },
  bottomSpacer: { height: 120 },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.bg,
  },
});
