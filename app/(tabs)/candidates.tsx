import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Plus, Heart, Plane, Check, Sparkles } from 'lucide-react-native';
import { C, SP, R, G } from '../../constants/theme';
import { SoftCard, Chip, Badge, SwipeableCard, MetaChipRow, SortDropdown } from '../../components/ui';
import { generateDateCards, getUserPreferences } from '../../lib/ai';
import type { FeelingInput } from '../../lib/ai';
import { useI18n } from '../../lib/i18n';
import { useRevalidatingLoad } from '../../lib/useRevalidatingLoad';
import { DATE_MODE_ROUTES, isDateModeEnabled } from '../../lib/dateModes';
import { localizeCardContent } from '../../lib/card-i18n';
import { getCardStyle } from '../../lib/tagStyle';
import { writeRecommendationIdentity } from '../../lib/recommendationIdentity';

type ReactionType = 'love' | 'like' | 'burden' | 'next_time';
type ConditionTag = 'change_place' | 'closer' | 'indoor';

export type CardWithReactions = {
  id: string; title: string; summary: string;
  estimated_time: string; estimated_budget: string;
  tags: string[]; mode: string; source: string; created_at: string;
  created_by: string;
  myReaction: ReactionType | null; partnerReaction: ReactionType | null;
  myConditionTag: ConditionTag | null; partnerConditionTag: ConditionTag | null;
};
type BucketItem = {
  id: string; item: string; status: string;
  user_id: string; created_at: string;
  myReaction: 'love' | 'next_time' | null;
  partnerReaction: 'love' | 'next_time' | null;
};
export type FilterTab = 'all' | 'mutual' | 'mine' | 'partner' | 'bucket';
export type SortOrder = 'newest' | 'oldest';

const POSITIVE_REACTIONS: ReactionType[] = ['love', 'like'];
const isPositive = (r: ReactionType | null) => !!r && POSITIVE_REACTIONS.includes(r);

// 필터 탭 매칭. 'mine'/'partner'는 직접 추가한(source=manual) 카드에만 적용된다 —
// AI 카드는 특정 파트너가 "저장"한 게 아니라 둘을 위해 생성된 카드라 대상이 아니다.
export function matchesFilter(c: CardWithReactions, f: FilterTab, myId: string): boolean {
  if (f === 'all') return true;
  if (f === 'mutual') return isPositive(c.myReaction) && isPositive(c.partnerReaction);
  if (f === 'mine') return c.source === 'manual' && c.created_by === myId;
  if (f === 'partner') return c.source === 'manual' && c.created_by !== myId;
  return false; // bucket은 별도 상태(bucketItems)로 처리됨
}

// 카드 상단 배지에 쓰이는 단일 상태. matchesFilter와 동일한 우선순위(mutual 우선)를 따른다.
export function cardBadgeStatus(c: CardWithReactions, myId: string): 'mutual' | 'mine' | 'partner' | 'undecided' {
  if (isPositive(c.myReaction) && isPositive(c.partnerReaction)) return 'mutual';
  if (c.source === 'manual') return c.created_by === myId ? 'mine' : 'partner';
  return 'undecided';
}

export function sortCards(list: CardWithReactions[], order: SortOrder): CardWithReactions[] {
  const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return order === 'oldest' ? sorted : sorted.reverse();
}

export default function CandidatesScreen() {
  const router = useRouter();
  const { t, language } = useI18n();
  const CONDITION_LABEL: Record<ConditionTag, string> = {
    change_place: t('candidates.conditionLabels.change_place'),
    closer: t('candidates.conditionLabels.closer'),
    indoor: t('candidates.conditionLabels.indoor'),
  };
  const FILTER_LABEL: Record<FilterTab, string> = {
    all: t('candidates.filterAll'),
    mutual: t('candidates.filterMutual'),
    mine: t('candidates.filterMine'),
    partner: t('candidates.filterPartner'),
    bucket: t('candidates.filterBucket'),
  };
  const [cards, setCards] = useState<CardWithReactions[]>([]);
  // 최초 로드에만 스피너, 이후 재포커스는 기존 목록 유지한 채 조용히 갱신.
  const { loading, begin: beginLoad, end: endLoad } = useRevalidatingLoad();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const [bucketItems, setBucketItems] = useState<BucketItem[]>([]);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [pendingProposals, setPendingProposals] = useState<{ cardId: string; title: string }[]>([]);

  // bucket 필터는 next_meet 모드 진입점이므로 모드 활성 여부에 연동해 숨긴다.
  const FILTERS: FilterTab[] = isDateModeEnabled('next_meet')
    ? ['all', 'mutual', 'mine', 'partner', 'bucket']
    : ['all', 'mutual', 'mine', 'partner'];

  useFocusEffect(
    useCallback(() => {
      loadCards();
      loadProposals();
      if (activeFilter === 'bucket') loadBucketItems();
      // 탭 화면은 계속 마운트되어 있으므로 언어가 바뀌면 카드 텍스트를 다시 골라야 한다.
    }, [language]),
  );

  // 상대가 보낸(card_id 가 연결된) 제안 중, 내가 아직 반응하지 않은 것만 추린다.
  async function loadProposals() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from('date_planner_profiles').select('couple_id').eq('user_id', user.id).maybeSingle();
    if (!profile?.couple_id) { setPendingProposals([]); return; }

    const { data: msgs } = await supabase
      .from('soft_messages')
      .select('card_id')
      .eq('couple_id', profile.couple_id)
      .neq('user_id', user.id)
      .not('card_id', 'is', null)
      .order('created_at', { ascending: false });

    const cardIds = [...new Set((msgs ?? []).map(m => m.card_id as string))];
    if (!cardIds.length) { setPendingProposals([]); return; }

    const { data: myRx } = await supabase
      .from('reactions').select('card_id').eq('user_id', user.id).in('card_id', cardIds);
    const reacted = new Set((myRx ?? []).map(r => r.card_id));
    const pendingIds = cardIds.filter(id => !reacted.has(id));
    if (!pendingIds.length) { setPendingProposals([]); return; }

    const { data: cardRows } = await supabase
      .from('date_cards').select('id, title, content_i18n').in('id', pendingIds);
    setPendingProposals((cardRows ?? []).map(c => ({ cardId: c.id, title: localizeCardContent(c, language).title })));
  }

  async function loadCards() {
    beginLoad();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.couple_id) { setCards([]); return; }
      setCoupleId(profile.couple_id);

      const { data: rawCardRows } = await supabase
        .from('date_cards')
        .select('id, title, summary, estimated_time, estimated_budget, tags, mode, source, created_by, created_at, content_i18n')
        .eq('couple_id', profile.couple_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      const cardRows = rawCardRows?.map((card) => localizeCardContent(card, language));
      if (!cardRows?.length) { setCards([]); return; }

      const { data: rxRows } = await supabase
        .from('reactions')
        .select('card_id, user_id, reaction_type, condition_tag')
        .in('card_id', cardRows.map(c => c.id));

      setCards(cardRows.map(card => {
        const rx = rxRows?.filter(r => r.card_id === card.id) ?? [];
        const mine = rx.find(r => r.user_id === user.id);
        const ptnr = rx.find(r => r.user_id !== user.id);
        // 레거시 데이터(예: 제거된 'budget_adjust')는 CONDITION_LABEL에 없으므로 무시한다.
        const validTag = (tag?: string | null): ConditionTag | null =>
          tag && tag in CONDITION_LABEL ? (tag as ConditionTag) : null;
        return {
          ...card,
          myReaction: (mine?.reaction_type as ReactionType) ?? null,
          partnerReaction: (ptnr?.reaction_type as ReactionType) ?? null,
          myConditionTag: validTag(mine?.condition_tag),
          partnerConditionTag: validTag(ptnr?.condition_tag),
        };
      }));
    } finally {
      endLoad();
    }
  }

  async function loadBucketItems() {
    setBucketLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.couple_id) { setBucketItems([]); return; }

      const { data: rows } = await supabase
        .from('bucket_list')
        .select('id, item, status, user_id, created_at')
        .eq('couple_id', profile.couple_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!rows?.length) { setBucketItems([]); return; }

      const { data: rxRows } = await supabase
        .from('bucket_reactions')
        .select('bucket_id, user_id, reaction_type')
        .in('bucket_id', rows.map(r => r.id));

      setBucketItems(rows.map(row => {
        const rx = rxRows?.filter(r => r.bucket_id === row.id) ?? [];
        const mine = rx.find(r => r.user_id === user.id);
        const ptnr = rx.find(r => r.user_id !== user.id);
        return {
          ...row,
          myReaction: (mine?.reaction_type as 'love' | 'next_time') ?? null,
          partnerReaction: (ptnr?.reaction_type as 'love' | 'next_time') ?? null,
        };
      }));
    } finally {
      setBucketLoading(false);
    }
  }

  async function handleBucketReact(bucketId: string, reaction: 'love' | 'next_time') {
    if (!currentUserId) return;
    const { error } = await supabase.from('bucket_reactions').upsert(
      { bucket_id: bucketId, user_id: currentUserId, reaction_type: reaction },
      { onConflict: 'bucket_id,user_id' },
    );
    if (!error) await loadBucketItems();
  }

  async function handleConfirm(bucketItem: BucketItem) {
    if (!coupleId || !currentUserId) return;
    setConfirmingId(bucketItem.id);
    try {
      const input: FeelingInput = {
        energy: 'high',
        distance: 'far',
        mood: 'romantic',
        duration: 'full_day',
        avoid: [],
        freeText: bucketItem.item,
      };
      const prefs = await getUserPreferences();
      const cards = await generateDateCards(input, 'next_meet', prefs, language);

      for (const card of cards) {
        await supabase.from('date_cards').insert({
          couple_id: coupleId,
          created_by: currentUserId,
          mode: 'next_meet',
          source: 'ai',
          status: 'active',
          title: card.title,
          summary: card.summary,
          estimated_time: card.estimated_time,
          estimated_budget: card.estimated_budget,
          tags: card.tags,
          why_recommended: card.why_recommended,
          ...writeRecommendationIdentity(card),
        });
      }

      await supabase
        .from('bucket_list')
        .update({ status: 'confirmed' })
        .eq('id', bucketItem.id);

      Alert.alert(
        t('candidates.confirmAlertTitle'),
        t('candidates.confirmAlertMessage'),
        [{ text: t('common.ok'), onPress: () => { setActiveFilter('all'); loadCards(); } }],
      );
    } catch {
      Alert.alert(t('common.error'), t('candidates.confirmAlertError'));
    } finally {
      setConfirmingId(null);
    }
  }

  function handleFilterChange(f: FilterTab) {
    setActiveFilter(f);
    if (f === 'bucket') loadBucketItems();
  }

  function confirmDelete(cardId: string) {
    Alert.alert(t('candidates.deleteAlertTitle'), t('candidates.deleteAlertMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('date_cards').delete().eq('id', cardId);
          if (error) { Alert.alert(t('common.error'), t('candidates.deleteAlertError')); return; }
          loadCards();
        },
      },
    ]);
  }

  // 카드의 실제 나/상대 반응을 하나의 친근한 상태 문구로 요약한다. (목업의 "서로 좋아요를 눌렀어요!")
  function reactionStatus(c: CardWithReactions): { key: string; icon: 'spark' | 'heart'; color: string } {
    const pos = (r: ReactionType | null) => r === 'love' || r === 'like';
    const me = c.myReaction, ptnr = c.partnerReaction;
    if (me === 'next_time' || ptnr === 'next_time') return { key: 'statusNextTime', icon: 'heart', color: C.lavenderFg };
    if (pos(me) && pos(ptnr)) return { key: 'statusMutual', icon: 'spark', color: C.pinkDeep };
    if ((pos(me) && ptnr === 'burden') || (me === 'burden' && pos(ptnr))) return { key: 'statusConditional', icon: 'heart', color: C.creamFg };
    if (pos(me)) return { key: 'statusMineOnly', icon: 'heart', color: C.pinkDeep };
    if (pos(ptnr)) return { key: 'statusPartnerOnly', icon: 'heart', color: C.pinkDeep };
    return { key: 'statusNone', icon: 'heart', color: C.textMuted };
  }

  // 필터 칩 옆 개수. all/bucket 외에는 matchesFilter 결과로 센다.
  function filterCount(f: FilterTab): number {
    if (f === 'all') return cards.length;
    if (f === 'bucket') return bucketItems.length;
    return cards.filter(c => matchesFilter(c, f, currentUserId ?? '')).length;
  }

  const filtered = sortCards(
    activeFilter === 'all' ? cards : cards.filter(c => matchesFilter(c, activeFilter, currentUserId ?? '')),
    sortOrder,
  );

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.flex1}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* 헤더 */}
          <View style={s.headerRow}>
            <View style={s.flex1}>
              <Text style={s.pageTitle}>{t('candidates.pageTitle')}</Text>
              <Text style={s.countText}>{t('candidates.countText', { count: cards.length })}</Text>
            </View>
            <TouchableOpacity
              style={s.addPill}
              onPress={() => router.push(DATE_MODE_ROUTES.make_course as any)}
              activeOpacity={0.85}
            >
              <Plus size={16} color={C.pinkDeep} strokeWidth={2.4} />
              <Text style={s.addPillText}>{t('candidates.fabAddCourse')}</Text>
            </TouchableOpacity>
          </View>

          {/* 필터 */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.filterScroll}
            contentContainerStyle={s.filterContent}
          >
            {FILTERS.map((f) => (
              <Chip
                key={f}
                selected={activeFilter === f}
                tone={f === 'bucket' ? 'lavender' : 'pink'}
                onPress={() => handleFilterChange(f)}
              >
                {`${FILTER_LABEL[f]}  ${filterCount(f)}`}
              </Chip>
            ))}
          </ScrollView>

          {activeFilter !== 'bucket' && (
            <View style={s.sortRow}>
              <SortDropdown
                value={sortOrder}
                options={[
                  { value: 'newest' as SortOrder, label: t('candidates.sortNewest') },
                  { value: 'oldest' as SortOrder, label: t('candidates.sortOldest') },
                ]}
                onChange={setSortOrder}
                testID="candidates-sort-dropdown"
              />
            </View>
          )}

          {/* 상대가 보낸 제안 */}
          {activeFilter !== 'bucket' && pendingProposals.length > 0 && (
            <TouchableOpacity
              style={s.proposalBanner}
              activeOpacity={0.85}
              onPress={() => router.push({
                pathname: '/share/reaction',
                params: { cardId: pendingProposals[0].cardId },
              } as any)}
            >
              <View style={s.flex1}>
                <Text style={s.proposalTitle}>{t('candidates.proposalTitle', { count: pendingProposals.length })}</Text>
                <Text style={s.proposalSub} numberOfLines={1}>{t('candidates.proposalSub', { title: pendingProposals[0].title })}</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* 버킷리스트 탭 */}
          {activeFilter === 'bucket' ? (
            <BucketSection
              loading={bucketLoading}
              items={bucketItems}
              confirmingId={confirmingId}
              onReact={handleBucketReact}
              onConfirm={handleConfirm}
              onAdd={() => router.push('/mode-flow/bucketlist' as any)}
            />
          ) : (
            <>
              {loading ? (
                <ActivityIndicator color={C.pink} style={s.loader} />
              ) : filtered.length === 0 ? (
                <View style={s.emptyWrap}>
                  <View style={[s.emptyIcon, s.bgLavender]}>
                    <Heart size={44} strokeWidth={1.5} color={C.lavenderFg} />
                  </View>
                  <Text style={s.emptyTitle}>{t('candidates.emptyStateTitle')}</Text>
                  <Text style={s.emptySub}>{t('candidates.emptyStateSub')}</Text>
                </View>
              ) : (
                <View style={s.cardList}>
                  {filtered.map((card) => {
                    const { Icon: IconComponent, bg, fg } = getCardStyle(card.tags);
                    const badgeStatus = cardBadgeStatus(card, currentUserId ?? '');
                    const status = reactionStatus(card);
                    const StatusIcon = status.icon === 'spark' ? Sparkles : Heart;
                    const conditions = [card.myConditionTag, card.partnerConditionTag]
                      .filter((c): c is ConditionTag => c != null);
                    const BADGE_TONE_BY_STATUS = { mutual: 'pink', mine: 'blue', partner: 'orange', undecided: 'gray' } as const;
                    return (
                      <SwipeableCard
                        key={card.id}
                        onPress={() => router.push(`/card/${card.id}` as any)}
                        onEdit={() => router.push(`/card/edit/${card.id}` as any)}
                        onDelete={() => confirmDelete(card.id)}
                      >
                      <SoftCard>
                        <View style={s.cardRow}>
                          <View style={[s.cardIcon, { backgroundColor: bg }]}>
                            <IconComponent size={24} strokeWidth={1.8} color={fg} />
                          </View>
                          <View style={s.flex1}>
                            <View style={s.cardTitleRow}>
                              <Text style={s.cardTitle}>{card.title}</Text>
                              <Badge tone={BADGE_TONE_BY_STATUS[badgeStatus]}>
                                {t(`candidates.badge${badgeStatus.charAt(0).toUpperCase()}${badgeStatus.slice(1)}`)}
                              </Badge>
                            </View>
                            <View style={s.chips}>
                              {(card.tags ?? []).slice(0, 3).map((tag, tagIndex) => (
                                <Chip key={`${card.id}-${tag}-${tagIndex}`} tone="gray">{tag}</Chip>
                              ))}
                            </View>
                          </View>
                        </View>

                        {!!card.summary && (
                          <Text style={s.cardSummary} numberOfLines={2}>{card.summary}</Text>
                        )}

                        {!!card.estimated_time && (
                          <View style={s.metaWrap}>
                            <MetaChipRow items={[{ icon: 'clock', label: card.estimated_time }]} />
                          </View>
                        )}

                        <View style={s.cardDivider} />

                        <View style={s.statusRow}>
                          <StatusIcon size={15} strokeWidth={2} color={status.color} />
                          <Text style={[s.statusText, { color: status.color }]}>
                            {t(`candidates.${status.key}`)}
                          </Text>
                        </View>
                        {conditions.length > 0 && (
                          <Text style={s.conditionLine}>
                            {conditions.map(c => CONDITION_LABEL[c]).join('  ·  ')}
                          </Text>
                        )}
                      </SoftCard>
                      </SwipeableCard>
                    );
                  })}
                </View>
              )}
            </>
          )}

          <View style={s.bottomSpacer} />
        </ScrollView>

        {/* 하단 고정 코스 확정 배너 — '둘 다 끌림' 필터로 이동해 확정 후보를 모아 본다. */}
        {activeFilter !== 'bucket' && !loading && cards.length > 0 && (
          <View style={s.confirmBanner}>
            <View style={s.confirmBannerIcon}>
              <Heart size={20} color={C.white} fill={C.white} strokeWidth={0} />
            </View>
            <View style={s.flex1}>
              <Text style={s.confirmBannerTitle}>{t('candidates.confirmBannerTitle')}</Text>
              <Text style={s.confirmBannerSub} numberOfLines={1}>{t('candidates.confirmBannerSub')}</Text>
            </View>
            <TouchableOpacity
              style={s.confirmBannerCta}
              onPress={() => handleFilterChange('mutual')}
              activeOpacity={0.85}
            >
              <Text style={s.confirmBannerCtaText}>{t('candidates.confirmBannerCta')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

type BucketSectionProps = {
  loading: boolean;
  items: BucketItem[];
  confirmingId: string | null;
  onReact: (id: string, r: 'love' | 'next_time') => void;
  onConfirm: (item: BucketItem) => void;
  onAdd: () => void;
};

function BucketSection({ loading, items, confirmingId, onReact, onConfirm, onAdd }: BucketSectionProps) {
  const { t } = useI18n();
  if (loading) return <ActivityIndicator color={C.lavenderFg} style={s.loader} />;

  if (items.length === 0) {
    return (
      <View style={s.emptyWrap}>
        <View style={[s.emptyIcon, s.bgLavender]}>
          <Plane size={44} strokeWidth={1.5} color={C.lavenderFg} />
        </View>
        <Text style={s.emptyTitle}>{t('candidates.bucketEmptyTitle')}</Text>
        <Text style={s.emptySub}>{t('candidates.bucketEmptySub')}</Text>
        <TouchableOpacity style={s.addBucketBtn} onPress={onAdd} activeOpacity={0.8}>
          <Plus size={14} color={C.white} />
          <Text style={s.addBucketBtnText}>{t('candidates.bucketAddIdea')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.bucketWrap}>
      <View style={s.bucketHeader}>
        <Text style={s.bucketHeaderText}>{t('candidates.bucketHeaderCount', { count: items.length })}</Text>
        <TouchableOpacity onPress={onAdd} activeOpacity={0.8} style={s.bucketAddSmall}>
          <Plus size={12} color={C.lavenderFg} />
          <Text style={s.bucketAddSmallText}>{t('candidates.bucketAddSmall')}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.bucketList}>
        {items.map((item) => {
          const confirming = confirmingId === item.id;
          const bothLove = item.myReaction === 'love' && item.partnerReaction === 'love';
          return (
            <SoftCard key={item.id}>
              <View style={s.bucketItemHeader}>
                <View style={[s.bucketIcon, s.bgLavender]}>
                  <Plane size={18} strokeWidth={1.8} color={C.lavenderFg} />
                </View>
                <Text style={s.bucketItemText}>{item.item}</Text>
              </View>

              {/* 반응 버튼 */}
              <View style={s.bucketRxRow}>
                <Text style={s.bucketRxLabel}>{t('candidates.bucketMyReactionLabel')}</Text>
                <View style={s.bucketRxBtns}>
                  <TouchableOpacity
                    style={[s.bucketRxBtn, item.myReaction === 'love' && s.bucketRxBtnActive]}
                    onPress={() => onReact(item.id, 'love')}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.bucketRxBtnText, item.myReaction === 'love' && s.bucketRxBtnTextActive]}>
                      {t('candidates.bucketRxLove')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.bucketRxBtn, item.myReaction === 'next_time' && s.bucketRxBtnNext]}
                    onPress={() => onReact(item.id, 'next_time')}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.bucketRxBtnText, item.myReaction === 'next_time' && s.bucketRxBtnTextNext]}>
                      {t('candidates.bucketRxNext')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 상대 반응 */}
              {item.partnerReaction && (
                <View style={s.partnerRxRow}>
                  <Text style={s.partnerRxText}>
                    {t('candidates.bucketPartnerReaction', {
                      label: item.partnerReaction === 'love' ? t('candidates.bucketRxLove') : t('candidates.bucketRxNext'),
                    })}
                  </Text>
                </View>
              )}

              {/* 만남 확정 버튼 */}
              {(item.myReaction === 'love' || bothLove) && (
                <TouchableOpacity
                  style={[s.confirmBtn, confirming && s.confirmBtnBusy]}
                  onPress={() => onConfirm(item)}
                  activeOpacity={0.85}
                  disabled={confirming}
                >
                  {confirming ? (
                    <ActivityIndicator size="small" color={C.white} />
                  ) : (
                    <>
                      <Check size={14} color={C.white} strokeWidth={2.5} />
                      <Text style={s.confirmBtnText}>
                        {bothLove ? t('candidates.confirmBothLove') : t('candidates.confirmSingle')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </SoftCard>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  filterScroll: { marginTop: 16 },
  filterContent: { gap: 8, paddingRight: 4 },
  sortRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  loader: { marginTop: 60 },
  bgLavender: { backgroundColor: C.lavender },
  bottomSpacer: { height: 100 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: C.text },
  countText: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  emptyWrap: { alignItems: 'center', marginTop: 60, paddingHorizontal: 24 },
  emptyIcon: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' },
  emptySub: { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginTop: 12 },
  addBucketBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 20, backgroundColor: C.lavenderFg,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20,
  },
  addBucketBtnText: { color: C.white, fontSize: 14, fontWeight: '600' },
  cardList: { marginTop: 16, gap: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, flex: 1, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, marginTop: SP.sm },
  cardSummary: { fontSize: 13, color: C.textSub, lineHeight: 19, marginTop: SP.md },
  metaWrap: { marginTop: SP.md },
  cardDivider: { height: 1, backgroundColor: C.borderLight, marginVertical: SP.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  statusText: { fontSize: 13, fontWeight: '600', flex: 1 },
  conditionLine: { fontSize: 11, color: C.lavenderFg, fontWeight: '500', marginTop: SP.xs, marginLeft: SP.xl + SP.xs },
  addPill: {
    flexDirection: 'row', alignItems: 'center', gap: SP.xs,
    paddingLeft: SP.md, paddingRight: SP.lg, paddingVertical: SP.sm,
    borderRadius: R.xl, backgroundColor: C.pinkLight,
    borderWidth: 1, borderColor: C.pinkBorder,
  },
  addPillText: { fontSize: 13, fontWeight: '700', color: C.pinkDeep },
  confirmBanner: {
    position: 'absolute', left: SP.xl, right: SP.xl, bottom: SP.xl,
    flexDirection: 'row', alignItems: 'center', gap: SP.md,
    paddingVertical: SP.md, paddingHorizontal: SP.md,
    borderRadius: R.card, backgroundColor: C.pinkLight,
    borderWidth: 1, borderColor: C.pinkBorder,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 10, elevation: 4,
  },
  confirmBannerIcon: {
    width: 40, height: 40, borderRadius: R.md,
    backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  confirmBannerTitle: { fontSize: 14, fontWeight: '700', color: C.pinkDeep },
  confirmBannerSub: { fontSize: 11, color: C.textSub, marginTop: 2 },
  confirmBannerCta: {
    backgroundColor: C.pink, borderRadius: R.btn,
    paddingHorizontal: SP.md, paddingVertical: SP.sm, flexShrink: 0,
  },
  confirmBannerCtaText: { fontSize: 13, fontWeight: '700', color: C.white },
  proposalBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 16, padding: 14, borderRadius: 16,
    backgroundColor: C.pinkLight, borderWidth: 1, borderColor: C.pinkBorder,
  },
  proposalTitle: { fontSize: 14, fontWeight: '700', color: C.pinkDeep },
  proposalSub: { fontSize: 12, color: C.textSub, marginTop: 3 },
  // Bucket
  bucketWrap: { marginTop: 16 },
  bucketList: { gap: 12 },
  bucketRxBtns: { flexDirection: 'row', gap: 8 },
  bucketHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  bucketHeaderText: { fontSize: 13, fontWeight: '600', color: C.lavenderFg },
  bucketAddSmall: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.lavender, paddingHorizontal: 10,
    paddingVertical: 5, borderRadius: 14,
  },
  bucketAddSmallText: { fontSize: 12, fontWeight: '600', color: C.lavenderFg },
  bucketItemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  bucketIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bucketItemText: { fontSize: 14, fontWeight: '600', color: C.text, flex: 1, lineHeight: 21, paddingTop: 10 },
  bucketRxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  bucketRxLabel: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
  bucketRxBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: C.gray, borderWidth: 1, borderColor: 'transparent',
  },
  bucketRxBtnActive: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  bucketRxBtnNext: { backgroundColor: C.cream, borderColor: C.creamFg + '40' },
  bucketRxBtnText: { fontSize: 12, fontWeight: '600', color: C.textSub },
  bucketRxBtnTextActive: { color: C.pinkDeep },
  bucketRxBtnTextNext: { color: C.creamFg },
  partnerRxRow: {
    backgroundColor: C.lavender, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10,
  },
  partnerRxText: { fontSize: 12, color: C.lavenderFg, fontWeight: '500' },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 4, backgroundColor: C.lavenderFg,
    borderRadius: 14, paddingVertical: 12,
  },
  confirmBtnBusy: { opacity: 0.6 },
  confirmBtnText: { color: C.white, fontSize: 13, fontWeight: '700' },
});
