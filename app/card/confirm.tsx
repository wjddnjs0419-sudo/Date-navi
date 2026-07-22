import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { Check, Calendar, Clock, MapPin, ShoppingBag, Wallet, ChevronRight } from 'lucide-react-native';
import { C, SP, R } from '../../constants/theme';
import { BackBar, BigButton, Chip, HeartDoodle, SoftCard, SuccessModal } from '../../components/ui';
import { Illustration, MINI_ILLUSTRATION_WIDTH } from '../../components/illustration';
import {
  DateWheelPicker,
  PickerSheet,
  TimeWheelPicker,
  defaultIsoDate,
  formatDateLabel,
} from '../../components/pickers';

type CardSummary = {
  id: string;
  title: string;
  estimated_time: string;
  estimated_budget: string;
  tags: string[];
};

const ROW_ICONS = [Calendar, Clock, MapPin, ShoppingBag] as const;

function CardMetaRow({ card }: { card: CardSummary }) {
  return (
    <View style={styles.metaRow}>
      {!!card.estimated_time && (
        <View style={styles.metaItem}>
          <Clock size={13} color={C.grayFg} strokeWidth={2} />
          <Text style={styles.metaText}>{card.estimated_time}</Text>
        </View>
      )}
      {!!card.estimated_time && !!card.estimated_budget && <Text style={styles.metaSep}>·</Text>}
      {!!card.estimated_budget && (
        <View style={styles.metaItem}>
          <Wallet size={13} color={C.grayFg} strokeWidth={2} />
          <Text style={styles.metaText}>{card.estimated_budget}</Text>
        </View>
      )}
    </View>
  );
}

export default function ConfirmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { strings: s, language } = useI18n();
  const c = s.confirm;

  const [card, setCard] = useState<CardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isPlan, setIsPlan] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(defaultIsoDate());
  const [draftTime, setDraftTime] = useState('PM 7:00');
  const [place, setPlace] = useState('');
  const [items, setItems] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('date_cards')
      .select('id, title, estimated_time, estimated_budget, tags, status, confirmed_date, confirmed_time, confirmed_place, confirmed_items')
      .eq('id', id)
      .maybeSingle();
    setCard(data);
    if (data) {
      setDate(data.confirmed_date ?? '');
      setTime(data.confirmed_time ?? '');
      setPlace(data.confirmed_place ?? '');
      setItems(data.confirmed_items ?? '');
    }
    // 이미 확정(status=confirmed)이면 읽기 상세로, 아직 미확정이면 바로 입력 모드로 연다.
    const confirmed = data?.status === 'confirmed';
    setIsPlan(confirmed);
    setEditing(!confirmed);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const wasConfirmed = isPlan;
    try {
      const { data, error } = await supabase
        .from('date_cards')
        .update({
          status: 'confirmed',
          confirmed_date: date.trim() || null,
          confirmed_time: time.trim() || null,
          confirmed_place: place.trim() || null,
          confirmed_items: items.trim() || null,
        })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('update affected no rows');
      // 저장 성공 시엔 이 화면에 머무르지 않고 확인 모달 후 홈으로 돌아간다.
      // editing을 먼저 false로 바꿔 읽기 모드 화면(SuccessModal이 그려질 return 블록)으로 전환한 뒤 모달을 띄운다.
      setEditing(false);
      setSuccessMessage(wasConfirmed ? c.savedMessage : c.confirmedMessage);
      setSuccessVisible(true);
    } catch {
      Alert.alert(c.errorTitle, c.saveError);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelPlan() {
    Alert.alert(c.cancelPlanTitle, c.cancelPlanMessage, [
      { text: c.close, style: 'cancel' },
      {
        text: c.cancelPlanAction, style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('date_cards').delete().eq('id', id);
          if (error) { Alert.alert(c.errorTitle, c.cancelPlanError); return; }
          router.back();
        },
      },
    ]);
  }

  function openDatePicker() {
    setDraftDate(date.match(/^\d{4}-\d{2}-\d{2}$/) ? date : defaultIsoDate());
    setDatePickerOpen(true);
  }

  function openTimePicker() {
    setDraftTime(time || 'PM 7:00');
    setTimePickerOpen(true);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.pink} />
        </View>
      </SafeAreaView>
    );
  }

  const detailRows = [
    { icon: ROW_ICONS[0], label: c.dateLabel, value: formatDateLabel(date, '', language) },
    { icon: ROW_ICONS[1], label: c.timeLabel, value: time },
    { icon: ROW_ICONS[2], label: c.placeLabel, value: place },
    { icon: ROW_ICONS[3], label: c.itemsLabel, value: items },
  ];
  const textRows = [
    { icon: ROW_ICONS[2], label: c.placeLabel, value: place, setter: setPlace, placeholder: c.placePlaceholder },
    { icon: ROW_ICONS[3], label: c.itemsLabel, value: items, setter: setItems, placeholder: c.itemsPlaceholder },
  ];

  // ── 읽기 상세 모드 ──────────────────────────────────────────────
  if (!editing) {
    const dateLine = [formatDateLabel(date, '', language), time].filter(Boolean).join(' · ') || c.dateTimeUnset;
    return (
      <SafeAreaView style={styles.safe}>
        <SuccessModal
          visible={successVisible}
          message={successMessage}
          onHide={() => { setSuccessVisible(false); router.replace('/(tabs)/' as any); }}
        />
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <BackBar />

          <View style={styles.headingBlock}>
            <Text style={styles.heading}>{c.upcomingTitle}</Text>
            <Text style={styles.sub}>{dateLine}</Text>
          </View>

          {card && (
            <SoftCard style={styles.cardPreview}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <CardMetaRow card={card} />
              <View style={styles.chipRow}>
                {(card.tags ?? []).slice(0, 3).map((t, i) => (
                  <Chip key={i} tone="gray">{t}</Chip>
                ))}
              </View>

              <View style={styles.detailRows}>
                {detailRows.map((row) => (
                  <View key={row.label} style={styles.detailRow}>
                    <row.icon size={15} color={C.pinkDeep} strokeWidth={2} style={styles.detailIcon} />
                    <Text style={styles.detailLabel}>{row.label}</Text>
                    <Text style={[styles.detailValue, !row.value && styles.detailValueEmpty]} numberOfLines={1}>
                      {row.value || c.unset}
                    </Text>
                  </View>
                ))}
              </View>
            </SoftCard>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => router.push({ pathname: '/card/review', params: { id } })}
              activeOpacity={0.85}
            >
              <Check size={14} color={C.white} strokeWidth={2.5} />
              <Text style={styles.doneBtnText}>{c.reviewDone}</Text>
            </TouchableOpacity>
            <BigButton variant="secondary" onPress={() => setEditing(true)}>{c.editPlan}</BigButton>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelPlan} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>{c.cancelPlan}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 입력/수정 모드 ──────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackBar />

          <View style={styles.headingBlock}>
            <View style={styles.headingRow}>
              <Text style={styles.heading}>{c.heading}</Text>
              <HeartDoodle style={styles.headingHeart} />
            </View>
            <Text style={styles.sub}>{c.sub}</Text>
            <Illustration name="mini-skyline-route" width={MINI_ILLUSTRATION_WIDTH} style={styles.headingIllustration} />
          </View>

          {card && (
            <SoftCard style={styles.cardPreview}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <CardMetaRow card={card} />
              <View style={styles.chipRow}>
                {(card.tags ?? []).slice(0, 3).map((t, i) => (
                  <Chip key={i} tone="gray">{t}</Chip>
                ))}
              </View>
            </SoftCard>
          )}

          <View style={styles.rowList}>
            <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={openDatePicker}>
              <View style={styles.rowIconWrap}>
                <Calendar size={16} color={C.pinkDeep} strokeWidth={2} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.rowLabel}>{c.dateLabel}</Text>
                <Text style={[styles.pickerValue, !date && styles.pickerValueEmpty]}>
                  {date ? formatDateLabel(date, undefined, language) : c.datePlaceholder}
                </Text>
              </View>
              <ChevronRight size={18} color={C.textLight} strokeWidth={2} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={openTimePicker}>
              <View style={styles.rowIconWrap}>
                <Clock size={16} color={C.pinkDeep} strokeWidth={2} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.rowLabel}>{c.timeLabel}</Text>
                <Text style={[styles.pickerValue, !time && styles.pickerValueEmpty]}>
                  {time || c.timePlaceholder}
                </Text>
              </View>
              <ChevronRight size={18} color={C.textLight} strokeWidth={2} />
            </TouchableOpacity>

            {textRows.map((row) => (
              <View key={row.label} style={styles.row}>
                <View style={styles.rowIconWrap}>
                  <row.icon size={16} color={C.pinkDeep} strokeWidth={2} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <TextInput
                    style={styles.rowInput}
                    value={row.value}
                    onChangeText={row.setter}
                    placeholder={row.placeholder}
                    placeholderTextColor={C.textFaint}
                    returnKeyType="next"
                  />
                </View>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'}>
              {saving ? c.saving : c.saveButton}
            </BigButton>
            <BigButton variant="text" onPress={() => (isPlan ? setEditing(false) : router.back())}>
              {isPlan ? c.back : c.keepButton}
            </BigButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <PickerSheet
        visible={datePickerOpen}
        title={c.dateLabel}
        onCancel={() => setDatePickerOpen(false)}
        onConfirm={() => { setDate(draftDate); setDatePickerOpen(false); }}
      >
        <DateWheelPicker value={draftDate} onChange={setDraftDate} />
      </PickerSheet>
      <PickerSheet
        visible={timePickerOpen}
        title={c.timeLabel}
        onCancel={() => setTimePickerOpen(false)}
        onConfirm={() => { setTime(draftTime); setTimePickerOpen(false); }}
      >
        <TimeWheelPicker value={draftTime} onChange={setDraftTime} />
      </PickerSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },
  content: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: SP.xxxl + SP.lg },

  headingBlock: { marginTop: SP.lg, marginBottom: SP.xl },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headingHeart: { marginTop: 2, marginLeft: 4 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 30 },
  sub: { marginTop: SP.xs + 2, fontSize: 13, color: C.textSub, lineHeight: 19 },
  headingIllustration: { alignSelf: 'flex-end', marginTop: -8 },

  cardPreview: { marginBottom: SP.xl, backgroundColor: C.white },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: SP.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SP.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  metaText: { fontSize: 12, color: C.grayFg },
  metaSep: { marginHorizontal: SP.sm, color: C.textFaint },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },

  rowList: { gap: SP.sm, marginBottom: SP.xxl + SP.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.white,
    borderRadius: R.btn,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.lg,
    borderWidth: 1,
    borderColor: C.border,
    gap: SP.md,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    backgroundColor: C.pinkLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rowLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600', marginBottom: SP.xs },
  rowInput: { fontSize: 14, color: C.text, paddingVertical: 0 },
  pickerValue: { fontSize: 14, color: C.text, paddingVertical: 2, fontWeight: '600' },
  pickerValueEmpty: { color: C.textFaint, fontWeight: '500' },

  detailRows: { marginTop: SP.lg, gap: SP.md, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: SP.lg },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  detailIcon: { width: SP.xl },
  detailLabel: { fontSize: 13, color: C.textMuted, fontWeight: '600', width: 72 },
  detailValue: { fontSize: 14, color: C.text, fontWeight: '600', flex: 1 },
  detailValueEmpty: { color: C.textFaint, fontWeight: '500' },

  actions: { gap: SP.xs + 2 },
  doneBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.xs + 2,
    backgroundColor: C.pink, borderRadius: R.btn, paddingVertical: SP.lg,
  },
  doneBtnText: { color: C.white, fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { fontSize: 14, color: C.danger, fontWeight: '600' },
});
