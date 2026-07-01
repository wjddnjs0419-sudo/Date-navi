import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Chip, SoftCard } from '../../components/ui';

type CardSummary = {
  id: string;
  title: string;
  estimated_time: string;
  estimated_budget: string;
  tags: string[];
};

const ROW_ICONS = ['📅', '🕐', '📍', '🛍️'];

export default function ConfirmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { strings: s } = useI18n();
  const c = s.confirm;

  const [card, setCard] = useState<CardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [isPlan, setIsPlan] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
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
      // 저장 후엔 읽기 상세로 전환해 정리된 일정을 보여준다.
      await load();
      setEditing(false);
    } catch {
      Alert.alert('오류', c.saveError);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelPlan() {
    Alert.alert('계획 취소', '이 데이트 계획을 취소할까요? 카드가 완전히 삭제돼요.', [
      { text: '닫기', style: 'cancel' },
      {
        text: '계획 취소', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('date_cards').delete().eq('id', id);
          if (error) { Alert.alert('오류', '취소 중 문제가 발생했어요.'); return; }
          router.back();
        },
      },
    ]);
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

  const rows = [
    { icon: ROW_ICONS[0], label: c.dateLabel, value: date, setter: setDate, placeholder: c.datePlaceholder },
    { icon: ROW_ICONS[1], label: c.timeLabel, value: time, setter: setTime, placeholder: c.timePlaceholder },
    { icon: ROW_ICONS[2], label: c.placeLabel, value: place, setter: setPlace, placeholder: c.placePlaceholder },
    { icon: ROW_ICONS[3], label: c.itemsLabel, value: items, setter: setItems, placeholder: c.itemsPlaceholder },
  ];

  // ── 읽기 상세 모드 ──────────────────────────────────────────────
  if (!editing) {
    const dateLine = [date, time].filter(Boolean).join(' · ') || '날짜·시간 미정';
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <BackBar />

          <View style={styles.headingBlock}>
            <Text style={styles.heading}>다가오는 데이트</Text>
            <Text style={styles.sub}>{dateLine}</Text>
          </View>

          {card && (
            <SoftCard style={styles.cardPreview}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>⏱ {card.estimated_time}</Text>
                <Text style={styles.metaSep}>·</Text>
                <Text style={styles.metaText}>💰 {card.estimated_budget}</Text>
              </View>
              <View style={styles.chipRow}>
                {(card.tags ?? []).slice(0, 3).map((t, i) => (
                  <Chip key={i} tone="gray">{t}</Chip>
                ))}
              </View>

              <View style={styles.detailRows}>
                {rows.map((row) => (
                  <View key={row.label} style={styles.detailRow}>
                    <Text style={styles.detailIcon}>{row.icon}</Text>
                    <Text style={styles.detailLabel}>{row.label}</Text>
                    <Text style={[styles.detailValue, !row.value && styles.detailValueEmpty]} numberOfLines={1}>
                      {row.value || '미정'}
                    </Text>
                  </View>
                ))}
              </View>
            </SoftCard>
          )}

          <View style={styles.actions}>
            <BigButton onPress={() => setEditing(true)}>계획 수정하기</BigButton>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelPlan} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>계획 취소하기</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 입력/수정 모드 ──────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackBar />

          <View style={styles.headingBlock}>
            <Text style={styles.heading}>{c.heading}</Text>
            <Text style={styles.sub}>{c.sub}</Text>
          </View>

          {card && (
            <SoftCard style={styles.cardPreview}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>⏱ {card.estimated_time}</Text>
                <Text style={styles.metaSep}>·</Text>
                <Text style={styles.metaText}>💰 {card.estimated_budget}</Text>
              </View>
              <View style={styles.chipRow}>
                {(card.tags ?? []).slice(0, 3).map((t, i) => (
                  <Chip key={i} tone="gray">{t}</Chip>
                ))}
              </View>
            </SoftCard>
          )}

          <View style={styles.rowList}>
            {rows.map((row) => (
              <View key={row.label} style={styles.row}>
                <View style={styles.rowIconWrap}>
                  <Text style={styles.rowIconText}>{row.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
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
              {saving ? '저장 중...' : c.saveButton}
            </BigButton>
            <BigButton variant="text" onPress={() => (isPlan ? setEditing(false) : router.back())}>
              {isPlan ? '돌아가기' : c.keepButton}
            </BigButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },

  headingBlock: { marginTop: 16, marginBottom: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 30 },
  sub: { marginTop: 6, fontSize: 13, color: C.textSub, lineHeight: 19 },

  cardPreview: { marginBottom: 20, backgroundColor: C.white },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  metaText: { fontSize: 12, color: C.grayFg },
  metaSep: { marginHorizontal: 8, color: C.textFaint },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  rowList: { gap: 10, marginBottom: 28 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.white,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rowIconText: { fontSize: 16 },
  rowLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600', marginBottom: 4 },
  rowInput: { fontSize: 14, color: C.text, paddingVertical: 0 },

  detailRows: { marginTop: 16, gap: 12, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIcon: { fontSize: 15, width: 20, textAlign: 'center' },
  detailLabel: { fontSize: 13, color: C.textMuted, fontWeight: '600', width: 72 },
  detailValue: { fontSize: 14, color: C.text, fontWeight: '600', flex: 1 },
  detailValueEmpty: { color: C.textFaint, fontWeight: '500' },

  actions: { gap: 6 },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { fontSize: 14, color: '#FF4F6D', fontWeight: '600' },
});
