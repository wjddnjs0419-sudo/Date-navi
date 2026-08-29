import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { CalendarHeart } from '../../components/iconography';
import { C, DS, SP, G } from '../../constants/theme';
import { Header, ScreenHeading, SegmentedControl, SoftCard, PlanListRow, BigButton, SectionLabel } from '../../components/ui';
import { formatDateLabel } from '../../components/pickers';
import { DATE_MODE_ROUTES } from '../../lib/dateModes';
import { useI18n } from '../../lib/i18n';
import { useOptionalSafeAreaInsets } from '../../lib/use-optional-safe-area-insets';
import { daysUntilIso } from '../../lib/time';

type PlanCard = {
  id: string;
  title: string;
  tags: string[];
  status: string;
  confirmed_date: string | null;
  confirmed_time: string | null;
  confirmed_place: string | null;
};

export type PlanTab = 'upcoming' | 'coordinating' | 'done';

// soft_messages(제안) + reactions(반응)로 "조율 중"(제안했지만 상대가 아직 반응 안 함) 카드 id 집합을 구한다.
// 같은 카드에 여러 제안이 있으면 그동안 제안한 적 있는 사람 전원을 "제안자"로 취급한다 —
// 그중 누구 하나가 반응해도 조율 중 유지, 그 누구도 아닌 사람이 반응해야만 종료.
export function computeCoordinatingIds(
  proposals: { card_id: string; user_id: string }[],
  reactions: { card_id: string; user_id: string }[],
): Set<string> {
  const proposersByCard = new Map<string, Set<string>>();
  for (const p of proposals) {
    if (!proposersByCard.has(p.card_id)) proposersByCard.set(p.card_id, new Set());
    proposersByCard.get(p.card_id)!.add(p.user_id);
  }

  const result = new Set<string>();
  for (const [cardId, proposers] of proposersByCard) {
    const reactedByNonProposer = reactions.some(r => r.card_id === cardId && !proposers.has(r.user_id));
    if (!reactedByNonProposer) result.add(cardId);
  }
  return result;
}

export function planTabOf(
  card: { id: string; status: string },
  coordinatingIds: Set<string>,
  myReviewedIds: Set<string> = new Set(),
): PlanTab | null {
  // 내가 이미 리뷰한 데이트는 (상대 리뷰 여부와 무관하게) 내 "완료" 탭으로 간다.
  // 상대는 아직 리뷰 전이면 그 카드가 상대의 upcoming에 그대로 남아 리뷰할 수 있다.
  if (myReviewedIds.has(card.id)) return 'done';
  if (card.status === 'done') return 'done';
  if (card.status === 'confirmed') return 'upcoming';
  if (card.status === 'active' && coordinatingIds.has(card.id)) return 'coordinating';
  return null;
}

// PHASE0-BACKMERGE: 확정 데이트를 월(YYYY-MM) 단위로 묶어 목업의 타임라인을 재현한다.
// 날짜 미정(confirmed_date=null) 카드는 마지막 "미정" 그룹으로 모은다.
function groupByMonth(plans: PlanCard[]): { key: string; year: number; month: number; items: PlanCard[] }[] {
  const groups: { key: string; year: number; month: number; items: PlanCard[] }[] = [];
  for (const p of plans) {
    const m = p.confirmed_date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const year = m ? Number(m[1]) : 0;
    const month = m ? Number(m[2]) : 0;
    const key = m ? `${m[1]}-${m[2]}` : 'undated';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(p);
    else groups.push({ key, year, month, items: [p] });
  }
  return groups;
}

export default function PlansScreen() {
  const router = useRouter();
  const { t, language } = useI18n();
  const insets = useOptionalSafeAreaInsets();
  const [plans, setPlans] = useState<PlanCard[]>([]);
  const [coordinatingIds, setCoordinatingIds] = useState<Set<string>>(new Set());
  const [myReviewedIds, setMyReviewedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<PlanTab>('upcoming');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { setPlans([]); return; }

          const { data: profile } = await supabase
            .from('date_planner_profiles')
            .select('couple_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (!profile?.couple_id) { setPlans([]); return; }

          const { data: rows } = await supabase
            .from('date_cards')
            .select('id, title, tags, status, confirmed_date, confirmed_time, confirmed_place')
            .eq('couple_id', profile.couple_id)
            .in('status', ['active', 'confirmed', 'done'])
            .order('confirmed_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false });

          const cardRows: PlanCard[] = (rows ?? []).map((r) => ({ ...r, tags: r.tags ?? [] }));

          const activeIds = cardRows.filter((c) => c.status === 'active').map((c) => c.id);
          let nextCoordinatingIds = new Set<string>();
          if (activeIds.length) {
            const { data: proposals } = await supabase
              .from('soft_messages')
              .select('card_id, user_id')
              .eq('couple_id', profile.couple_id)
              .in('card_id', activeIds)
              .not('card_id', 'is', null);
            if (proposals?.length) {
              const { data: rx } = await supabase
                .from('reactions')
                .select('card_id, user_id')
                .in('card_id', proposals.map((p: { card_id: string }) => p.card_id));
              nextCoordinatingIds = computeCoordinatingIds(proposals, rx ?? []);
            }
          }

          // 내가 이미 리뷰한 데이트는 내 "완료" 탭으로 분류한다(상대는 아직 upcoming에서 리뷰 가능).
          const { data: myMemories } = await supabase
            .from('date_memories')
            .select('card_id')
            .eq('user_id', user.id);
          const reviewedByMe = new Set(
            (myMemories ?? []).map((row) => row.card_id).filter((cardId): cardId is string => !!cardId),
          );

          setPlans(cardRows);
          setCoordinatingIds(nextCoordinatingIds);
          setMyReviewedIds(reviewedByMe);
        } finally {
          setLoading(false);
        }
      })();
    }, []),
  );

  const byTab = useMemo(() => {
    const result: Record<PlanTab, PlanCard[]> = { upcoming: [], coordinating: [], done: [] };
    for (const p of plans) {
      const tab = planTabOf(p, coordinatingIds, myReviewedIds);
      if (tab) result[tab].push(p);
    }
    return result;
  }, [plans, coordinatingIds, myReviewedIds]);

  const groups = useMemo(() => groupByMonth(byTab[activeTab]), [byTab, activeTab]);

  return (
    <SafeAreaView style={G.screen} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('plans.heading')} subtitle={t('plans.subtitle')} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <SegmentedControl
          testID="plans-filter"
          itemTestID={(tab) => `plans-tab-${tab}`}
          options={(['upcoming', 'coordinating', 'done'] as PlanTab[]).map((tab) => ({
            value: tab,
            label: `${t(`plans.tab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`)} ${byTab[tab].length}`,
          }))}
          value={activeTab}
          onChange={setActiveTab}
        />

        {loading ? (
          <ActivityIndicator color={C.pink} style={s.loader} />
        ) : byTab[activeTab].length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <CalendarHeart size={44} strokeWidth={1.5} color={C.pinkDeep} />
            </View>
            <Text style={s.emptyTitle}>
              {activeTab === 'upcoming' ? t('plans.emptyTitle')
                : activeTab === 'coordinating' ? t('plans.emptyCoordinating')
                : t('plans.emptyDone')}
            </Text>
            {activeTab === 'upcoming' && <Text style={s.emptySub}>{t('plans.emptySub')}</Text>}
          </View>
        ) : activeTab === 'coordinating' ? (
          <View style={s.coordinatingList}>
            {byTab.coordinating.map((p) => (
              <SoftCard key={p.id} style={s.groupCard}>
                <PlanListRow
                  title={p.title}
                  dateLabel={t('plans.coordinatingStatus')}
                  days={0}
                  showDday={false}
                  onPress={() => router.push(`/card/${p.id}` as any)}
                />
              </SoftCard>
            ))}
          </View>
        ) : (
          <View style={s.timeline}>
            {groups.map((group) => (
              <View key={group.key} style={s.group}>
                {group.key !== 'undated' && (
                  <SectionLabel>
                    {t('plans.monthLabel', { month: group.month, year: group.year })}
                  </SectionLabel>
                )}
                <SoftCard style={s.groupCard}>
                  {group.items.map((p, i) => {
                    const dateLabel = [
                      p.confirmed_date ? formatDateLabel(p.confirmed_date, '', language) : '',
                      p.confirmed_time ?? '',
                    ].filter(Boolean).join(' ');
                    return (
                      <View key={p.id}>
                        {i > 0 && <View style={s.rowDivider} />}
                        <PlanListRow
                          title={p.title}
                          dateLabel={dateLabel || t('plans.noDateTimePlace')}
                          days={daysUntilIso(p.confirmed_date)}
                          onPress={() => router.push(`/card/${p.id}` as any)}
                        />
                      </View>
                    );
                  })}
                </SoftCard>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: SP.screen + insets.bottom }]}>
        <BigButton onPress={() => router.push(DATE_MODE_ROUTES.make_course as any)}>
          {t('plans.makeCta')}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: SP.screen, paddingTop: SP.lg, paddingBottom: SP.xxxl },
  loader: { marginTop: DS.component.emptyStateTop },

  timeline: { gap: SP.xxl },
  coordinatingList: { gap: SP.sm },

  group: { gap: SP.sm },
  groupCard: { paddingVertical: SP.xs, paddingHorizontal: SP.lg },
  rowDivider: { height: 1, backgroundColor: C.borderLight },

  emptyWrap: { alignItems: 'center', marginTop: DS.component.emptyStateTop, paddingHorizontal: SP.xxl },
  emptyIcon: {
    width: 120, height: 120, borderRadius: DS.radius.full, backgroundColor: C.pinkLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: SP.xxl,
  },
  emptyTitle: { ...DS.typography.headingLegacy, color: C.text, textAlign: 'center' },
  emptySub: { ...DS.typography.bodyCompact, color: C.textSub, textAlign: 'center', marginTop: SP.md },

  footer: {
    paddingHorizontal: SP.screen,
    paddingTop: SP.md,
    paddingBottom: SP.screen,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    backgroundColor: C.bg,
  },
});
