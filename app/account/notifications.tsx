import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Heart, Mail, BellOff, ChevronRight, X } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { SP, R, T } from '../../constants/theme';
import { BackBar, BigButton, ListGroup, ListRow, SectionLabel } from '../../components/ui';
import { Illustration } from '../../components/illustration';
import { supabase } from '../../lib/supabase';
import { buildPushNavigationTarget, type PushNotificationType } from '../../lib/push';
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
  const router = useRouter();
  const t = strings.notifications;
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Notif | null>(null);

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

  // new_card(데이트 제안)와 legacy soft_message는 문구를 모달로 확인시킨다.
  const isProposal = (n: Notif) => n.type === 'new_card' || n.type === 'soft_message';

  function renderTitle(n: Notif): string {
    if (n.type === 'reaction') return t.reactionTitle;
    return t.proposalTitle;
  }

  function renderBody(n: Notif): string {
    if (n.type === 'reaction') {
      const r = strings.candidates.reactionLabels[n.payload?.reaction_type as keyof typeof strings.candidates.reactionLabels];
      const label = r ? `${r.emoji} ${r.label}` : '';
      const card = n.payload?.card_title ?? '';
      return [label, card].filter(Boolean).join(' · ');
    }
    const card = n.payload?.card_title ?? '';
    return [card, t.tapToView].filter(Boolean).join(' · ');
  }

  // 제안은 눌렀을 때 바로 지우지 않고 카드+문구를 모달로 보여준다.
  // 반응 화면으로 넘어가면(제안 보러가기) 그때 삭제한다. 단순히 닫으면 유지.
  function handleRowPress(n: Notif) {
    if (isProposal(n)) {
      setSelected(n);
      return;
    }
    const target = buildPushNavigationTarget(n.type as PushNotificationType, { card_id: n.payload?.card_id });
    removeOne(n.id);
    router.push(target as any);
  }

  function closeModal() {
    setSelected(null);
  }

  function goToProposal() {
    if (!selected) return;
    const cardId = selected.payload?.card_id;
    removeOne(selected.id);
    setSelected(null);
    if (cardId) router.push({ pathname: '/share/reaction', params: { cardId } } as any);
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
    <View style={s.root}>
      <Illustration name="bg-park" resizeMode="cover" height={340} style={s.bgPark} />
      <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.headerRow}>
          <BackBar />
          <TouchableOpacity onPress={clearAll} disabled={unreadCount === 0}>
            <Text style={[s.clearBtn, unreadCount === 0 && s.clearBtnDisabled]}>{t.clearAll}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.titleWrap}>
          <Text style={T.h1}>{t.title}</Text>
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
                            : <Mail size={16} strokeWidth={1.8} color={C.lavenderFg} />}
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
              <Text style={s.modalTitle}>{t.proposalModalTitle}</Text>
              <TouchableOpacity onPress={closeModal} hitSlop={8}>
                <X size={20} color={C.textSub} />
              </TouchableOpacity>
            </View>
            {!!selected?.payload?.card_title && (
              <View style={s.modalCardChip}>
                <View style={s.modalCardIcon}>
                  <Heart size={16} strokeWidth={1.8} color={C.pinkDeep} />
                </View>
                <Text style={s.modalCardTitle} numberOfLines={2}>{selected.payload.card_title}</Text>
              </View>
            )}
            {!!selected?.payload?.message && (
              <Text style={s.modalMessage}>“{selected.payload.message}”</Text>
            )}
            <BigButton onPress={goToProposal} variant="primary" style={s.modalCopyBtn}>
              {t.proposalCta}
            </BigButton>
            <TouchableOpacity onPress={closeModal} style={s.modalCloseBtn}>
              <Text style={s.modalCloseText}>{t.modalCloseButton}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },
  // connected.tsx / couple-connect.tsx와 동일 패턴: SafeAreaView 밖(root)에 절대위치로
  // 그려야 하단이 진짜 화면 끝까지 붙는다.
  bgPark: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  content: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: SP.xxxl + SP.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearBtn: { fontSize: 12, color: C.textSub, fontWeight: '500' },
  clearBtnDisabled: { color: C.textLight },
  titleWrap: { marginTop: SP.md },
  count: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  groupSection: { marginTop: SP.xxl },
  itemTextWrap: { flex: 1, paddingRight: SP.sm },
  bottomSpacer: { height: 40 },
  centerBox: { paddingTop: 80, alignItems: 'center' },
  emptyBox: { paddingTop: 72, alignItems: 'center', paddingHorizontal: SP.xxl },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center', marginBottom: SP.lg,
    borderWidth: 1, borderColor: C.border,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  emptyBody: { fontSize: 13, color: C.textSub, lineHeight: 19, marginTop: SP.xs + 2, textAlign: 'center' },
  iconBox: {
    width: 36, height: 36, borderRadius: R.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  itemTitle: { fontSize: 13, fontWeight: '600', color: C.text },
  itemBody: { fontSize: 12, color: C.textSub, lineHeight: 17, marginTop: 2 },
  itemTime: { fontSize: 10, color: C.textLight, marginTop: SP.xs },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(40,30,25,0.4)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP.xxl,
  },
  modalCard: {
    width: '100%', maxWidth: 360, backgroundColor: C.white,
    borderRadius: R.hero, padding: SP.xl,
  },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  modalCardChip: {
    flexDirection: 'row', alignItems: 'center', gap: SP.sm + 2,
    backgroundColor: C.bg, borderRadius: R.md, padding: SP.md, marginTop: SP.lg,
  },
  modalCardIcon: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: C.pinkLight,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: C.text },
  modalMessage: { fontSize: 15, color: C.text, lineHeight: 24, marginTop: SP.md + 2, fontStyle: 'italic' },
  modalCopyBtn: { marginTop: SP.xl },
  modalCloseBtn: { alignItems: 'center', paddingVertical: SP.sm + 2, marginTop: SP.xs },
  modalCloseText: { fontSize: 13, color: C.textSub, fontWeight: '600' },
});
