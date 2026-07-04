import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { CalendarHeart, Clock, MapPin, Check } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, SoftCard, Chip } from '../../components/ui';

type PlanCard = {
  id: string;
  title: string;
  tags: string[];
  confirmed_date: string | null;
  confirmed_time: string | null;
  confirmed_place: string | null;
};

export default function PlansScreen() {
  const router = useRouter();
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

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <BackBar />

        <View style={s.headingBlock}>
          <Text style={s.heading}>데이트 계획</Text>
          <Text style={s.sub}>확정한 데이트를 모아봤어요. 다녀온 뒤엔 어땠는지 남겨주세요.</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={C.pink} style={s.loader} />
        ) : plans.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={[s.emptyIcon, s.emptyIconBg]}>
              <CalendarHeart size={44} strokeWidth={1.5} color={C.pinkDeep} />
            </View>
            <Text style={s.emptyTitle}>확정한 데이트가 없어요</Text>
            <Text style={s.emptySub}>후보 중 마음에 드는 데이트를{'\n'}"이번 데이트로 정하기"로 확정해보세요.</Text>
          </View>
        ) : (
          <View style={s.planList}>
            {plans.map((p) => (
              <SoftCard key={p.id} onPress={() => router.push(`/card/${p.id}` as any)}>
                <Text style={s.cardTitle}>{p.title}</Text>

                <View style={s.metaList}>
                  {p.confirmed_date && (
                    <View style={s.metaRow}>
                      <CalendarHeart size={14} color={C.pinkDeep} />
                      <Text style={s.metaText}>{p.confirmed_date}</Text>
                    </View>
                  )}
                  {p.confirmed_time && (
                    <View style={s.metaRow}>
                      <Clock size={14} color={C.pinkDeep} />
                      <Text style={s.metaText}>{p.confirmed_time}</Text>
                    </View>
                  )}
                  {p.confirmed_place && (
                    <View style={s.metaRow}>
                      <MapPin size={14} color={C.pinkDeep} />
                      <Text style={s.metaText}>{p.confirmed_place}</Text>
                    </View>
                  )}
                  {!p.confirmed_date && !p.confirmed_time && !p.confirmed_place && (
                    <Text style={s.metaEmpty}>날짜·장소는 아직 정하지 않았어요.</Text>
                  )}
                </View>

                {p.tags.length > 0 && (
                  <View style={s.chips}>
                    {p.tags.slice(0, 3).map((t) => (
                      <Chip key={t} tone="gray">{t}</Chip>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={s.doneBtn}
                  onPress={() => router.push({ pathname: '/card/review', params: { id: p.id } })}
                  activeOpacity={0.85}
                >
                  <Check size={14} color={C.white} strokeWidth={2.5} />
                  <Text style={s.doneBtnText}>데이트 끝났어요 · 어땠어요?</Text>
                </TouchableOpacity>
              </SoftCard>
            ))}
          </View>
        )}

        <View style={s.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  headingBlock: { marginTop: 16, marginBottom: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 30 },
  sub: { marginTop: 6, fontSize: 13, color: C.textSub, lineHeight: 19 },
  loader: { marginTop: 60 },
  planList: { gap: 12, marginTop: 8 },
  bottomSpacer: { height: 40 },

  emptyWrap: { alignItems: 'center', marginTop: 60, paddingHorizontal: 24 },
  emptyIcon: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  emptyIconBg: { backgroundColor: C.pinkLight },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' },
  emptySub: { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginTop: 12 },

  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  metaList: { gap: 6, marginTop: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, color: C.text, fontWeight: '500' },
  metaEmpty: { fontSize: 12, color: C.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 12 },
  doneBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 16, backgroundColor: C.pink,
    borderRadius: 14, paddingVertical: 12,
  },
  doneBtnText: { color: C.white, fontSize: 13, fontWeight: '700' },
});
