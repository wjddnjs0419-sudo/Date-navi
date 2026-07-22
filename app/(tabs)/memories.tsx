import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Camera, Heart, Calendar, ChevronRight } from 'lucide-react-native';
import { C, SP, R, G } from '../../constants/theme';
import { Badge, Chip, BigButton, SwipeableCard } from '../../components/ui';
import { Illustration } from '../../components/illustration';
import { getCardStyle } from '../../lib/tagStyle';
import { useI18n } from '../../lib/i18n';
import { useRevalidatingLoad } from '../../lib/useRevalidatingLoad';
import { resolveMemoryScope } from '../../lib/memories';

type MemoryItem = {
  id: string; card_id: string | null; title: string | null; review: string;
  want_again: boolean; created_at: string; photo_url: string | null;
  card_title: string; card_mode: string;
  card_time: string; card_budget: string; card_tags: string[];
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function toDateOnly(value?: string | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysSince(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function MemoriesScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [relationshipDays, setRelationshipDays] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'best'>('all');
  // 최초 로드에만 스피너, 이후 재포커스는 기존 목록 유지한 채 조용히 갱신.
  const { loading, begin: beginLoad, end: endLoad } = useRevalidatingLoad();

  const loadMemories = useCallback(async () => {
    beginLoad();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setRelationshipDays(null);
      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id, anniversary_date')
        .eq('user_id', user.id)
        .maybeSingle();

      let startDate = toDateOnly(profile?.anniversary_date);
      if (profile?.couple_id) {
        const { data: coupleRow } = await supabase
          .from('date_planner_couples')
          .select('created_at, owner_user_id')
          .eq('id', profile.couple_id)
          .maybeSingle();

        if (coupleRow?.owner_user_id !== user.id) {
          const { data: ownerProfile } = await supabase
            .from('date_planner_profiles')
            .select('anniversary_date')
            .eq('user_id', coupleRow?.owner_user_id)
            .maybeSingle();

          startDate = toDateOnly(ownerProfile?.anniversary_date) || startDate;
        }

        startDate = startDate || toDateOnly(coupleRow?.created_at);
      }
      setRelationshipDays(daysSince(startDate));

      const scope = resolveMemoryScope(profile?.couple_id, user.id);
      const { data: mems } = await supabase
        .from('date_memories')
        .select('id, card_id, title, review, want_again, created_at, photo_url')
        .eq(scope.column, scope.value)
        .order('created_at', { ascending: false });

      if (!mems?.length) { setItems([]); return; }

      const cardIds = mems.map(m => m.card_id).filter((cid): cid is string => !!cid);
      const { data: cards } = cardIds.length
        ? await supabase
          .from('date_cards')
          .select('id, title, mode, estimated_time, estimated_budget, tags')
          .in('id', cardIds)
        : { data: [] };

      const cardMap: Record<string, { title: string; mode: string; estimated_time: string; estimated_budget: string; tags: string[] }> = {};
      (cards ?? []).forEach(c => {
        cardMap[c.id] = { title: c.title, mode: c.mode, estimated_time: c.estimated_time ?? '', estimated_budget: c.estimated_budget ?? '', tags: c.tags ?? [] };
      });

      setItems(mems.map(m => ({
        ...m,
        card_title: (m.card_id ? cardMap[m.card_id]?.title : null) ?? m.title ?? t('memories.untitled'),
        card_mode: (m.card_id && cardMap[m.card_id]?.mode) ?? '',
        card_time: (m.card_id && cardMap[m.card_id]?.estimated_time) ?? '',
        card_budget: (m.card_id && cardMap[m.card_id]?.estimated_budget) ?? '',
        card_tags: (m.card_id && cardMap[m.card_id]?.tags) ?? [],
      })));
    } finally {
      endLoad();
    }
  }, [t, beginLoad, endLoad]);

  useFocusEffect(useCallback(() => { loadMemories(); }, [loadMemories]));

  function confirmDeleteMemory(memoryId: string) {
    Alert.alert(t('memories.deleteAlertTitle'), t('memories.deleteAlertMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          const { data, error } = await supabase.from('date_memories').delete().eq('id', memoryId).select('id');
          if (error) { Alert.alert(t('common.error'), t('memories.deleteAlertError')); return; }
          if (!data?.length) { Alert.alert(t('common.notice'), t('memories.deleteAlertForbidden')); return; }
          loadMemories();
        },
      },
    ]);
  }

  const wantAgainCount = items.filter(i => i.want_again).length;
  const thisMonthCount = items.filter(i => {
    const d = new Date(i.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const stats = [
    { label: t('memories.statDaysTogether'), value: relationshipDays !== null ? String(relationshipDays) : '—' },
    { label: t('memories.statWantAgain'), value: String(wantAgainCount) },
    { label: t('memories.statThisMonth'), value: String(thisMonthCount) },
  ];

  const filteredItems = activeFilter === 'best' ? items.filter((i) => i.want_again) : items;

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.flex1}>
        {/* 헤더 */}
        <View style={s.header}>
          <View style={s.flex1}>
            <Text style={s.pageTitle}>{t('memories.pageTitle')}</Text>
            <Text style={s.subtitle}>{t('memories.subtitle')}</Text>
          </View>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => router.push('/card/memory/new')}
            activeOpacity={0.8}
            accessibilityLabel={t('memories.recordCta')}
          >
            <Camera size={18} color={C.textSub} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={G.center}>
            <ActivityIndicator size="large" color={C.pink} />
          </View>
        ) : items.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={[s.emptyIcon, s.bgLavender]}>
              <Heart size={44} strokeWidth={1.5} color={C.lavenderFg} />
            </View>
            <Text style={s.emptyTitle}>{t('memories.emptyStateTitle')}</Text>
            <Text style={s.emptySub}>{t('memories.emptyStateSub')}</Text>
            <BigButton onPress={() => router.push('/card/memory/new')} style={s.emptyCta}>
              {t('memories.recordCta')}
            </BigButton>
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={item => item.id}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <>
                <View style={s.statsCard}>
                  <View style={s.statsHeartTile}>
                    <Heart size={22} color={C.pinkDeep} fill={C.pinkDeep} />
                  </View>
                  <View style={s.statsCols}>
                    {stats.map((st) => (
                      <View key={st.label} style={s.statBox}>
                        <Text style={s.statValue}>{st.value}</Text>
                        <Text style={s.statLabel}>{st.label}</Text>
                      </View>
                    ))}
                  </View>
                  <Illustration name="mascot-heart-couple" width={48} style={s.statsMascot} />
                </View>
                <View style={s.tabBar}>
                  {(['all', 'best'] as const).map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      testID={`memories-tab-${tab}`}
                      onPress={() => setActiveFilter(tab)}
                      style={[s.tabBtn, activeFilter === tab && s.tabBtnActive]}
                      activeOpacity={0.85}
                    >
                      <Text style={[s.tabBtnText, activeFilter === tab && s.tabBtnTextActive]}>
                        {t(tab === 'all' ? 'memories.filterAll' : 'memories.filterBest')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            }
            ListEmptyComponent={
              <View style={s.filterEmptyWrap}>
                <Heart size={32} strokeWidth={1.5} color={C.textFaint} />
                <Text style={s.filterEmptyText}>{t('memories.emptyBest')}</Text>
              </View>
            }
            ListFooterComponent={
              <TouchableOpacity
                style={s.banner}
                onPress={() => router.push('/card/memory/new')}
                activeOpacity={0.9}
              >
                <View style={s.bannerText}>
                  <Text style={s.bannerTitle}>{t('memories.bannerTitle')}</Text>
                  <Text style={s.bannerSub}>{t('memories.bannerSub')}</Text>
                </View>
                <View style={s.bannerCta}>
                  <Text style={s.bannerCtaText}>{t('memories.recordCta')}</Text>
                </View>
              </TouchableOpacity>
            }
            renderItem={({ item, index }) => {
              const { Icon, bg, fg } = getCardStyle(item.card_tags);
              return (
                <SwipeableCard
                  onPress={() => router.push({ pathname: '/card/memory/[id]', params: { id: item.id } } as any)}
                  onEdit={() => router.push({ pathname: '/card/memory/edit/[id]', params: { id: item.id } } as any)}
                  onDelete={() => confirmDeleteMemory(item.id)}
                >
                  <View style={s.card}>
                    {item.photo_url ? (
                      <Image source={{ uri: item.photo_url }} style={s.thumb} resizeMode="cover" />
                    ) : (
                      <View style={[s.thumb, s.thumbTile, { backgroundColor: bg }]}>
                        <Icon size={30} strokeWidth={1.7} color={fg} />
                      </View>
                    )}
                    <View style={s.cardBody}>
                      {index === 0 && (
                        <View style={s.todayBadgeRow}>
                          <Badge tone="pink">{t('memories.todayBadge')}</Badge>
                        </View>
                      )}
                      <Text style={s.cardTitle} numberOfLines={1}>{item.card_title}</Text>
                      <View style={s.dateRow}>
                        <Calendar size={12} color={C.textSub} strokeWidth={2} />
                        <Text style={s.dateText}>{formatDate(item.created_at)}</Text>
                      </View>
                      {!!item.review && (
                        <Text style={s.reviewText} numberOfLines={2}>“{item.review}”</Text>
                      )}
                      {item.card_tags.length > 0 && (
                        <View style={s.chipRow}>
                          {item.card_tags.slice(0, 3).map((tag) => (
                            <Chip key={tag} tone="gray">{`#${tag}`}</Chip>
                          ))}
                        </View>
                      )}
                    </View>
                    <View style={s.heartWrap}>
                      {item.want_again
                        ? <Heart size={18} color={C.pinkDeep} fill={C.pinkDeep} />
                        : <ChevronRight size={18} color={C.textFaint} strokeWidth={2} />}
                    </View>
                  </View>
                </SwipeableCard>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  bgLavender: { backgroundColor: C.lavender },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SP.xl,
    paddingTop: SP.lg,
    paddingBottom: SP.sm,
    gap: SP.md,
  },
  pageTitle: { fontSize: 24, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 13, color: C.textSub, marginTop: SP.xs },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },

  emptyWrap: { alignItems: 'center', marginTop: 60, paddingHorizontal: SP.xxl },
  emptyIcon: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: 'center', justifyContent: 'center', marginBottom: SP.xxl,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' },
  emptySub: { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginTop: SP.md },
  emptyCta: { marginTop: SP.xxl },

  // 필터 탭(베스트) 결과가 0건일 때 리스트 본문에 보여주는 인라인 빈 상태.
  filterEmptyWrap: { alignItems: 'center', paddingVertical: SP.xxl },
  filterEmptyText: { fontSize: 13, color: C.textSub, marginTop: SP.md },

  list: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: 40, gap: SP.md },

  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.md,
    backgroundColor: C.pinkLight,
    borderRadius: R.card,
    paddingVertical: SP.lg,
    paddingHorizontal: SP.lg,
    marginBottom: SP.lg,
  },
  statsHeartTile: {
    width: 48, height: 48, borderRadius: R.sm,
    backgroundColor: C.white, alignItems: 'center', justifyContent: 'center',
  },
  statsCols: { flex: 1, flexDirection: 'row' },
  statBox: { flex: 1 },
  statValue: { fontSize: 20, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 10, color: C.textSub, marginTop: 2 },
  statsMascot: { marginLeft: SP.xs },

  tabBar: { flexDirection: 'row', gap: SP.sm, marginBottom: SP.lg },
  tabBtn: {
    flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: R.btn, borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  tabBtnActive: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  tabBtnTextActive: { color: C.pinkDeep, fontWeight: '700' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.md,
    backgroundColor: C.white,
    borderRadius: R.card,
    padding: SP.md,
    borderWidth: 1,
    borderColor: C.borderLight,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 3,
  },
  thumb: { width: 92, height: 92, borderRadius: R.sm },
  thumbTile: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0 },
  todayBadgeRow: { flexDirection: 'row', marginBottom: SP.xs },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: SP.xs, marginTop: SP.xs },
  dateText: { fontSize: 12, color: C.textSub },
  reviewText: { fontSize: 12, color: C.grayFg, lineHeight: 18, marginTop: SP.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, marginTop: SP.sm },
  heartWrap: { alignSelf: 'flex-start', paddingTop: SP.xs },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.md,
    backgroundColor: C.pinkLight,
    borderRadius: R.card,
    paddingVertical: SP.lg,
    paddingHorizontal: SP.lg,
    marginTop: SP.xs,
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: C.pinkDeep },
  bannerSub: { fontSize: 12, color: C.textSub, marginTop: 2 },
  bannerCta: {
    backgroundColor: C.pink,
    borderRadius: R.btn,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
  },
  bannerCtaText: { fontSize: 13, fontWeight: '700', color: C.white },
});
