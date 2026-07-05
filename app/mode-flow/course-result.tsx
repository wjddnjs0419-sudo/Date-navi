import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Alert,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type DateCard, type FeelingInput } from '../../lib/ai';
import { computeTrailNodes, buildTrailPath, parseStepsFromSummary, type CourseStep } from '../../lib/course';
import { supabase } from '../../lib/supabase';
import { Clock, Wallet, Send, Bookmark } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Badge, PlaceRow } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

// 가로 S자 동선 트레일 배치 옵션
const TRAIL_OPTS = { nodesPerRow: 2, rowHeight: 150, padX: 48, padY: 56 };
const LABEL_W = 150;

function CourseTrail({ steps, width, summary }: { steps: CourseStep[]; width: number; summary?: string }) {
  // 단계가 2개 미만이면(모델이 steps를 안 준 경우 등) 트레일 대신 요약 텍스트로 폴백 — 화면이 비지 않게.
  if (steps.length < 2) {
    return (
      <View style={trail.fallbackWrap}>
        {steps.map((st, i) => (
          <Text key={i} style={trail.fallbackStep}>{i + 1}. {st.label}</Text>
        ))}
        {steps.length === 0 && !!summary && <Text style={trail.fallbackStep}>{summary}</Text>}
      </View>
    );
  }
  const nodes = computeTrailNodes(steps.length, width, TRAIL_OPTS);
  const d = buildTrailPath(nodes);
  const rows = Math.ceil(steps.length / TRAIL_OPTS.nodesPerRow);
  const height = TRAIL_OPTS.padY * 2 + (rows - 1) * TRAIL_OPTS.rowHeight;
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Path d={d} stroke={C.pink} strokeWidth={4} fill="none" strokeLinecap="round" />
        {nodes.map((n, i) => (
          <Circle key={i} cx={n.x} cy={n.y} r={14} fill={C.white} stroke={C.pink} strokeWidth={3} />
        ))}
      </Svg>
      {nodes.map((n, i) => (
        <View key={i} style={[trail.node, { left: n.x - 14, top: n.y - 14 }]}>
          <Text style={trail.nodeNum}>{i + 1}</Text>
        </View>
      ))}
      {nodes.map((n, i) => {
        // 라벨은 항상 노드 아래(높이 통일). 단, 세로 선이 지나가는 노드는
        // 라벨을 안쪽으로 밀어 선과 겹치지 않게 한다.
        const hasVertical =
          (i + 1 < nodes.length && nodes[i + 1].x === n.x && nodes[i + 1].y !== n.y) ||
          (i - 1 >= 0 && nodes[i - 1].x === n.x && nodes[i - 1].y !== n.y);
        let left: number;
        if (hasVertical) {
          left = n.x > width / 2 ? n.x - LABEL_W - 12 : n.x + 12;
        } else {
          left = n.x - LABEL_W / 2;
        }
        left = Math.max(8, Math.min(left, width - LABEL_W - 8));
        return (
          <View key={`l${i}`} style={[trail.labelBox, trail.labelWidth, { left, top: n.y + 22 }]}>
            <Text style={trail.labelText} numberOfLines={1}>{steps[i].label}</Text>
            {!!steps[i].desc && <Text style={trail.descText} numberOfLines={1}>{steps[i].desc}</Text>}
          </View>
        );
      })}
    </View>
  );
}

export default function CourseResultScreen() {
  const { mode, input, cards: cardsParam } = useLocalSearchParams<{ mode: string; input: string; cards: string }>();
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
      params: { mode: mode ?? 'make_course', input: input ?? '{}' },
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

  function stepsOf(card: DateCard): CourseStep[] {
    return card.steps && card.steps.length > 0 ? card.steps : parseStepsFromSummary(card.summary);
  }

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
          const steps = stepsOf(card);
          return (
            <ScrollView key={i} style={{ width }} contentContainerStyle={s.page}>
              <Text style={s.cardTitle}>{card.title}</Text>
              <View style={s.metaRow}>
                <View style={s.metaItem}><Clock size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_time}</Text></View>
                <View style={s.metaItem}><Wallet size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_budget}</Text></View>
              </View>

              <CourseTrail steps={steps} width={width - 40} summary={card.summary} />

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

const trail = StyleSheet.create({
  fallbackWrap: { gap: 10, paddingVertical: 16 },
  node: { position: 'absolute', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nodeNum: { fontSize: 12, fontWeight: '700', color: C.pinkDeep },
  labelBox: { position: 'absolute', alignItems: 'center', width: 120 },
  labelWidth: { width: LABEL_W },
  labelText: { fontSize: 12, fontWeight: '600', color: C.text, textAlign: 'center' },
  descText: { fontSize: 10, color: C.textMuted, textAlign: 'center', marginTop: 1 },
  fallbackStep: { fontSize: 14, color: C.text },
});
