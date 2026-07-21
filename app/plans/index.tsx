import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { CalendarHeart } from 'lucide-react-native';
import { C, SP, R, G } from '../../constants/theme';
import { BackBar, SoftCard, PlanListRow, BigButton, SectionLabel } from '../../components/ui';
import { formatDateLabel } from '../../components/pickers';
import { DATE_MODE_ROUTES } from '../../lib/dateModes';
import { useI18n } from '../../lib/i18n';

type PlanCard = {
  id: string;
  title: string;
  tags: string[];
  confirmed_date: string | null;
  confirmed_time: string | null;
  confirmed_place: string | null;
};

// PHASE0-BACKMERGE: confirmed_date(ISO) 로부터 D-day 를 계산하는 순수 헬퍼.
// 공유 컴포넌트(DdayBadge)에 넘길 days 값을 만든다. 홈 화면과 동일 규약.
function daysUntilIso(iso: string | null, now: number = Date.now()): number {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86400000);
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
  const [plans, setPlans] = useState<PlanCard[]>([]);
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
            .select('id, title, tags, confirmed_date, confirmed_time, confirmed_place')
            .eq('couple_id', profile.couple_id)
            .eq('status', 'confirmed')
            .order('confirmed_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false });

          setPlans((rows ?? []).map((r) => ({ ...r, tags: r.tags ?? [] })));
        } finally {
          setLoading(false);
        }
      })();
    }, []),
  );

  const groups = useMemo(() => groupByMonth(plans), [plans]);

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <BackBar />

        <View style={s.headingBlock}>
          <Text style={s.heading}>{t('plans.heading')}</Text>
          <Text style={s.sub}>{t('plans.subtitle')}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={C.pink} style={s.loader} />
        ) : plans.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <CalendarHeart size={44} strokeWidth={1.5} color={C.pinkDeep} />
            </View>
            <Text style={s.emptyTitle}>{t('plans.emptyTitle')}</Text>
            <Text style={s.emptySub}>{t('plans.emptySub')}</Text>
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

      <View style={s.footer}>
        <BigButton onPress={() => router.push(DATE_MODE_ROUTES.make_course as any)}>
          {t('plans.makeCta')}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: SP.xxxl },
  headingBlock: { marginTop: SP.lg, marginBottom: SP.xl },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 30 },
  sub: { marginTop: SP.sm, fontSize: 13, color: C.textSub, lineHeight: 19 },
  loader: { marginTop: 60 },

  timeline: { gap: SP.xl },
  group: { gap: SP.sm },
  groupCard: { paddingVertical: SP.xs, paddingHorizontal: SP.lg },
  rowDivider: { height: 1, backgroundColor: C.borderLight },

  emptyWrap: { alignItems: 'center', marginTop: 60, paddingHorizontal: SP.xxl },
  emptyIcon: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: C.pinkLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: SP.xxl,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' },
  emptySub: { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginTop: SP.md },

  footer: {
    paddingHorizontal: SP.xl,
    paddingTop: SP.md,
    paddingBottom: SP.md,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    backgroundColor: C.bg,
  },
});
