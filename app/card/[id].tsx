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
import { Clock, Wallet, MessageCircle, Share2, Flame, Smile, Meh, Heart } from 'lucide-react-native';
import { C, SP, R, T } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { localizeCardContent } from '../../lib/card-i18n';
import type { FeelingInput } from '../../lib/ai';
import { PlaceRow, CourseStepList, MoreMenu, BackBar, BigButton, Badge, Chip } from '../../components/ui';
import { resolveDisplaySteps, type CourseStep } from '../../lib/course';
import { readRecommendationIdentity } from '../../lib/recommendationIdentity';

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

// 이모지 대신 아이콘 — 알림 본문처럼 텍스트뿐인 자리에서는 이모지를 그대로 쓴다.
export const REACTION_ICONS: Record<ReactionType, typeof Clock> = {
  love: Flame,
  like: Smile,
  burden: Meh,
  next_time: Clock,
};


// 코스 스텝 라벨이 이미 화면에 있는 태그는 같은 말을 두 번 하는 셈이라 감춘다.
export function visibleTags(tags: string[] | null | undefined, steps: CourseStep[]): string[] {
  const norm = (v: string) => v.trim().toLowerCase();
  const stepLabels = new Set(steps.map(step => norm(step.label)));
  return (tags ?? []).filter(tag => !stepLabels.has(norm(tag)));
}

// 목업 08의 제목 줄 하트 — 반응 그리드의 love와 같은 상태를 공유하는 단축 토글이다.
export function CardLoveToggle({
  active, onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  const { strings: s } = useI18n();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={s.card.reactionLabels.love.label}
      accessibilityState={{ selected: active }}
      onPress={onToggle}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={loveS.btn}
      activeOpacity={0.75}
    >
      <Heart size={22} color={active ? C.danger : C.textLight} fill={active ? C.danger : 'none'} strokeWidth={2} />
    </TouchableOpacity>
  );
}
const loveS = StyleSheet.create({
  btn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});

// 파트너 반응 버블 + 확정 CTA. 로직은 화면 본체(router.push)를 그대로 위임받아 쓴다.
export function CandidateActionBar({
  partnerReactionLabel,
  onConfirm,
}: {
  partnerReactionLabel?: string | null;
  onConfirm: () => void;
}) {
  const { strings: s } = useI18n();
  return (
    <View style={heroS.wrap}>
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
  const [card, setCard] = useState<CardDetail | null>(null);
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [partnerReaction, setPartnerReaction] = useState<ReactionType | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [memoryDone, setMemoryDone] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          setMyUserId(user.id);

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
            .select('user_id, reaction_type')
            .eq('card_id', id);

          if (rxData) {
            const mine = rxData.find(r => r.user_id === user.id);
            const partner = rxData.find(r => r.user_id !== user.id);
            if (mine) {
              setMyReaction(mine.reaction_type as ReactionType);
            }
            if (partner) setPartnerReaction(partner.reaction_type as ReactionType);
          }
        } finally {
          setLoading(false);
        }
      })();
    }, [id]),
  );

  // 탭 즉시 칠하고 저장은 뒤에서 처리한다 — 왕복을 기다리면 선택이 한 박자 늦게 보인다.
  // 실패하면 누르기 전 반응으로 되돌린다.
  async function handleReact(type: ReactionType) {
    const previous = myReaction;
    setMyReaction(type);
    try {
      const { error } = await supabase
        .from('reactions')
        .upsert(
          { card_id: id, user_id: myUserId, reaction_type: type },
          { onConflict: 'card_id,user_id' },
        );
      if (error) throw error;
    } catch {
      setMyReaction(previous);
      Alert.alert(alertTitle, s.card.saveError);
    }
  }

  async function handleUnreact() {
    if (!myUserId) return;
    const previous = myReaction;
    setMyReaction(null);
    try {
      const { error } = await supabase
        .from('reactions')
        .delete()
        .eq('card_id', id)
        .eq('user_id', myUserId);
      if (error) throw error;
    } catch {
      setMyReaction(previous);
      Alert.alert(alertTitle, s.card.saveError);
    }
  }

  // 같은 반응 재탭 → 해제, 아니면 설정. 하트와 반응 그리드가 공유한다.
  function handleReactionTap(type: ReactionType) {
    if (shouldUnreactOnTap(myReaction, type)) handleUnreact();
    else handleReact(type);
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
          <View style={styles.titleRow}>
            <Text style={[T.h1, styles.title]}>{card.title}</Text>
            <CardLoveToggle
              active={myReaction === 'love'}
              onToggle={() => handleReactionTap('love')}
            />
          </View>

          {card.mode === 'make_course' ? (
            <View style={styles.stepsWrap}>
              <CourseStepList steps={resolveDisplaySteps(card)} summary={card.summary} />
            </View>
          ) : (
            <Text style={styles.summary}>{card.summary}</Text>
          )}

          {!!card.place_name && (
            <PlaceRow
              name={card.place_name}
              address={card.place_address ?? undefined}
              url={card.map_url ?? undefined}
              style={styles.placeRow}
            />
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

          {(() => {
            // 스텝 라벨과 겹치는 태그를 걸러내면 남는 게 없을 수 있다 — 그때는 빈 여백을 남기지 않는다.
            const tags = visibleTags(card.tags, resolveDisplaySteps(card));
            return tags.length > 0 ? (
              <View style={styles.tagRow}>
                {tags.map((tag, i) => (
                  <Chip key={i} tone="gray">{tag}</Chip>
                ))}
              </View>
            ) : null;
          })()}

          <View style={styles.whyBox}>
            <MessageCircle size={15} color={C.pinkDeep} strokeWidth={2} style={styles.whyIcon} />
            <Text style={styles.whyText}>{card.why_recommended}</Text>
          </View>

          <CandidateActionBar
            partnerReactionLabel={partnerReactionLabel}
            onConfirm={() => router.push({ pathname: '/card/confirm', params: { id } })}
          />

          <View style={styles.divider} />

          <Text style={styles.reactionTitle}>{s.card.reactionTitle}</Text>
          <Text style={styles.reactionSub}>{s.card.reactionSubtitle}</Text>

          <View style={styles.reactionGrid}>
            {REACTIONS.map(r => {
              const selected = myReaction === r.type;
              const ReactionIcon = REACTION_ICONS[r.type];
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
                  activeOpacity={0.75}
                >
                  <ReactionIcon size={26} color={selected ? r.color : C.textSub} strokeWidth={2} />
                  <Text style={[styles.reactionLabel, selected && styles.reactionLabelSelected, selected && { color: r.color }]}>
                    {s.card.reactionLabels[r.type].label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

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

  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm },
  title: { flex: 1, marginTop: SP.sm, marginBottom: SP.lg },
  summary: { fontSize: 15, color: C.textSub, lineHeight: 22, marginBottom: SP.lg },
  stepsWrap: { marginBottom: SP.lg },
  placeRow: { marginBottom: SP.lg },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SP.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  metaText: { fontSize: 14, color: C.textSub, fontWeight: '500' },
  metaDivider: { width: 1, height: 14, backgroundColor: C.border, marginHorizontal: SP.md },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm, marginBottom: SP.lg },

  whyBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm,
    backgroundColor: C.pinkLight, borderRadius: R.lg, padding: SP.lg, marginBottom: SP.lg,
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
  reactionLabel: { fontSize: 14, color: C.textSub, fontWeight: '500' },
  reactionLabelSelected: { fontWeight: '700' },

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
