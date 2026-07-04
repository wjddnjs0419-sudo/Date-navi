import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Camera, Heart, Clock, Wallet, ChevronRight } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { Badge, Chip, SwipeableCard } from '../../components/ui';

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

export default function MemoriesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: mems } = await supabase
        .from('date_memories')
        .select('id, card_id, title, review, want_again, created_at, photo_url')
        .eq('user_id', user.id)
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
        card_title: (m.card_id ? cardMap[m.card_id]?.title : null) ?? m.title ?? '추억',
        card_mode: (m.card_id && cardMap[m.card_id]?.mode) ?? '',
        card_time: (m.card_id && cardMap[m.card_id]?.estimated_time) ?? '',
        card_budget: (m.card_id && cardMap[m.card_id]?.estimated_budget) ?? '',
        card_tags: (m.card_id && cardMap[m.card_id]?.tags) ?? [],
      })));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadMemories(); }, [loadMemories]));

  function confirmDeleteMemory(memoryId: string) {
    Alert.alert('추억 삭제', '이 추억을 삭제할까요? 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          const { data, error } = await supabase.from('date_memories').delete().eq('id', memoryId).select('id');
          if (error) { Alert.alert('오류', '삭제 중 문제가 발생했어요.'); return; }
          if (!data?.length) { Alert.alert('알림', '본인이 남긴 추억만 삭제할 수 있어요.'); return; }
          loadMemories();
        },
      },
    ]);
  }

  const wantAgainCount = items.filter(i => i.want_again).length;

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.flex1}>
        {/* 헤더 */}
        <View style={s.header}>
          <View>
            <Text style={s.pageTitle}>우리 추억</Text>
            <Text style={s.countText}>지금까지 함께한 데이트 {items.length}개</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/card/memory/new')} activeOpacity={0.8}>
            <Camera size={17} color={C.textSub} />
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
            <Text style={s.emptyTitle}>아직 추억이 없어요</Text>
            <Text style={s.emptySub}>
              데이트를 확정하고 후기를 남기면{'\n'}여기에 쌓여요.
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={item => item.id}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                {/* 통계 */}
                <View style={s.statsRow}>
                  {[
                    { label: '함께한 날', value: String(items.length) },
                    { label: '다시 하고싶어', value: String(wantAgainCount) },
                    { label: '이번 달', value: String(items.filter(i => {
                      const d = new Date(i.created_at);
                      const now = new Date();
                      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                    }).length) },
                  ].map((st) => (
                    <View key={st.label} style={s.statBox}>
                      <Text style={s.statValue}>{st.value}</Text>
                      <Text style={s.statLabel}>{st.label}</Text>
                    </View>
                  ))}
                </View>
                {/* "최근 추억" 섹션 레이블 */}
                <View style={s.sectionLabelRow}>
                  <Badge tone="pink">최근 추억</Badge>
                </View>
              </View>
            }
            renderItem={({ item, index }) => (
              <SwipeableCard
                onPress={() => router.push({ pathname: '/card/memory/[id]', params: { id: item.id } } as any)}
                onEdit={() => router.push({ pathname: '/card/memory/edit/[id]', params: { id: item.id } } as any)}
                onDelete={() => confirmDeleteMemory(item.id)}
              >
              <View style={[s.card, index === 0 && s.featuredCard]}>
                {index === 0 ? (
                  /* 최근 추억 — 큰 카드 */
                  <>
                    <View style={s.featuredBanner}>
                      {item.photo_url && (
                        <Image source={{ uri: item.photo_url }} style={s.featuredPhoto} resizeMode="cover" />
                      )}
                      {!item.photo_url && (
                        <View style={[s.featuredIcon, s.bgPinkLight]}>
                          <Heart size={28} strokeWidth={1.5} color={C.pinkDeep} />
                        </View>
                      )}
                      {item.want_again && (
                        <View style={s.wantAgainBadge}>
                          <Heart size={11} color={C.pinkDeep} fill={C.pinkDeep} />
                          <Text style={s.wantAgainText}>다시 하고 싶어</Text>
                        </View>
                      )}
                    </View>
                    <View style={s.featuredBody}>
                      <Text style={s.featuredDate}>{formatDate(item.created_at)}</Text>
                      <Text style={s.cardTitle}>{item.card_title}</Text>
                      {item.review ? (
                        <Text style={s.reviewText}>"{item.review}"</Text>
                      ) : null}
                      {(item.card_time || item.card_budget) ? (
                        <View style={s.metaRow}>
                          {item.card_time ? (
                            <View style={s.metaItem}>
                              <Clock size={11} color={C.textSub} />
                              <Text style={s.metaText}>{item.card_time}</Text>
                            </View>
                          ) : null}
                          {item.card_budget ? (
                            <View style={s.metaItem}>
                              <Wallet size={11} color={C.textSub} />
                              <Text style={s.metaText}>{item.card_budget}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      {item.card_tags.length > 0 ? (
                        <View style={s.chipRow}>
                          {item.card_tags.slice(0, 3).map((t) => (
                            <Chip key={t} tone="gray">{t}</Chip>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </>
                ) : (
                  /* 나머지 추억 — 행 카드 */
                  <View style={s.rowCard}>
                    {item.photo_url ? (
                      <Image source={{ uri: item.photo_url }} style={s.rowIcon} resizeMode="cover" />
                    ) : (
                      <View style={[s.rowIcon, index % 2 === 0 ? s.bgPinkLight : s.bgMint]}>
                        <Heart size={26} strokeWidth={1.5} color={index % 2 === 0 ? C.pinkDeep : C.mintFg} />
                      </View>
                    )}
                    <View style={s.rowContent}>
                      <View style={s.rowTitleRow}>
                        <Text style={s.rowTitle}>{item.card_title}</Text>
                        {item.want_again && (
                          <Heart size={13} color={C.pinkDeep} fill={C.pinkDeep} />
                        )}
                      </View>
                      <Text style={s.rowDate}>{formatDate(item.created_at)}</Text>
                    </View>
                    <ChevronRight size={16} color={C.textFaint} />
                  </View>
                )}
              </View>
              </SwipeableCard>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  bgLavender: { backgroundColor: C.lavender },
  bgPinkLight: { backgroundColor: C.pinkLight },
  bgMint: { backgroundColor: C.mint },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pageTitle: { fontSize: 24, fontWeight: '800', color: C.text },
  countText: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: C.pinkDeep },
  statLabel: { fontSize: 10, color: C.textSub, marginTop: 2 },
  emptyWrap: { alignItems: 'center', marginTop: 60, paddingHorizontal: 24 },
  emptyIcon: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' },
  emptySub: { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginTop: 12 },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: C.white,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  featuredCard: {},
  featuredBanner: {
    height: 160,
    backgroundColor: C.pinkMid,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  featuredPhoto: StyleSheet.absoluteFillObject,
  featuredIcon: {
    width: 64, height: 64, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  wantAgainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wantAgainText: { fontSize: 10, color: C.pinkDeep, fontWeight: '600' },
  sectionLabelRow: { marginBottom: 10 },
  featuredBody: { padding: 16 },
  featuredDate: { fontSize: 11, color: C.textMuted },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 4 },
  reviewText: { fontSize: 13, color: C.grayFg, lineHeight: 20, marginTop: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: C.textSub },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  rowCard: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowIcon: { width: 88, height: 80, alignItems: 'center', justifyContent: 'center', borderRadius: 0, marginLeft: -14, marginTop: -14, marginBottom: -14, marginRight: 14 },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 13, fontWeight: '700', color: C.text },
  rowDate: { fontSize: 11, color: C.textMuted, marginTop: 2 },
});
