import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Heart, Clock, Wallet, RotateCcw } from 'lucide-react-native';
import { C } from '../../../constants/colors';
import { BackBar, Chip, Badge, SoftCard } from '../../../components/ui';

type CardInfo = {
  title: string; summary: string;
  estimated_time: string; estimated_budget: string; tags: string[];
};
type Memory = { id: string; review: string | null; want_again: boolean; created_at: string };

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function MemoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const [{ data: cardRow }, { data: memRows }] = await Promise.all([
          supabase
            .from('date_cards')
            .select('title, summary, estimated_time, estimated_budget, tags')
            .eq('id', id)
            .maybeSingle(),
          supabase
            .from('date_memories')
            .select('id, review, want_again, created_at')
            .eq('card_id', id)
            .order('created_at', { ascending: false }),
        ]);
        if (!active) return;
        if (cardRow) setCard(cardRow);
        setMemories(memRows ?? []);
        setLoading(false);
      })();
      return () => { active = false; };
    }, [id]),
  );

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <BackBar />

        <View style={s.banner}>
          <View style={s.iconWrap}>
            <Heart size={26} strokeWidth={1.5} color={C.pinkDeep} />
          </View>
        </View>

        <Badge tone="pink">우리 추억</Badge>
        <Text style={s.title}>{card?.title ?? '데이트'}</Text>
        {!!card?.summary && <Text style={s.summary}>{card.summary}</Text>}

        <View style={s.metaRow}>
          {!!card?.estimated_time && (
            <View style={s.metaItem}><Clock size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_time}</Text></View>
          )}
          {!!card?.estimated_budget && (
            <View style={s.metaItem}><Wallet size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_budget}</Text></View>
          )}
        </View>

        {!!(card?.tags?.length) && (
          <View style={s.chips}>
            {card.tags.slice(0, 4).map(t => <Chip key={t} tone="gray">{t}</Chip>)}
          </View>
        )}

        <Text style={s.sectionLabel}>남긴 후기</Text>
        {memories.length === 0 ? (
          <Text style={s.empty}>아직 남긴 후기가 없어요.</Text>
        ) : (
          memories.map(m => (
            <SoftCard key={m.id} style={{ marginBottom: 10 }}>
              <View style={s.memHeader}>
                <Text style={s.memDate}>{formatDate(m.created_at)}</Text>
                {m.want_again && (
                  <View style={s.againTag}>
                    <RotateCcw size={11} color={C.pinkDeep} />
                    <Text style={s.againText}>다시 하고 싶어</Text>
                  </View>
                )}
              </View>
              <Text style={s.memText}>{m.review?.trim() || '내용 없음'}</Text>
            </SoftCard>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#FFF8F3', alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  banner: {
    height: 120, borderRadius: 22, marginBottom: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.pinkMid,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: C.white, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: 10, lineHeight: 29 },
  summary: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 6 },
  metaRow: { flexDirection: 'row', gap: 14, marginTop: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: C.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 24, marginBottom: 12 },
  empty: { fontSize: 13, color: C.textSub },
  memHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  memDate: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  againTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.pinkLight, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
  },
  againText: { fontSize: 11, fontWeight: '600', color: C.pinkDeep },
  memText: { fontSize: 13, color: C.text, lineHeight: 20 },
});
