import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Heart, Sparkles, BellOff, ChevronRight } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, ListGroup, ListRow, SectionLabel } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';

type NotifType = 'reaction' | 'new_card';
type Notif = {
  id: string;
  type: NotifType;
  payload: Record<string, any>;
  read: boolean;
  created_at: string;
};

export default function NotificationsScreen() {
  const { strings } = useI18n();
  const t = strings.notifications;
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const { data } = await supabase
          .from('notifications')
          .select('id, type, payload, read, created_at')
          .order('created_at', { ascending: false });
        if (active) {
          setItems((data as Notif[]) ?? []);
          setLoading(false);
        }
      })();
      return () => { active = false; };
    }, []),
  );

  async function removeOne(id: string) {
    setItems(prev => prev.filter(n => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  }

  async function clearAll() {
    const ids = items.map(n => n.id);
    if (ids.length === 0) return;
    setItems([]);
    await supabase.from('notifications').delete().in('id', ids);
  }

  function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return t.timeJustNow;
    if (min < 60) return `${min}${t.timeMinutes}`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}${t.timeHours}`;
    const day = Math.floor(hr / 24);
    if (day === 1) return t.timeYesterday;
    return `${day}${t.timeDays}`;
  }

  function renderTitle(n: Notif): string {
    return n.type === 'reaction' ? t.reactionTitle : t.newCardTitle;
  }

  function renderBody(n: Notif): string {
    if (n.type === 'reaction') {
      const r = strings.candidates.reactionLabels[n.payload?.reaction_type as keyof typeof strings.candidates.reactionLabels];
      const label = r ? `${r.emoji} ${r.label}` : '';
      const card = n.payload?.card_title ?? '';
      return [label, card].filter(Boolean).join(' · ');
    }
    return n.payload?.card_title ?? '';
  }

  // 시간 그룹핑: 오늘 / 이번 주 / 이전
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = startOfToday - 6 * 86400000;
  const groups: { label: string; items: Notif[] }[] = [
    { label: t.groupToday, items: [] },
    { label: t.groupWeek, items: [] },
    { label: t.groupEarlier, items: [] },
  ];
  for (const n of items) {
    const ts = new Date(n.created_at).getTime();
    if (ts >= startOfToday) groups[0].items.push(n);
    else if (ts >= weekAgo) groups[1].items.push(n);
    else groups[2].items.push(n);
  }
  const visibleGroups = groups.filter(g => g.items.length > 0);

  const unreadCount = items.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.headerRow}>
          <BackBar />
          <TouchableOpacity onPress={clearAll} disabled={unreadCount === 0}>
            <Text style={[s.clearBtn, unreadCount === 0 && { color: C.textLight }]}>{t.clearAll}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={s.heading}>{t.title}</Text>
          {unreadCount > 0
            ? <Text style={s.count}>{`${unreadCount}${t.unreadSuffix}`}</Text>
            : <Text style={s.count}>{t.allRead}</Text>}
        </View>

        {loading ? (
          <View style={s.centerBox}>
            <ActivityIndicator size="large" color={C.pink} />
          </View>
        ) : unreadCount === 0 ? (
          <View style={s.emptyBox}>
            <View style={s.emptyIcon}>
              <BellOff size={28} strokeWidth={1.6} color={C.textLight} />
            </View>
            <Text style={s.emptyTitle}>{t.emptyTitle}</Text>
            <Text style={s.emptyBody}>{t.emptyBody}</Text>
          </View>
        ) : (
          visibleGroups.map(group => (
            <View key={group.label} style={{ marginTop: 24 }}>
              <SectionLabel>{group.label}</SectionLabel>
              <ListGroup>
                {group.items.map((n, i) => {
                  const isReaction = n.type === 'reaction';
                  return (
                    <ListRow
                      key={n.id}
                      divider={i < group.items.length - 1}
                      onPress={() => removeOne(n.id)}
                      icon={
                        <View style={[s.iconBox, { backgroundColor: isReaction ? C.pinkLight : C.lavender }]}>
                          {isReaction
                            ? <Heart size={16} strokeWidth={1.8} color={C.pinkDeep} />
                            : <Sparkles size={16} strokeWidth={1.8} color={C.lavenderFg} />}
                        </View>
                      }
                      label={
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={s.itemTitle}>{renderTitle(n)}</Text>
                          <Text style={s.itemBody} numberOfLines={2}>{renderBody(n)}</Text>
                          <Text style={s.itemTime}>{relativeTime(n.created_at)}</Text>
                        </View>
                      }
                      trailing={<ChevronRight size={14} color={C.textFaint} />}
                    />
                  );
                })}
              </ListGroup>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearBtn: { fontSize: 12, color: C.textSub, fontWeight: '500' },
  heading: { fontSize: 22, fontWeight: '700', color: C.text },
  count: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  centerBox: { paddingTop: 80, alignItems: 'center' },
  emptyBox: { paddingTop: 72, alignItems: 'center', paddingHorizontal: 24 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: C.border,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  emptyBody: { fontSize: 13, color: C.textSub, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  iconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  itemTitle: { fontSize: 13, fontWeight: '600', color: C.text },
  itemBody: { fontSize: 12, color: C.textSub, lineHeight: 17, marginTop: 2 },
  itemTime: { fontSize: 10, color: C.textLight, marginTop: 4 },
});
