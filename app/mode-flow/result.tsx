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
} from '../../components/iconography';
import { C } from '../../constants/colors';
import { DS, G, SP } from '../../constants/theme';
import { Header, ScreenHeading, BigButton, Badge, Chip, SoftCard, PlaceRow } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { getCardStyle } from '../../lib/tagStyle';
import { writeRecommendationIdentity } from '../../lib/recommendationIdentity';
import { openPlaceInBrowser } from '../../lib/placeBrowser';

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
    if (!profile?.couple_id) { Alert.alert(t('common.coupleRequired')); return null; }

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
      ...writeRecommendationIdentity(card),
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
    <SafeAreaView style={G.screen} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('modeFlow.result.aiBadge')} />
      <ScrollView contentContainerStyle={s2.content} showsVerticalScrollIndicator={false}>
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
                  <PlaceRow
                    name={card.place_name}
                    address={card.place_address}
                    url={card.map_url}
                    onPress={card.map_url ? () => void openPlaceInBrowser({ kakaoPlaceId: '', mapUrl: card.map_url, name: card.place_name, address: card.place_address }) : undefined}
                    style={s2.placeRowGap}
                  />
                )}

                <View style={s2.metaGrid}>
                  {!!card.estimated_time && (
                    <View style={s2.metaBox}>
                      <Clock size={14} color={C.creamFg} />
                      <Text style={s2.metaLabel}>{t('modeFlow.result.time')}</Text>
                      <Text style={s2.metaValue}>{card.estimated_time}</Text>
                    </View>
                  )}
                  {!!card.estimated_budget && (
                    <View style={s2.metaBox}>
                      <Wallet size={14} color={C.creamFg} />
                      <Text style={s2.metaLabel}>{t('modeFlow.result.budget')}</Text>
                      <Text style={s2.metaValue}>{card.estimated_budget}</Text>
                    </View>
                  )}
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
                    activeOpacity={0.88}
                  >
                    {sending ? <ActivityIndicator size="small" color={C.white} /> : <Send size={14} color={C.white} />}
                    <Text style={s2.sendBtnText}>{t('modeFlow.result.send')}</Text>
                  </TouchableOpacity>
                  {!saved && (
                    <TouchableOpacity style={s2.bookmarkBtn} onPress={handleSave} disabled={saving} activeOpacity={0.88}>
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
                    activeOpacity={0.88}
                  >
                    <Text style={s2.goBtnText}>{t('modeFlow.result.goCandidates')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={s2.retryBtn}
                  onPress={regenerate}
                  activeOpacity={0.88}
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
                    {!!card.estimated_time && (
                      <View style={s2.subMetaItem}>
                        <Clock size={11} color={C.textMuted} />
                        <Text style={s2.subMeta}>{card.estimated_time}</Text>
                      </View>
                    )}
                    {!!card.estimated_budget && (
                      <View style={s2.subMetaItem}>
                        <Wallet size={11} color={C.textMuted} />
                        <Text style={s2.subMeta}>{card.estimated_budget}</Text>
                      </View>
                    )}
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
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.hero },
  heading: { ...DS.typography.headingLegacy, color: C.text },
  headingGap: { marginTop: SP.md },
  badgeRow: { flexDirection: 'row', gap: SP.xs, marginTop: SP.md },
  subText: { ...DS.typography.bodyCompact, color: C.textSub, marginTop: SP.sm, marginBottom: SP.xs },
  featuredCard: {
    marginTop: SP.xxl,
    borderRadius: DS.radius.card,
    overflow: 'hidden',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  featuredBanner: {
    height: 160,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: SP.screen,
  },
  bannerBadge: { position: 'absolute', top: SP.lg, left: SP.lg },
  featuredIconBg: { backgroundColor: C.white },
  featuredIcon: {
    width: 80, height: 80, borderRadius: DS.radius.chip,
    alignItems: 'center', justifyContent: 'center',
  },
  featuredBody: { padding: SP.screen },
  featuredCategory: { ...DS.typography.caption, color: C.textMuted, letterSpacing: DS.component.featuredCategoryLetterSpacing },
  featuredTitle: { ...DS.typography.sectionTitle, color: C.text, marginTop: SP.xs },
  featuredDesc: { ...DS.typography.bodyCompact, color: C.textSub, marginTop: SP.xs },
  metaGrid: { flexDirection: 'row', gap: SP.sm, marginTop: SP.lg },
  metaBox: {
    flex: 1, borderRadius: DS.radius.input, padding: SP.md,
    backgroundColor: C.bg, gap: SP.xs,
  },
  metaLabel: { ...DS.typography.micro, color: C.textMuted, marginTop: SP.xs },
  metaValue: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, marginTop: SP.lg },
  whyBox: {
    flexDirection: 'row',
    gap: SP.sm,
    borderRadius: DS.radius.input,
    padding: SP.md,
    backgroundColor: C.cream,
    marginTop: SP.lg,
    alignItems: 'flex-start',
  },
  whyText: { ...DS.typography.bodySmall, color: C.grayFg, flex: 1 },
  placeRowGap: { marginTop: SP.md },
  actionRow: { flexDirection: 'row', gap: SP.sm, marginTop: SP.lg },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SP.xs,
    borderRadius: DS.radius.input,
    minHeight: DS.spacing.touch,
    paddingVertical: SP.md,
    backgroundColor: C.pink,
  },
  sendBtnText: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.white },
  bookmarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.xs,
    borderRadius: DS.radius.input,
    minHeight: DS.spacing.touch,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.pinkBorder,
  },
  bookmarkBtnText: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.pinkDeep },
  goBtn: { alignItems: 'center', marginTop: SP.md },
  goBtnText: { ...DS.typography.bodyCompact, color: C.pinkDeep, fontWeight: '600' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.xs, minHeight: DS.spacing.touch, paddingVertical: SP.sm },
  retryBtnText: { ...DS.typography.bodySmall, color: C.textSub },
  subCardGap: { marginTop: SP.md },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: SP.md },
  subBody: { flex: 1 },
  subIcon: { width: 64, height: 64, borderRadius: DS.radius.input, alignItems: 'center', justifyContent: 'center' },
  subTitle: { ...DS.typography.body, fontWeight: '700', color: C.text },
  subDesc: { ...DS.typography.bodySmall, color: C.textSub, marginTop: SP.micro },
  subMetaRow: { flexDirection: 'row', gap: SP.md, marginTop: SP.xs },
  subMetaItem: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  subMetaPlace: { flexDirection: 'row', alignItems: 'center', gap: SP.xs, flexShrink: 1 },
  subMeta: { ...DS.typography.caption, color: C.textMuted },
  subMetaPink: { color: C.pinkDeep },
  bottomSpacer: { height: SP.xxl },
  errWrap: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: SP.section },
  errIcon: { width: 120, height: 120, borderRadius: DS.radius.full, backgroundColor: C.gray, alignItems: 'center', justifyContent: 'center', marginBottom: SP.xxl },
  errRetryBtn: { marginTop: SP.xxl },
  errTitle: { ...DS.typography.headingLegacy, color: C.text, textAlign: 'center' },
  errSub: { ...DS.typography.bodyCompact, color: C.textSub, textAlign: 'center', marginTop: SP.md },
});
