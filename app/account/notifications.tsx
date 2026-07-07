import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Heart, Sparkles, Mail, BellOff, ChevronRight, X } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, ListGroup, ListRow, SectionLabel } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { relativeTime } from '../../lib/time';

type NotifType = 'reaction' | 'new_card' | 'soft_message';
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
  const [selected, setSelected] = useState<Notif | null>(null);
  const [copied, setCopied] = useState(false);

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


  function renderTitle(n: Notif): string {
    if (n.type === 'reaction') return t.reactionTitle;
    if (n.type === 'soft_message') return t.softMessageTitle;
    return t.newCardTitle;
  }

  function renderBody(n: Notif): string {
    if (n.type === 'reaction') {
      const r = strings.candidates.reactionLabels[n.payload?.reaction_type as keyof typeof strings.candidates.reactionLabels];
      const label = r ? `${r.emoji} ${r.label}` : '';
      const card = n.payload?.card_title ?? '';
      return [label, card].filter(Boolean).join(' · ');
    }
    if (n.type === 'soft_message') return n.payload?.message ?? '';
    return n.payload?.card_title ?? '';
  }

  // soft_message는 눌렀을 때 바로 지우지 않고 전체 문장을 모달로 보여준다.
  // 모달을 닫으면(확인 완료로 간주) 그때 삭제한다.
  function handleRowPress(n: Notif) {
    if (n.type === 'soft_message') {
      setSelected(n);
      return;
    }
    removeOne(n.id);
  }

  function closeModal() {
    if (selected) removeOne(selected.id);
    setSelected(null);
    setCopied(false);
  }

  function copySelectedMessage() {
    if (!selected) return;
    Clipboard.setString(selected.payload?.message ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    <SafeAreaView style={G.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.headerRow}>
          <BackBar />
          <TouchableOpacity onPress={clearAll} disabled={unreadCount === 0}>
            <Text style={[s.clearBtn, unreadCount === 0 && s.clearBtnDisabled]}>{t.clearAll}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.titleWrap}>
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
            <View key={group.label} style={s.groupSection}>
              <SectionLabel>{group.label}</SectionLabel>
              <ListGroup>
                {group.items.map((n, i) => {
                  return (
                    <ListRow
                      key={n.id}
                      divider={i < group.items.length - 1}
                      onPress={() => handleRowPress(n)}
                      icon={
                        <View style={[s.iconBox, { backgroundColor: n.type === 'reaction' ? C.pinkLight : C.lavender }]}>
                          {n.type === 'reaction'
                            ? <Heart size={16} strokeWidth={1.8} color={C.pinkDeep} />
                            : n.type === 'soft_message'
                              ? <Mail size={16} strokeWidth={1.8} color={C.lavenderFg} />
                              : <Sparkles size={16} strokeWidth={1.8} color={C.lavenderFg} />}
                        </View>
                      }
                      label={
                        <View style={s.itemTextWrap}>
                          <Text style={s.itemTitle}>{renderTitle(n)}</Text>
                          <Text style={s.itemBody} numberOfLines={2}>{renderBody(n)}</Text>
                          <Text style={s.itemTime}>{relativeTime(n.created_at, {
                            justNow: t.timeJustNow, minutes: t.timeMinutes, hours: t.timeHours,
                            yesterday: t.timeYesterday, days: t.timeDays,
                          })}</Text>
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

        <View style={s.bottomSpacer} />
      </ScrollView>

      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>{t.softMessageTitle}</Text>
              <TouchableOpacity onPress={closeModal} hitSlop={8}>
                <X size={20} color={C.textSub} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalMessage}>{selected?.payload?.message}</Text>
            <BigButton onPress={copySelectedMessage} variant={copied ? 'secondary' : 'primary'} style={s.modalCopyBtn}>
              {copied ? strings.notifications.copiedLabel : t.modalCopyButton}
            </BigButton>
            <TouchableOpacity onPress={closeModal} style={s.modalCloseBtn}>
              <Text style={s.modalCloseText}>{t.modalCloseButton}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearBtn: { fontSize: 12, color: C.textSub, fontWeight: '500' },
  clearBtnDisabled: { color: C.textLight },
  titleWrap: { marginTop: 12 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text },
  count: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  groupSection: { marginTop: 24 },
  itemTextWrap: { flex: 1, paddingRight: 8 },
  bottomSpacer: { height: 40 },
  centerBox: { paddingTop: 80, alignItems: 'center' },
  emptyBox: { paddingTop: 72, alignItems: 'center', paddingHorizontal: 24 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: C.white,
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
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(40,30,25,0.4)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%', maxWidth: 360, backgroundColor: C.white,
    borderRadius: 24, padding: 20,
  },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  modalMessage: { fontSize: 15, color: C.text, lineHeight: 24, marginTop: 16 },
  modalCopyBtn: { marginTop: 20 },
  modalCloseBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  modalCloseText: { fontSize: 13, color: C.textSub, fontWeight: '600' },
});
