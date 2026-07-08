import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Alert,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type DateCard, type FeelingInput } from '../../lib/ai';
import { resolveDisplaySteps } from '../../lib/course';
import { supabase } from '../../lib/supabase';
import { Clock, Wallet, Send, Bookmark } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Badge, PlaceRow, CourseStepList } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

export default function CourseResultScreen() {
  const { mode, input, cards: cardsParam, sessionId } = useLocalSearchParams<{ mode: string; input: string; cards: string; sessionId?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t } = useI18n();

  // 카드는 generating 화면에서 생성해 params로 넘겨준다.
  const cards = useMemo<DateCard[]>(() => {
    try { return JSON.parse(cardsParam ?? '[]'); } catch { return []; }
  }, [cardsParam]);

  // 입력화면은 스택에서 빠져 있으므로, 다시 시도는 generating 으로 재진입해 재생성한다.
  function regenerate() {
    router.replace({
      pathname: '/mode-flow/generating',
      params: { mode: mode ?? 'make_course', input: input ?? '{}', ...(sessionId ? { sessionId } : {}) },
    } as any);
  }

  const [sending, setSending] = useState(false);

  // 보내기 전에 현재 보고 있는 코스를 저장해 id 를 확보하고, 그 id 로 공유 화면을 연다.
  async function handleSendToPartner() {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('date_planner_profiles').select('couple_id').eq('user_id', user.id).maybeSingle();
      if (!profile?.couple_id) { Alert.alert(t('modeFlow.courseResult.coupleRequired')); return; }

      const card = cards[page];
      const cardId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const { error } = await supabase.from('date_cards').insert({
        id: cardId,
        couple_id: profile.couple_id,
        created_by: user.id,
        mode: mode ?? 'make_course',
        input_json: JSON.parse(input ?? '{}'),
        source: 'ai',
        title: card.title,
        summary: card.summary,
        estimated_time: card.estimated_time,
        estimated_budget: card.estimated_budget,
        tags: card.tags,
        why_recommended: card.why_recommended,
        place_name: card.place_name ?? null,
        place_address: card.place_address ?? null,
        map_url: card.map_url ?? null,
        steps: card.steps ?? null,
      });
      if (error) throw error;
      router.push({ pathname: '/share/send', params: { cardId } } as any);
    } catch {
      Alert.alert(t('modeFlow.courseResult.sendErrorTitle'), t('modeFlow.courseResult.sendError'));
    } finally {
      setSending(false);
    }
  }

  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSave() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('date_planner_profiles').select('couple_id').eq('user_id', user.id).maybeSingle();
      if (!profile?.couple_id) return;
      const parsed: FeelingInput = JSON.parse(input ?? '{}');
      const card = cards[page];
      const { error } = await supabase.from('date_cards').insert({
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        couple_id: profile.couple_id,
        created_by: user.id,
        mode: mode ?? 'make_course',
        input_json: parsed,
        source: 'ai',
        title: card.title,
        summary: card.summary,
        estimated_time: card.estimated_time,
        estimated_budget: card.estimated_budget,
        tags: card.tags,
        why_recommended: card.why_recommended,
        place_name: card.place_name ?? null,
        place_address: card.place_address ?? null,
        map_url: card.map_url ?? null,
        steps: card.steps ?? null,
      });
      if (error) throw error;
      setSaved(true);
    } catch {
      setErrorMsg(t('modeFlow.courseResult.saveError'));
    } finally {
      setSaving(false);
    }
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  if (errorMsg !== '' && cards.length === 0) {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.errTitle}>{t('modeFlow.courseResult.errorTitle')}</Text>
        <BigButton onPress={regenerate} style={s.errRetryBtn}>{t('modeFlow.courseResult.retry')}</BigButton>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <BackBar />
      <View style={s.headerArea}>
        <Badge tone="pink">{t('modeFlow.courseResult.badge')}</Badge>
        <Text style={s.heading}>{t('modeFlow.courseResult.heading')}</Text>
        <Text style={s.sub}>{t('modeFlow.courseResult.sub')}</Text>
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        {cards.map((card, i) => {
          const steps = resolveDisplaySteps(card);
          return (
            <ScrollView key={i} style={{ width }} contentContainerStyle={s.page}>
              <Text style={s.cardTitle}>{card.title}</Text>
              <View style={s.metaRow}>
                {!!card.estimated_time && <View style={s.metaItem}><Clock size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_time}</Text></View>}
                {!!card.estimated_budget && <View style={s.metaItem}><Wallet size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_budget}</Text></View>}
              </View>

              <CourseStepList steps={steps} summary={card.summary} />

              {!!card.place_name && (
                <PlaceRow name={card.place_name} address={card.place_address} url={card.map_url} style={s.placeRowGap} />
              )}

              <View style={s.btnRow}>
                <TouchableOpacity style={s.sendBtn} onPress={handleSendToPartner} disabled={sending}>
                  {sending ? <ActivityIndicator size="small" color={C.white} /> : <Send size={14} color={C.white} />}<Text style={s.sendText}>{t('modeFlow.courseResult.send')}</Text>
                </TouchableOpacity>
                {!saved && (
                  <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color={C.pinkDeep} />
                      : <><Bookmark size={14} color={C.pinkDeep} /><Text style={s.saveText}>{t('modeFlow.courseResult.save')}</Text></>}
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          );
        })}
      </ScrollView>

      <View style={s.dots}>
        {cards.map((_, i) => (
          <View key={i} style={[s.dot, i === page && s.dotOn]} />
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { fontSize: 14, color: C.textSub, marginTop: 16, textAlign: 'center' },
  errTitle: { fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'center' },
  errRetryBtn: { marginTop: 24 },
  placeRowGap: { marginTop: 12 },
  headerArea: { paddingHorizontal: 20, gap: 6, marginBottom: 8 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: 6 },
  sub: { fontSize: 13, color: C.textSub },
  page: { paddingHorizontal: 20, paddingBottom: 40 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 8 },
  metaRow: { flexDirection: 'row', gap: 14, marginTop: 8, marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: C.textMuted },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  sendBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 12, backgroundColor: C.pink },
  sendText: { fontSize: 13, fontWeight: '600', color: C.white },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.pinkBorder },
  saveText: { fontSize: 13, fontWeight: '600', color: C.pinkDeep },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.border },
  dotOn: { backgroundColor: C.pink, width: 18 },
});
