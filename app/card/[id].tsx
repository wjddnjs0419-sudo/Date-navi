import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Clock, Wallet, MessageCircle, Heart, Share2, MapPin, Footprints, House } from 'lucide-react-native';
import { C, SP, R, T } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { localizeCardContent } from '../../lib/card-i18n';
import { isDateModeEnabled } from '../../lib/dateModes';
import { generateDateCards, getUserPreferences } from '../../lib/ai';
import type { FeelingInput } from '../../lib/ai';
import { PlaceRow, CourseStepList, MoreMenu, BackBar, BigButton, Badge, SoftCard, Chip } from '../../components/ui';
import { resolveDisplaySteps, type CourseStep } from '../../lib/course';
import { readRecommendationIdentity, writeRecommendationIdentity } from '../../lib/recommendationIdentity';

type CardDetail = {
  id: string;
  title: string;
  summary: string;
  estimated_time: string;
  estimated_budget: string;
  tags: string[];
  why_recommended: string;
  place_name?: string | null;
  place_address?: string | null;
  map_url?: string | null;
  mode: string;
  created_at: string;
  steps?: CourseStep[] | null;
  // 원본 추천 입력. 조건 재생성 시 location/coords를 보존하려면 필요 (V2 §15).
  input_json?: Partial<FeelingInput> | null;
  requestId?: string;
  sessionId?: string;
  kakaoPlaceId?: string;
};

type ReactionType = 'love' | 'like' | 'burden' | 'next_time';
type ConditionTag = 'change_place' | 'closer' | 'indoor';

// 재탭으로 반응을 해제할지 결정한다 — 같은 반응을 다시 누르면 해제.
export function shouldUnreactOnTap(current: ReactionType | null, tapped: ReactionType): boolean {
  return current === tapped;
}

const REACTIONS: { type: ReactionType; color: string; bg: string }[] = [
  { type: 'love', color: C.danger, bg: C.pinkLight },
  { type: 'like', color: C.creamFg, bg: C.cream },
  { type: 'burden', color: C.coolGray, bg: C.gray },
  { type: 'next_time', color: C.lavenderFg, bg: C.lavender },
];

const CONDITION_ICONS: Record<ConditionTag, typeof MapPin> = {
  change_place: MapPin,
  closer: Footprints,
  indoor: House,
};

// 목업(08_candidate_detail)의 상단 카드 — 장소 + 하트 퀵반응 + 파트너 반응 + 확정 CTA.
// 로직은 화면 본체(handleReact/router.push)를 그대로 위임받아 쓴다.
export function CandidateHeroCard({
  placeName, placeAddress, placeUrl,
  steps,
  myLove, onToggleLove,
  partnerReactionLabel,
  onConfirm,
}: {
  placeName?: string | null;
  placeAddress?: string | null;
  placeUrl?: string | null;
  steps?: CourseStep[];
  myLove: boolean;
  onToggleLove: () => void;
  partnerReactionLabel?: string | null;
  onConfirm: () => void;
}) {
  const { strings: s, t } = useI18n();
  const courseSteps = steps ?? [];
  const showCourse = !placeName && courseSteps.length > 0;
  const showHeroCard = !!placeName || showCourse;
  return (
    <View style={heroS.wrap}>
      {showHeroCard && (
        <SoftCard style={heroS.card}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={s.card.reactionLabels.love.label}
            onPress={onToggleLove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={heroS.loveBtn}
            activeOpacity={0.75}
          >
            <Heart size={18} color={myLove ? C.danger : C.textLight} fill={myLove ? C.danger : 'none'} strokeWidth={2} />
          </TouchableOpacity>
          {!!placeName && (
            <PlaceRow name={placeName} address={placeAddress ?? undefined} url={placeUrl ?? undefined} style={heroS.placeRow} />
          )}
          {showCourse && (
            <View style={heroS.courseWrap}>
              <View style={heroS.courseCountRow}>
                <MapPin size={15} color={C.pinkDeep} strokeWidth={2} />
                <Text style={heroS.courseCount}>{t('card.heroCourseCount', { count: courseSteps.length })}</Text>
              </View>
              <Text style={heroS.courseChain} numberOfLines={1}>
                {courseSteps.map(step => step.label).join(' → ')}
              </Text>
            </View>
          )}
        </SoftCard>
      )}

      <View style={heroS.partnerBubble}>
        <Text style={heroS.partnerText}>{partnerReactionLabel ?? s.card.partnerWaiting}</Text>
      </View>

      <BigButton accessibilityLabel={s.card.confirmButton} onPress={onConfirm}>
        {s.card.confirmButton}
      </BigButton>
    </View>
  );
}
const heroS = StyleSheet.create({
  wrap: { gap: SP.md, marginBottom: SP.xl },
  card: { position: 'relative' },
  loveBtn: {
    position: 'absolute', top: SP.sm, right: SP.sm, zIndex: 1,
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  placeRow: { paddingRight: SP.xxxl },
  courseWrap: { paddingRight: SP.xxxl, gap: SP.xs },
  courseCountRow: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  courseCount: { fontSize: 15, fontWeight: '700', color: C.text },
  courseChain: { fontSize: 13, color: C.textSub },
  partnerBubble: {
    backgroundColor: C.pinkLight,
    borderRadius: R.lg,
    paddingVertical: SP.md,
    paddingHorizontal: SP.lg,
  },
  partnerText: { fontSize: 13, fontWeight: '600', color: C.pinkDeep, textAlign: 'center' },
});

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { strings: s, t, language } = useI18n();
  const alertTitle = s.common.error;
  const CONDITION_TAGS: { tag: ConditionTag; label: string; freeText: string }[] = [
    { tag: 'change_place', label: t('card.conditionTags.change_place.label'), freeText: t('card.conditionTags.change_place.freeText') },
    { tag: 'closer', label: t('card.conditionTags.closer.label'), freeText: t('card.conditionTags.closer.freeText') },
    { tag: 'indoor', label: t('card.conditionTags.indoor.label'), freeText: t('card.conditionTags.indoor.freeText') },
  ];

  const [card, setCard] = useState<CardDetail | null>(null);
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [myConditionTag, setMyConditionTag] = useState<ConditionTag | null>(null);
  const [partnerReaction, setPartnerReaction] = useState<ReactionType | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingAlt, setGeneratingAlt] = useState(false);
  const [memoryDone, setMemoryDone] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          setMyUserId(user.id);

          const { data: profile } = await supabase
            .from('date_planner_profiles')
            .select('couple_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (profile?.couple_id) setCoupleId(profile.couple_id);

          const { data: cardData } = await supabase
            .from('date_cards')
            .select('*')
            .eq('id', id)
            .maybeSingle();

          if (!cardData) return;
          setCard({ ...localizeCardContent(cardData, language), ...readRecommendationIdentity(cardData) });

          const { data: memData } = await supabase
            .from('date_memories')
            .select('id')
            .eq('card_id', id)
            .eq('user_id', user.id)
            .maybeSingle();
          if (memData) setMemoryDone(true);

          const { data: rxData } = await supabase
            .from('reactions')
            .select('user_id, reaction_type, condition_tag')
            .eq('card_id', id);

          if (rxData) {
            const mine = rxData.find(r => r.user_id === user.id);
            const partner = rxData.find(r => r.user_id !== user.id);
            if (mine) {
              setMyReaction(mine.reaction_type as ReactionType);
              // 레거시 데이터(예: 제거된 'budget_adjust')는 CONDITION_TAGS에 없으므로 무시한다.
              if (mine.condition_tag && CONDITION_TAGS.some(c => c.tag === mine.condition_tag)) {
                setMyConditionTag(mine.condition_tag as ConditionTag);
              }
            }
            if (partner) setPartnerReaction(partner.reaction_type as ReactionType);
          }
        } finally {
          setLoading(false);
        }
      })();
    }, [id]),
  );

  async function handleReact(type: ReactionType, condTag?: ConditionTag) {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('reactions')
        .upsert(
          { card_id: id, user_id: myUserId, reaction_type: type, condition_tag: condTag ?? null },
          { onConflict: 'card_id,user_id' },
        );
      if (error) throw error;
      setMyReaction(type);
      setMyConditionTag(condTag ?? null);
    } catch {
      Alert.alert(alertTitle, s.card.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleUnreact() {
    if (saving || !myUserId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('reactions')
        .delete()
        .eq('card_id', id)
        .eq('user_id', myUserId);
      if (error) throw error;
      setMyReaction(null);
      setMyConditionTag(null);
    } catch {
      Alert.alert(alertTitle, s.card.saveError);
    } finally {
      setSaving(false);
    }
  }

  // 같은 반응 재탭 → 해제, 아니면 설정. 하트와 반응 그리드가 공유한다.
  function handleReactionTap(type: ReactionType) {
    if (shouldUnreactOnTap(myReaction, type)) handleUnreact();
    else handleReact(type);
  }

  async function handleGenerateAlt(condTag: ConditionTag) {
    if (!coupleId || !myUserId || !card) return;
    setGeneratingAlt(true);
    try {
      const condInfo = CONDITION_TAGS.find(c => c.tag === condTag);
      // 원본 input_json을 base로 쓰고 조건분만 override → location/coords 보존 (§15).
      // input_json이 없는 구 카드는 기존 하드코딩 base로 폴백(location 없음).
      const base: FeelingInput = card.input_json && typeof card.input_json === 'object'
        ? {
            energy: 'medium', distance: 'any', mood: 'comfortable', duration: '2-3h', avoid: [],
            ...card.input_json,
          }
        : { energy: 'medium', distance: 'any', mood: 'comfortable', duration: '2-3h', avoid: [] };
      const input: FeelingInput = {
        ...base,
        distance: condTag === 'closer' ? 'near' : base.distance,
        avoid: condTag === 'indoor' ? [...new Set([...(base.avoid ?? []), 'outdoor'])] : base.avoid,
        freeText: `${t('card.regeneratePromptPrefix', { title: card.title })}${condInfo?.freeText ?? t('card.regenerateFallbackText')}`,
      };
      const prefs = await getUserPreferences();
      const newCards = await generateDateCards(input, card.mode || 'feeling', prefs, language);
      for (const nc of newCards) {
        await supabase.from('date_cards').insert({
          couple_id: coupleId,
          created_by: myUserId,
          mode: card.mode || 'feeling',
          source: 'ai',
          status: 'active',
          title: nc.title,
          summary: nc.summary,
          estimated_time: nc.estimated_time,
          estimated_budget: nc.estimated_budget,
          tags: nc.tags,
          why_recommended: nc.why_recommended,
          place_name: nc.place_name ?? null,
          place_address: nc.place_address ?? null,
          map_url: nc.map_url ?? null,
          steps: nc.steps ?? null,
          ...writeRecommendationIdentity(nc),
        });
      }
      Alert.alert(
        t('card.regenerateAlertTitle'),
        t('card.regenerateAlertMessage', { label: condInfo?.label }),
        [{ text: t('common.ok') }],
      );
    } catch {
      Alert.alert(alertTitle, s.card.saveError);
    } finally {
      setGeneratingAlt(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('candidates.deleteAlertTitle'), t('candidates.deleteAlertMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('date_cards').delete().eq('id', id);
          if (error) { Alert.alert(alertTitle, t('candidates.deleteAlertError')); return; }
          router.back();
        },
      },
    ]);
  }

  async function handleShare() {
    if (!card) return;
    try {
      await Share.share({ message: `${card.title}\n${card.summary}` });
    } catch {
      // 공유 시트 취소/실패는 무해하므로 별도 처리하지 않는다.
    }
  }

  const partnerInfo = partnerReaction
    ? REACTIONS.find(r => r.type === partnerReaction)
    : null;
  const partnerReactionLabel = partnerInfo
    ? s.card.partnerReaction(s.card.reactionLabels[partnerReaction!].label, s.card.reactionLabels[partnerReaction!].emoji)
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <BackBar />
        <View style={styles.headerActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={s.common.share}
            onPress={handleShare}
            style={styles.iconBtn}
            activeOpacity={0.7}
          >
            <Share2 size={20} color={C.textSub} strokeWidth={2} />
          </TouchableOpacity>
          <MoreMenu
            testID="card-more-menu"
            onEdit={() => router.push(`/card/edit/${id}` as any)}
            onDelete={confirmDelete}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.pink} />
        </View>
      ) : !card ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.missingText}>{s.card.missing}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Badge tone="pink">{s.card.modeLabels[card.mode] ?? card.mode}</Badge>
          <Text style={[T.h1, styles.title]}>{card.title}</Text>

          <CandidateHeroCard
            placeName={card.place_name}
            placeAddress={card.place_address}
            placeUrl={card.map_url}
            steps={resolveDisplaySteps(card)}
            myLove={myReaction === 'love'}
            onToggleLove={() => handleReactionTap('love')}
            partnerReactionLabel={partnerReactionLabel}
            onConfirm={() => router.push({ pathname: '/card/confirm', params: { id } })}
          />

          {card.mode === 'make_course' ? (
            <View style={styles.stepsWrap}>
              <CourseStepList steps={resolveDisplaySteps(card)} summary={card.summary} />
            </View>
          ) : (
            <Text style={styles.summary}>{card.summary}</Text>
          )}

          {(!!card.estimated_time || !!card.estimated_budget) && (
            <View style={styles.metaRow}>
              {!!card.estimated_time && (
                <View style={styles.metaItem}>
                  <Clock size={14} color={C.textSub} strokeWidth={2} />
                  <Text style={styles.metaText}>{card.estimated_time}</Text>
                </View>
              )}
              {!!card.estimated_time && !!card.estimated_budget && <View style={styles.metaDivider} />}
              {!!card.estimated_budget && (
                <View style={styles.metaItem}>
                  <Wallet size={14} color={C.textSub} strokeWidth={2} />
                  <Text style={styles.metaText}>{card.estimated_budget}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.tagRow}>
            {(card.tags ?? []).map((tag, i) => (
              <Chip key={i} tone="gray">{tag}</Chip>
            ))}
          </View>

          <View style={styles.whyBox}>
            <MessageCircle size={15} color={C.pinkDeep} strokeWidth={2} style={styles.whyIcon} />
            <Text style={styles.whyText}>{card.why_recommended}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.reactionTitle}>{s.card.reactionTitle}</Text>
          <Text style={styles.reactionSub}>{s.card.reactionSubtitle}</Text>

          <View style={styles.reactionGrid}>
            {REACTIONS.map(r => {
              const selected = myReaction === r.type;
              return (
                <TouchableOpacity
                  key={r.type}
                  style={[
                    styles.reactionBtn,
                    { backgroundColor: selected ? r.bg : C.gray },
                    selected && styles.reactionBtnSelected,
                    selected && { borderColor: r.color },
                  ]}
                  onPress={() => handleReactionTap(r.type)}
                  disabled={saving}
                  activeOpacity={0.75}
                >
                  <Text style={styles.reactionEmoji}>{s.card.reactionLabels[r.type].emoji}</Text>
                  <Text style={[styles.reactionLabel, selected && styles.reactionLabelSelected, selected && { color: r.color }]}>
                    {s.card.reactionLabels[r.type].label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 조건부 반응 — burden 선택 시 노출 */}
          {myReaction === 'burden' && (
            <View style={styles.conditionBox}>
              <Text style={styles.conditionTitle}>{t('card.conditionSectionTitle')}</Text>
              <Text style={styles.conditionSub}>{t('card.conditionSectionSub')}</Text>
              <View style={styles.conditionGrid}>
                {CONDITION_TAGS.map(c => {
                  const selected = myConditionTag === c.tag;
                  const Icon = CONDITION_ICONS[c.tag];
                  return (
                    <TouchableOpacity
                      key={c.tag}
                      style={[styles.conditionBtn, selected && styles.conditionBtnSelected]}
                      onPress={() => handleReact('burden', selected ? undefined : c.tag)}
                      disabled={saving}
                      activeOpacity={0.75}
                    >
                      <Icon size={14} color={selected ? C.inkSoft : C.textSub} strokeWidth={2} />
                      <Text style={[styles.conditionLabel, selected && styles.conditionLabelSelected]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* 재생성은 카드 모드가 활성일 때만 — 숨긴 모드의 레거시 생성 경로 차단 */}
              {myConditionTag && isDateModeEnabled(card.mode ?? 'feeling') && (
                <TouchableOpacity
                  style={[styles.altBtn, generatingAlt && styles.altBtnBusy]}
                  onPress={() => handleGenerateAlt(myConditionTag)}
                  disabled={generatingAlt}
                  activeOpacity={0.85}
                >
                  {generatingAlt ? (
                    <ActivityIndicator size="small" color={C.coolGrayLight} />
                  ) : (
                    <Text style={styles.altBtnText}>
                      {t('card.regenerateWithCondition', { label: CONDITION_TAGS.find(c => c.tag === myConditionTag)?.label })}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {memoryDone ? (
            <View style={styles.memoryDoneBadge}>
              <Text style={styles.memoryDoneText}>{s.card.memoryDone}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.memoryBtn}
              onPress={() => router.push({ pathname: '/card/review', params: { id } })}
              activeOpacity={0.85}
            >
              <Text style={styles.memoryBtnText}>{s.card.memoryButton}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SP.xl,
    paddingTop: SP.md,
    paddingBottom: SP.sm,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missingText: { color: C.textLight },

  scroll: { flex: 1 },
  content: { padding: SP.xxl, paddingBottom: SP.xxxl * 2 },

  title: { marginTop: SP.sm, marginBottom: SP.lg },
  summary: { fontSize: 15, color: C.textSub, lineHeight: 22, marginBottom: SP.lg },
  stepsWrap: { marginBottom: SP.lg },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SP.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  metaText: { fontSize: 14, color: C.textSub, fontWeight: '500' },
  metaDivider: { width: 1, height: 14, backgroundColor: C.border, marginHorizontal: SP.md },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm, marginBottom: SP.lg },

  whyBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm,
    backgroundColor: C.pinkLight, borderRadius: R.lg, padding: SP.lg, marginBottom: SP.sm,
  },
  whyIcon: { marginTop: 2 },
  whyText: { flex: 1, fontSize: 14, color: C.pinkDeep, lineHeight: 21 },

  divider: { height: 1, backgroundColor: C.borderLight, marginVertical: SP.xxl },

  reactionTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: SP.xs },
  reactionSub: { fontSize: 13, color: C.textMuted, marginBottom: SP.lg },

  reactionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SP.sm,
    marginBottom: SP.xl,
  },
  reactionBtn: {
    width: '47%',
    borderRadius: R.lg,
    paddingVertical: SP.lg,
    alignItems: 'center',
    gap: SP.xs,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  reactionBtnSelected: { borderWidth: 2 },
  reactionEmoji: { fontSize: 28 },
  reactionLabel: { fontSize: 14, color: C.textSub, fontWeight: '500' },
  reactionLabelSelected: { fontWeight: '700' },

  conditionBox: {
    backgroundColor: C.gray,
    borderRadius: R.lg,
    padding: SP.lg,
    marginBottom: SP.lg,
  },
  conditionTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: SP.xs },
  conditionSub: { fontSize: 12, color: C.coolGrayLight, marginBottom: SP.md },
  conditionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm, marginBottom: SP.md },
  conditionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SP.xs,
    paddingHorizontal: SP.md, paddingVertical: SP.sm, borderRadius: R.xl,
    backgroundColor: C.white, borderWidth: 1.5, borderColor: 'transparent',
  },
  conditionBtnSelected: { backgroundColor: C.lavender, borderColor: C.coolGray },
  conditionLabel: { fontSize: 13, fontWeight: '500', color: C.textSub },
  conditionLabelSelected: { color: C.inkSoft, fontWeight: '700' },
  altBtn: {
    backgroundColor: C.ink, borderRadius: R.btn,
    paddingVertical: SP.md, alignItems: 'center',
  },
  altBtnBusy: { opacity: 0.6 },
  altBtnText: { fontSize: 13, fontWeight: '700', color: C.white },

  memoryBtn: {
    backgroundColor: C.ink,
    borderRadius: R.btn,
    paddingVertical: SP.lg,
    alignItems: 'center',
  },
  memoryBtnText: { fontSize: 15, fontWeight: '700', color: C.white },
  memoryDoneBadge: {
    backgroundColor: C.mint,
    borderRadius: R.btn,
    paddingVertical: SP.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.mintFg,
  },
  memoryDoneText: { fontSize: 15, fontWeight: '600', color: C.mintFg },
});
