import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Plus, Heart, Plane, Check } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { SoftCard, Chip, Badge, SwipeableCard } from '../../components/ui';
import { generateDateCards, getUserPreferences } from '../../lib/ai';
import type { FeelingInput } from '../../lib/ai';
import { useI18n } from '../../lib/i18n';
import { getCardStyle } from '../../lib/tagStyle';

type ReactionType = 'love' | 'like' | 'burden' | 'next_time';
type ConditionTag = 'change_place' | 'closer' | 'indoor' | 'budget_adjust';

type CardWithReactions = {
  id: string; title: string; summary: string;
  estimated_time: string; estimated_budget: string;
  tags: string[]; mode: string; source: string; created_at: string;
  myReaction: ReactionType | null; partnerReaction: ReactionType | null;
  myConditionTag: ConditionTag | null; partnerConditionTag: ConditionTag | null;
};
type BucketItem = {
  id: string; item: string; status: string;
  user_id: string; created_at: string;
  myReaction: 'love' | 'next_time' | null;
  partnerReaction: 'love' | 'next_time' | null;
};
type FilterTab = 'all' | 'both' | 'conditional' | 'nextTime' | 'bucket';

export default function CandidatesScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const CONDITION_LABEL: Record<ConditionTag, string> = {
    change_place: t('candidates.conditionLabels.change_place'),
    closer: t('candidates.conditionLabels.closer'),
    indoor: t('candidates.conditionLabels.indoor'),
    budget_adjust: t('candidates.conditionLabels.budget_adjust'),
  };
  const RX_LABEL: Record<ReactionType, string> = {
    love: t('candidates.rxLabel.love'),
    like: t('candidates.rxLabel.like'),
    burden: t('candidates.rxLabel.burden'),
    next_time: t('candidates.rxLabel.next_time'),
  };
  const FILTER_LABEL: Record<FilterTab, string> = {
    all: t('candidates.filterAll'),
    both: t('candidates.filterBoth'),
    conditional: t('candidates.filterConditional'),
    nextTime: t('candidates.filterNextTime'),
    bucket: t('candidates.filterBucket'),
  };
  const [cards, setCards] = useState<CardWithReactions[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const [bucketItems, setBucketItems] = useState<BucketItem[]>([]);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [pendingProposals, setPendingProposals] = useState<{ cardId: string; title: string }[]>([]);

  const FILTERS: FilterTab[] = ['all', 'both', 'conditional', 'nextTime', 'bucket'];

  useFocusEffect(
    useCallback(() => {
      loadCards();
      loadProposals();
      if (activeFilter === 'bucket') loadBucketItems();
    }, []),
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
      .from('date_cards').select('id, title').in('id', pendingIds);
    setPendingProposals((cardRows ?? []).map(c => ({ cardId: c.id, title: c.title })));
  }

  async function loadCards() {
    setLoading(true);
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

      const { data: cardRows } = await supabase
        .from('date_cards')
        .select('id, title, summary, estimated_time, estimated_budget, tags, mode, source, created_at')
        .eq('couple_id', profile.couple_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (!cardRows?.length) { setCards([]); return; }

      const { data: rxRows } = await supabase
        .from('reactions')
        .select('card_id, user_id, reaction_type, condition_tag')
        .in('card_id', cardRows.map(c => c.id));

      setCards(cardRows.map(card => {
        const rx = rxRows?.filter(r => r.card_id === card.id) ?? [];
        const mine = rx.find(r => r.user_id === user.id);
        const ptnr = rx.find(r => r.user_id !== user.id);
        return {
          ...card,
          myReaction: (mine?.reaction_type as ReactionType) ?? null,
          partnerReaction: (ptnr?.reaction_type as ReactionType) ?? null,
          myConditionTag: (mine?.condition_tag as ConditionTag) ?? null,
          partnerConditionTag: (ptnr?.condition_tag as ConditionTag) ?? null,
        };
      }));
    } finally {
      setLoading(false);
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
        budget: 'medium',
        distance: 'far',
        mood: 'romantic',
        duration: 'full_day',
        avoid: [],
        freeText: bucketItem.item,
      };
      const prefs = await getUserPreferences();
      const cards = await generateDateCards(input, 'next_meet', prefs, 'ko');

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

  function classify(c: CardWithReactions): FilterTab {
    const pos = (r: ReactionType | null) => r === 'love' || r === 'like';
    if (c.myReaction === 'next_time' || c.partnerReaction === 'next_time') return 'nextTime';
    if (pos(c.myReaction) && pos(c.partnerReaction)) return 'both';
    if ((pos(c.myReaction) && c.partnerReaction === 'burden') ||
        (c.myReaction === 'burden' && pos(c.partnerReaction))) return 'conditional';
    return 'all';
  }

  const filtered = activeFilter === 'all'
    ? cards
    : cards.filter(c => classify(c) === activeFilter);

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.flex1}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* 헤더 */}
          <View style={s.headerRow}>
            <View>
              <Text style={s.pageTitle}>{t('candidates.pageTitle')}</Text>
              <Text style={s.countText}>{t('candidates.countText', { count: cards.length })}</Text>
            </View>
            <TouchableOpacity
              style={s.addBtn}
              onPress={() => router.push('/card/new' as any)}
              activeOpacity={0.8}
            >
              <Plus size={14} color={C.pinkDeep} />
              <Text style={s.addBtnText}>{t('candidates.addManual')}</Text>
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
                {FILTER_LABEL[f]}
              </Chip>
            ))}
          </ScrollView>

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
                            <IconComponent size={22} strokeWidth={1.8} color={fg} />
                          </View>
                          <View style={s.flex1}>
                            <View style={s.cardTitleRow}>
                              <Text style={s.cardTitle}>{card.title}</Text>
                              <View style={s.badgeRow}>
                                {card.source === 'manual' && (
                                  <Badge tone="lavender">{t('candidates.addManual')}</Badge>
                                )}
                                <Badge tone={card.myReaction === 'love' && card.partnerReaction === 'love' ? 'pink' : 'gray'}>
                                  {card.myReaction === 'love' && card.partnerReaction === 'love' ? t('candidates.thisDateBadge') : t('candidates.candidateBadge')}
                                </Badge>
                              </View>
                            </View>
                            <View style={s.chips}>
                              {(card.tags ?? []).slice(0, 2).map((tag) => (
                                <Chip key={tag} tone="gray">{tag}</Chip>
                              ))}
                            </View>
                          </View>
                        </View>
                        <View style={s.rxRow}>
                          <View style={s.rxBox}>
                            <Text style={s.rxLabel}>{t('candidates.me')}</Text>
                            <Text style={s.rxValue}>{card.myReaction ? RX_LABEL[card.myReaction] : t('candidates.noReaction')}</Text>
                            {card.myConditionTag && (
                              <Text style={s.rxCondition}>{CONDITION_LABEL[card.myConditionTag]}</Text>
                            )}
                          </View>
                          <View style={s.rxBox}>
                            <Text style={s.rxLabel}>{t('candidates.partner')}</Text>
                            <Text style={s.rxValue}>{card.partnerReaction ? RX_LABEL[card.partnerReaction] : t('candidates.noReaction')}</Text>
                            {card.partnerConditionTag && (
                              <Text style={s.rxCondition}>{CONDITION_LABEL[card.partnerConditionTag]}</Text>
                            )}
                          </View>
                        </View>
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

        {/* FAB */}
        {activeFilter !== 'bucket' && (
          <TouchableOpacity
            style={s.fab}
            onPress={() => router.push({
              pathname: '/mode-flow/feeling',
              params: { mode: 'feeling' },
            } as any)}
            activeOpacity={0.85}
          >
            <Plus size={16} color={C.white} />
            <Text style={s.fabText}>{t('candidates.fabAddFeeling')}</Text>
          </TouchableOpacity>
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
  loader: { marginTop: 60 },
  bgLavender: { backgroundColor: C.lavender },
  bottomSpacer: { height: 100 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: C.text },
  countText: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: C.pinkLight, borderWidth: 1, borderColor: C.pinkBorder,
  },
  addBtnText: { fontSize: 13, fontWeight: '600', color: C.pinkDeep },
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
  badgeRow: { flexDirection: 'row', gap: 4 },
  cardIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.text, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  rxRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  rxBox: { flex: 1, borderRadius: 10, padding: 8, backgroundColor: C.bg },
  rxLabel: { fontSize: 10, color: C.textMuted },
  rxValue: { fontSize: 11, color: C.text, fontWeight: '600', marginTop: 2 },
  rxCondition: { fontSize: 10, color: C.lavenderFg, marginTop: 3, fontWeight: '500' },
  fab: {
    position: 'absolute', right: 20, bottom: 90,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 16, paddingRight: 20, paddingVertical: 12,
    borderRadius: 30, backgroundColor: C.pink,
  },
  fabText: { fontSize: 13, fontWeight: '600', color: C.white },
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
