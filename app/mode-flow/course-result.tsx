import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { generateDateCards, getUserPreferences, type DateCard, type FeelingInput } from '../../lib/ai';
import { computeTrailNodes, buildTrailPath, parseStepsFromSummary, type CourseStep } from '../../lib/course';
import { supabase } from '../../lib/supabase';
import { logEvent } from '../../lib/analytics';
import { useI18n } from '../../lib/i18n';
import { Clock, Wallet, Send, Bookmark } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Badge } from '../../components/ui';

// 가로 S자 동선 트레일 배치 옵션
const TRAIL_OPTS = { nodesPerRow: 2, rowHeight: 150, padX: 48, padY: 56 };
const LABEL_W = 150;

function CourseTrail({ steps, width, summary }: { steps: CourseStep[]; width: number; summary?: string }) {
  // 단계가 2개 미만이면(모델이 steps를 안 준 경우 등) 트레일 대신 요약 텍스트로 폴백 — 화면이 비지 않게.
  if (steps.length < 2) {
    return (
      <View style={{ gap: 10, paddingVertical: 16 }}>
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
          <View key={`l${i}`} style={[trail.labelBox, { left, top: n.y + 22, width: LABEL_W }]}>
            <Text style={trail.labelText} numberOfLines={1}>{steps[i].label}</Text>
            {!!steps[i].desc && <Text style={trail.descText} numberOfLines={1}>{steps[i].desc}</Text>}
          </View>
        );
      })}
    </View>
  );
}

export default function CourseResultScreen() {
  const { mode, input } = useLocalSearchParams<{ mode: string; input: string }>();
  const router = useRouter();
  const { language } = useI18n();
  const { width } = useWindowDimensions();

  const [cards, setCards] = useState<DateCard[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const parsed: FeelingInput = JSON.parse(input ?? '{}');
        const prefs = await getUserPreferences();
        await logEvent('mode_selected', { mode: mode ?? 'make_course' });
        const result = await generateDateCards(parsed, mode ?? 'make_course', prefs, language);
        setCards(result);
        await logEvent('ai_card_created', { mode: mode ?? 'make_course', card_count: result.length });
      } catch {
        setErrorMsg('코스를 만드는 중 문제가 생겼어요.');
      } finally {
        setLoading(false);
      }
    })();
  }, [input, language, mode]);

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
      const rows = cards.map(card => ({
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
      }));
      const { error } = await supabase.from('date_cards').insert(rows);
      if (error) throw error;
      setSaved(true);
    } catch {
      setErrorMsg('저장 중 오류가 발생했어요.');
    } finally {
      setSaving(false);
    }
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.pink} />
        <Text style={s.loadingText}>둘에게 맞는 코스를{'\n'}짜는 중이에요</Text>
      </View>
    );
  }

  if (errorMsg !== '' && cards.length === 0) {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.errTitle}>잠깐 문제가 생겼어요</Text>
        <BigButton onPress={() => router.back()} style={{ marginTop: 24 }}>다시 시도하기</BigButton>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <BackBar />
      <View style={s.headerArea}>
        <Badge tone="pink">AI 코스</Badge>
        <Text style={s.heading}>이런 코스는 어때요?</Text>
        <Text style={s.sub}>밀어서 후보 3개를 비교해보세요.</Text>
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

              <View style={s.btnRow}>
                <TouchableOpacity style={s.sendBtn} onPress={() => router.push('/share/send' as any)}>
                  <Send size={14} color={C.white} /><Text style={s.sendText}>상대에게 보내기</Text>
                </TouchableOpacity>
                {!saved && (
                  <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color={C.pinkDeep} />
                      : <><Bookmark size={14} color={C.pinkDeep} /><Text style={s.saveText}>저장</Text></>}
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
  safe: { flex: 1, backgroundColor: '#FFF8F3' },
  center: { flex: 1, backgroundColor: '#FFF8F3', alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { fontSize: 14, color: C.textSub, marginTop: 16, textAlign: 'center' },
  errTitle: { fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'center' },
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
  node: { position: 'absolute', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nodeNum: { fontSize: 12, fontWeight: '700', color: C.pinkDeep },
  labelBox: { position: 'absolute', alignItems: 'center', width: 120 },
  labelText: { fontSize: 12, fontWeight: '600', color: C.text, textAlign: 'center' },
  descText: { fontSize: 10, color: C.textMuted, textAlign: 'center', marginTop: 1 },
  fallbackStep: { fontSize: 14, color: C.text },
});
