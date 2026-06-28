import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { generateDateCards, getUserPreferences, type DateCard, type FeelingInput } from '../../lib/ai';
import { supabase } from '../../lib/supabase';
import { logEvent } from '../../lib/analytics';
import { useI18n } from '../../lib/i18n';
import {
  Heart, Sparkles, Clock, Wallet, MapPin, Send, Bookmark, RefreshCw,
  ChevronRight, Leaf, Palette,
} from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Badge, Chip, SoftCard } from '../../components/ui';

const CARD_STYLES = [
  { bg: 'linear-gradient(135deg, #FFD3D9 0%, #F1ECFF 100%)', bg2: C.pinkMid, Icon: Heart, iconColor: C.pinkDeep },
  { bg: 'linear-gradient(135deg, #E3F2EA, #FFF3E0)', bg2: C.mint, Icon: Leaf, iconColor: C.mintFg },
  { bg: 'linear-gradient(135deg, #F1ECFF, #FFEEF0)', bg2: C.lavender, Icon: Palette, iconColor: C.lavenderFg },
];

export default function ResultScreen() {
  const { mode, input } = useLocalSearchParams<{ mode: string; input: string }>();
  const router = useRouter();
  const { strings: s, language } = useI18n();

  const [cards, setCards] = useState<DateCard[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedFirstId, setSavedFirstId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const parsedInput: FeelingInput = JSON.parse(input ?? '{}');
        const prefs = await getUserPreferences();

        await logEvent('mode_selected', { mode: mode ?? 'pick_for_me' });
        const result = await generateDateCards(parsedInput, mode ?? 'pick_for_me', prefs, language);
        setCards(result);
        await logEvent('ai_card_created', { mode: mode ?? 'pick_for_me', card_count: result.length });
      } catch {
        setErrorMsg('추천을 만드는 중 문제가 생겼어요.');
      } finally {
        setLoading(false);
      }
    })();
  }, [input, language, mode]);

  async function handleSave() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.couple_id) return;

      const parsedInput: FeelingInput = JSON.parse(input ?? '{}');
      const savedIds: string[] = [];
      const rows = cards.map(card => {
        const cardId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        savedIds.push(cardId);
        return {
          id: cardId,
          couple_id: profile.couple_id,
          created_by: user.id,
          mode: mode ?? 'pick_for_me',
          input_json: parsedInput,
          source: 'ai',
          title: card.title,
          summary: card.summary,
          estimated_time: card.estimated_time,
          estimated_budget: card.estimated_budget,
          tags: card.tags,
          why_recommended: card.why_recommended,
        };
      });

      const { error } = await supabase.from('date_cards').insert(rows);
      if (error) throw error;

      setSaved(true);
      setSavedFirstId(savedIds[0] ?? null);
    } catch {
      setErrorMsg('저장 중 오류가 발생했어요.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFF8F3', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={C.pink} />
        <Text style={{ fontSize: 14, color: C.textSub, marginTop: 16, textAlign: 'center' }}>
          둘에게 맞는 후보를{'\n'}고르는 중이에요
        </Text>
      </View>
    );
  }

  if (errorMsg !== '' && cards.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: C.gray, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Sparkles size={44} strokeWidth={1.5} color={C.textSub} />
        </View>
        <Text style={s2.errTitle}>잠깐 문제가 생겼어요</Text>
        <Text style={s2.errSub}>추천을 만드는 중 문제가 생겼어요.{'\n'}다시 한 번 시도해볼게요.</Text>
        <BigButton onPress={() => router.back()} style={{ marginTop: 24 }}>다시 시도하기</BigButton>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <ScrollView contentContainerStyle={s2.content} showsVerticalScrollIndicator={false}>
        <BackBar />

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
          <Badge tone="pink">AI 추천</Badge>
          <Badge>방금 전</Badge>
        </View>

        <Text style={[s2.heading, { marginTop: 12 }]}>오늘은 이런 데이트가{'\n'}잘 맞아 보여요</Text>
        <Text style={s2.subText}>3개 후보 중 마음에 드는 걸 골라주세요.</Text>

        {cards.map((card, i) => {
          const style = CARD_STYLES[i % CARD_STYLES.length];
          const isFeatured = i === selectedIndex;
          return isFeatured ? (
            /* 메인 카드 */
            <View key={i} style={s2.featuredCard}>
              <View style={[s2.featuredBanner, { backgroundColor: style.bg2 }]}>
                {i === 0 && (
                  <View style={{ position: 'absolute', top: 16, left: 16 }}>
                    <Badge tone="pink">가장 잘 맞아요</Badge>
                  </View>
                )}
                <View style={[s2.featuredIcon, { backgroundColor: C.white }]}>
                  <style.Icon size={36} strokeWidth={1.5} color={style.iconColor} />
                </View>
              </View>
              <View style={s2.featuredBody}>
                <Text style={s2.featuredCategory}>COZY · INDOOR</Text>
                <Text style={s2.featuredTitle}>{card.title}</Text>
                <Text style={s2.featuredDesc}>{card.summary}</Text>

                <View style={s2.metaGrid}>
                  <View style={s2.metaBox}>
                    <Clock size={14} color={C.creamFg} />
                    <Text style={s2.metaLabel}>시간</Text>
                    <Text style={s2.metaValue}>{card.estimated_time}</Text>
                  </View>
                  <View style={s2.metaBox}>
                    <Wallet size={14} color={C.creamFg} />
                    <Text style={s2.metaLabel}>예산</Text>
                    <Text style={s2.metaValue}>{card.estimated_budget}</Text>
                  </View>
                  <View style={s2.metaBox}>
                    <MapPin size={14} color={C.creamFg} />
                    <Text style={s2.metaLabel}>이동</Text>
                    <Text style={s2.metaValue}>도보</Text>
                  </View>
                </View>

                <View style={s2.chips}>
                  {(card.tags ?? []).slice(0, 4).map((t) => <Chip key={t} tone="gray">{t}</Chip>)}
                </View>

                <View style={s2.whyBox}>
                  <Sparkles size={14} color={C.creamFg} />
                  <Text style={s2.whyText}>{card.why_recommended}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                  <TouchableOpacity
                    style={s2.sendBtn}
                    onPress={() => router.push('/share/send' as any)}
                  >
                    <Send size={14} color={C.white} />
                    <Text style={s2.sendBtnText}>상대에게 보내기</Text>
                  </TouchableOpacity>
                  {!saved && (
                    <TouchableOpacity style={s2.bookmarkBtn} onPress={handleSave} disabled={saving}>
                      {saving
                        ? <ActivityIndicator size="small" color={C.pinkDeep} />
                        : <>
                            <Bookmark size={14} color={C.pinkDeep} />
                            <Text style={s2.bookmarkBtnText}>저장</Text>
                          </>}
                    </TouchableOpacity>
                  )}
                </View>
                {saved && (
                  <TouchableOpacity
                    style={s2.goBtn}
                    onPress={() => router.replace('/(tabs)/candidates' as any)}
                  >
                    <Text style={s2.goBtnText}>후보 목록으로 보기 →</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={s2.retryBtn}
                  onPress={() => router.back()}
                >
                  <RefreshCw size={12} color={C.textSub} />
                  <Text style={s2.retryBtnText}>다시 추천받기</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* 서브 카드 */
            <SoftCard key={i} style={{ marginTop: 12 }} onPress={() => setSelectedIndex(i)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[s2.subIcon, { backgroundColor: style.bg2 }]}>
                  <style.Icon size={26} strokeWidth={1.5} color={style.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s2.subTitle}>{card.title}</Text>
                  <Text style={s2.subDesc} numberOfLines={2}>{card.summary}</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Clock size={11} color={C.textMuted} />
                      <Text style={s2.subMeta}>{card.estimated_time}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Wallet size={11} color={C.textMuted} />
                      <Text style={s2.subMeta}>{card.estimated_budget}</Text>
                    </View>
                  </View>
                </View>
                <ChevronRight size={16} color={C.textFaint} />
              </View>
            </SoftCard>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s2 = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8, marginBottom: 4 },
  featuredCard: {
    marginTop: 20,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#785046',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 5,
  },
  featuredBanner: {
    height: 160,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: 20,
  },
  featuredIcon: {
    width: 80, height: 80, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  featuredBody: { padding: 20 },
  featuredCategory: { fontSize: 11, color: C.textMuted, letterSpacing: 0.5 },
  featuredTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 4 },
  featuredDesc: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 4 },
  metaGrid: { flexDirection: 'row', gap: 8, marginTop: 16 },
  metaBox: {
    flex: 1, borderRadius: 14, padding: 12,
    backgroundColor: '#FFF8F3', gap: 4,
  },
  metaLabel: { fontSize: 10, color: C.textMuted, marginTop: 4 },
  metaValue: { fontSize: 13, fontWeight: '600', color: C.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  whyBox: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 14,
    padding: 12,
    backgroundColor: C.cream,
    marginTop: 16,
    alignItems: 'flex-start',
  },
  whyText: { fontSize: 12, color: '#6B5247', lineHeight: 19, flex: 1 },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: C.pink,
  },
  sendBtnText: { fontSize: 13, fontWeight: '600', color: C.white },
  bookmarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.pinkBorder,
  },
  bookmarkBtnText: { fontSize: 13, fontWeight: '600', color: C.pinkDeep },
  goBtn: { alignItems: 'center', marginTop: 12 },
  goBtnText: { fontSize: 13, color: C.pinkDeep, fontWeight: '600' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  retryBtnText: { fontSize: 12, color: C.textSub },
  subIcon: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  subTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  subDesc: { fontSize: 12, color: C.textSub, lineHeight: 17, marginTop: 2 },
  subMeta: { fontSize: 11, color: C.textMuted },
  errTitle: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' },
  errSub: { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginTop: 12 },
});
