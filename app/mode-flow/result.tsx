import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type DateCard } from '../../lib/ai';
import { supabase } from '../../lib/supabase';
import {
  Sparkles, Clock, Wallet, MapPin, Send, Bookmark, RefreshCw,
  ChevronRight,
} from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, Badge, Chip, SoftCard, PlaceRow } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { getCardStyle } from '../../lib/tagStyle';

export default function ResultScreen() {
  const { mode, input, cards: cardsParam, sessionId } = useLocalSearchParams<{ mode: string; input: string; cards: string; sessionId?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  // 카드는 generating 화면에서 생성해 params로 넘겨준다.
  const cards = useMemo<DateCard[]>(() => {
    try { return JSON.parse(cardsParam ?? '[]'); } catch { return []; }
  }, [cardsParam]);

  // 입력화면은 스택에서 빠져 있으므로, 다시 추천은 generating 으로 재진입해 재생성한다.
  // sessionId가 있으면 generating이 Candidate Pool을 재사용하고 previousPlaceIds를 제외한다 (Phase 6).
  function regenerate() {
    router.replace({
      pathname: '/mode-flow/generating',
      params: { mode: mode ?? 'feeling', input: input ?? '{}', ...(sessionId ? { sessionId } : {}) },
    } as any);
  }

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sending, setSending] = useState(false);
  // 후보는 params 로만 넘어와 아직 DB 에 없다. 저장하며 확보한 id 를 인덱스별로 재사용해
  // 같은 카드를 중복 insert 하지 않는다.
  const [savedIds, setSavedIds] = useState<Record<number, string>>({});

  // 후보(인덱스) 를 date_cards 에 저장하고 id 를 돌려준다. 이미 저장했으면 그 id 를 재사용.
  async function saveCard(i: number): Promise<string | null> {
    if (savedIds[i]) return savedIds[i];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from('date_planner_profiles').select('couple_id').eq('user_id', user.id).maybeSingle();
    if (!profile?.couple_id) { Alert.alert(t('modeFlow.result.coupleRequired')); return null; }

    const card = cards[i];
    const cardId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const { error } = await supabase.from('date_cards').insert({
      id: cardId,
      couple_id: profile.couple_id,
      created_by: user.id,
      mode: mode ?? 'feeling',
      input_json: JSON.parse(input ?? '{}'),
      source: 'ai',
      status: 'active',
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
    setSavedIds(prev => ({ ...prev, [i]: cardId }));
    return cardId;
  }

  // 보내기 전에 선택 카드를 저장해 id 를 확보하고, 그 id 로 공유 화면을 연다.
  async function handleSendToPartner() {
    setSending(true);
    try {
      const cardId = await saveCard(selectedIndex);
      if (cardId) router.push({ pathname: '/share/send', params: { cardId } } as any);
    } catch {
      Alert.alert(t('modeFlow.result.sendErrorTitle'), t('modeFlow.result.sendError'));
    } finally {
      setSending(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const cardId = await saveCard(selectedIndex);
      if (!cardId) return;
      setSaved(true);
    } catch {
      setErrorMsg(t('modeFlow.result.saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (errorMsg !== '' && cards.length === 0) {
    return (
      <SafeAreaView style={s2.errWrap}>
        <View style={s2.errIcon}>
          <Sparkles size={44} strokeWidth={1.5} color={C.textSub} />
        </View>
        <Text style={s2.errTitle}>{t('modeFlow.result.errorTitle')}</Text>
        <Text style={s2.errSub}>{t('modeFlow.result.errorSub')}</Text>
        <BigButton onPress={regenerate} style={s2.errRetryBtn}>{t('modeFlow.result.retry')}</BigButton>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView contentContainerStyle={s2.content} showsVerticalScrollIndicator={false}>
        <BackBar />

        <View style={s2.badgeRow}>
          <Badge tone="pink">{t('modeFlow.result.aiBadge')}</Badge>
          <Badge>{t('modeFlow.result.nowBadge')}</Badge>
        </View>

        <Text style={[s2.heading, s2.headingGap]}>{t('modeFlow.result.heading')}</Text>
        <Text style={s2.subText}>{t('modeFlow.result.sub')}</Text>

        {cards.map((card, i) => {
          const style = getCardStyle(card.tags);
          const isFeatured = i === selectedIndex;
          return isFeatured ? (
            /* 메인 카드 — 저장은 명시적으로 '저장/보내기' 버튼에서만. 탭으로 저장하지 않는다. */
            <View key={i} style={s2.featuredCard}>
              <View style={[s2.featuredBanner, { backgroundColor: style.bg }]}>
                {i === 0 && (
                  <View style={s2.bannerBadge}>
                    <Badge tone="pink">{t('modeFlow.result.bestBadge')}</Badge>
                  </View>
                )}
                <View style={[s2.featuredIcon, s2.featuredIconBg]}>
                  <style.Icon size={36} strokeWidth={1.5} color={style.fg} />
                </View>
              </View>
              <View style={s2.featuredBody}>
                {!!card.tags?.length && (
                  <Text style={s2.featuredCategory}>{card.tags.slice(0, 2).join(' · ').toUpperCase()}</Text>
                )}
                <Text style={s2.featuredTitle}>{card.title}</Text>
                <Text style={s2.featuredDesc}>{card.summary}</Text>

                {!!card.place_name && (
                  <PlaceRow name={card.place_name} address={card.place_address} url={card.map_url} style={s2.placeRowGap} />
                )}

                <View style={s2.metaGrid}>
                  <View style={s2.metaBox}>
                    <Clock size={14} color={C.creamFg} />
                    <Text style={s2.metaLabel}>{t('modeFlow.result.time')}</Text>
                    <Text style={s2.metaValue}>{card.estimated_time}</Text>
                  </View>
                  <View style={s2.metaBox}>
                    <Wallet size={14} color={C.creamFg} />
                    <Text style={s2.metaLabel}>{t('modeFlow.result.budget')}</Text>
                    <Text style={s2.metaValue}>{card.estimated_budget}</Text>
                  </View>
                  <View style={s2.metaBox}>
                    <MapPin size={14} color={C.creamFg} />
                    <Text style={s2.metaLabel}>{t('modeFlow.result.movement')}</Text>
                    <Text style={s2.metaValue}>{t('modeFlow.result.walk')}</Text>
                  </View>
                </View>

                <View style={s2.chips}>
                  {(card.tags ?? []).slice(0, 4).map((t) => <Chip key={t} tone="gray">{t}</Chip>)}
                </View>

                <View style={s2.whyBox}>
                  <Sparkles size={14} color={C.creamFg} />
                  <Text style={s2.whyText}>{card.why_recommended}</Text>
                </View>

                <View style={s2.actionRow}>
                  <TouchableOpacity
                    style={s2.sendBtn}
                    onPress={handleSendToPartner}
                    disabled={sending}
                  >
                    {sending ? <ActivityIndicator size="small" color={C.white} /> : <Send size={14} color={C.white} />}
                    <Text style={s2.sendBtnText}>{t('modeFlow.result.send')}</Text>
                  </TouchableOpacity>
                  {!saved && (
                    <TouchableOpacity style={s2.bookmarkBtn} onPress={handleSave} disabled={saving}>
                      {saving
                        ? <ActivityIndicator size="small" color={C.pinkDeep} />
                        : <>
                            <Bookmark size={14} color={C.pinkDeep} />
                            <Text style={s2.bookmarkBtnText}>{t('modeFlow.result.save')}</Text>
                          </>}
                    </TouchableOpacity>
                  )}
                </View>
                {saved && (
                  <TouchableOpacity
                    style={s2.goBtn}
                    onPress={() => router.replace('/(tabs)/candidates' as any)}
                  >
                    <Text style={s2.goBtnText}>{t('modeFlow.result.goCandidates')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={s2.retryBtn}
                  onPress={regenerate}
                >
                  <RefreshCw size={12} color={C.textSub} />
                  <Text style={s2.retryBtnText}>{t('modeFlow.result.retryRecommend')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* 서브 카드 — 탭하면 저장 없이 그 카드를 크게(선택) 본다 */
            <SoftCard key={i} style={s2.subCardGap} onPress={() => setSelectedIndex(i)}>
              <View style={s2.subRow}>
                <View style={[s2.subIcon, { backgroundColor: style.bg }]}>
                  <style.Icon size={26} strokeWidth={1.5} color={style.fg} />
                </View>
                <View style={s2.subBody}>
                  <Text style={s2.subTitle}>{card.title}</Text>
                  <Text style={s2.subDesc} numberOfLines={2}>{card.summary}</Text>
                  <View style={s2.subMetaRow}>
                    <View style={s2.subMetaItem}>
                      <Clock size={11} color={C.textMuted} />
                      <Text style={s2.subMeta}>{card.estimated_time}</Text>
                    </View>
                    <View style={s2.subMetaItem}>
                      <Wallet size={11} color={C.textMuted} />
                      <Text style={s2.subMeta}>{card.estimated_budget}</Text>
                    </View>
                    {!!card.place_name && (
                      <View style={s2.subMetaPlace}>
                        <MapPin size={11} color={C.pinkDeep} />
                        <Text style={[s2.subMeta, s2.subMetaPink]} numberOfLines={1}>{card.place_name}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <ChevronRight size={16} color={C.textFaint} />
              </View>
            </SoftCard>
          );
        })}

        <View style={s2.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s2 = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  headingGap: { marginTop: 12 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8, marginBottom: 4 },
  featuredCard: {
    marginTop: 20,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.shadow,
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
  bannerBadge: { position: 'absolute', top: 16, left: 16 },
  featuredIconBg: { backgroundColor: C.white },
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
    backgroundColor: C.bg, gap: 4,
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
  whyText: { fontSize: 12, color: C.grayFg, lineHeight: 19, flex: 1 },
  placeRowGap: { marginTop: 12 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
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
  subCardGap: { marginTop: 12 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subBody: { flex: 1 },
  subIcon: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  subTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  subDesc: { fontSize: 12, color: C.textSub, lineHeight: 17, marginTop: 2 },
  subMetaRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  subMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  subMetaPlace: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  subMeta: { fontSize: 11, color: C.textMuted },
  subMetaPink: { color: C.pinkDeep },
  bottomSpacer: { height: 40 },
  errWrap: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errIcon: { width: 120, height: 120, borderRadius: 60, backgroundColor: C.gray, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  errRetryBtn: { marginTop: 24 },
  errTitle: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' },
  errSub: { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginTop: 12 },
});
